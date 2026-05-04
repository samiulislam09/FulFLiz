import { NextResponse } from "next/server";
import { fetchOrdersByIds, setExternalOrderIds } from "@/app/_lib/selorax";
import { buildFulflizPayload, createExternalOrders, ordersWithoutSkus } from "@/app/_lib/fulfliz";
import { ensureFulflizMetafieldDefinitions } from "@/app/_lib/bootstrap-metafield";
import { loadFulflizCredentials } from "@/app/_lib/credentials";
import { logSyncEvent } from "@/app/_lib/logger";
import { FULFLIZ_METAFIELD_PATH, type FulflizPayload } from "@/app/_lib/types";

type Body = { storeId?: unknown; orderIds?: unknown };

function validateStoreId(input: unknown): { ok: true; storeId: string } | { ok: false; error: string } {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "storeId is required" };
  }
  // Trust but verify: SeloraX backend rejects requests for stores where this
  // app isn't installed, so a forged storeId from the browser can only ever
  // access stores the merchant has already authorized this app on.
  if (!/^\d+$/.test(input.trim())) {
    return { ok: false, error: "storeId must be numeric" };
  }
  return { ok: true, storeId: input.trim() };
}

function validateOrderIds(input: unknown): { ok: true; ids: number[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "orderIds must be an array" };
  if (input.length === 0) return { ok: false, error: "orderIds must not be empty" };
  if (input.length > 500) return { ok: false, error: "orderIds capped at 500 per request" };
  const ids: number[] = [];
  for (const v of input) {
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
      return { ok: false, error: "orderIds must be positive integers" };
    }
    ids.push(v);
  }
  return { ok: true, ids };
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storeValidated = validateStoreId(body.storeId);
  if (!storeValidated.ok) return NextResponse.json({ error: storeValidated.error }, { status: 400 });
  const storeId = storeValidated.storeId;

  const validated = validateOrderIds(body.orderIds);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  const requestedIds = validated.ids;

  const credsResult = await loadFulflizCredentials(storeId);
  if (credsResult.state !== "ready") {
    return NextResponse.json(
      {
        error:
          credsResult.state === "tables-not-installed"
            ? "Metafield tables aren't installed."
            : "FulFliz credentials are missing for this store. Open the app and complete setup.",
      },
      { status: 400 },
    );
  }
  const creds = credsResult.credentials;

  // Accumulate everything we observe during this request. logSyncEvent() is
  // called exactly once per exit path (after we've reached the SeloraX fetch),
  // capturing the full lifecycle so a viewer can replay what happened.
  let eligibleOrderIds: number[] = [];
  let skippedOrderIds: number[] = [];
  let payloads: FulflizPayload[] = [];
  let fulflizError: Parameters<typeof logSyncEvent>[0]["fulflizError"];
  let metafieldWrite: Parameters<typeof logSyncEvent>[0]["metafieldWrite"];

  let orders;
  try {
    orders = await fetchOrdersByIds(storeId, requestedIds);
  } catch (err) {
    console.error("[/api/sync] SeloraX re-fetch failed:", err);
    await logSyncEvent({
      storeId,
      requestedOrderIds: requestedIds,
      eligibleOrderIds: [],
      skippedOrderIds: [],
      fulflizPayloads: [],
      fulflizError: {
        status: 502,
        code: "selorax_unreachable",
        message: "Could not reach SeloraX",
        details: String((err as Error)?.message ?? err).slice(0, 1500),
      },
      result: { ok: false, synced: 0, skipped: 0, warning: "SeloraX unreachable" },
    });
    return NextResponse.json(
      { error: "Could not reach SeloraX", retryable: true },
      { status: 502 },
    );
  }

  const notSynced = orders.filter((o) => !o.metafields?.[FULFLIZ_METAFIELD_PATH]);
  const skuLessIds = new Set(ordersWithoutSkus(notSynced));
  const eligible = notSynced.filter((o) => !skuLessIds.has(o.order_id));
  eligibleOrderIds = eligible.map((o) => o.order_id);
  skippedOrderIds = Array.from(skuLessIds);

  if (skuLessIds.size > 0) {
    const droppedSummary = notSynced
      .filter((o) => skuLessIds.has(o.order_id))
      .map((o) => ({
        order_id: o.order_id,
        store_serial_order_no: o.store_serial_order_no,
        items: o.items.map((it) => ({
          name: it.name,
          variant_id: it.variant_id,
          sku: it.sku,
          quantity: it.quantity,
        })),
      }));
    console.warn(
      `[/api/sync] Dropping ${skuLessIds.size} order(s) with no SKU-bearing items:\n${JSON.stringify(droppedSummary, null, 2)}`,
    );
  }

  const skipped = requestedIds.length - eligible.length;

  if (eligible.length === 0) {
    await logSyncEvent({
      storeId,
      requestedOrderIds: requestedIds,
      eligibleOrderIds,
      skippedOrderIds,
      fulflizPayloads: [],
      result: { ok: true, synced: 0, skipped },
    });
    return NextResponse.json({ ok: true, synced: 0, skipped });
  }

  payloads = eligible.map((o) => buildFulflizPayload(o, creds));

  const skuBreakdown = eligible.map((o) => ({
    order_id: o.order_id,
    items: o.items
      .filter((it) => (it.quantity ?? 0) > 0)
      .map((it) => ({
        name: it.name,
        variant_id: it.variant_id,
        sku: it.sku,
        will_be_sent: typeof it.sku === "string" && it.sku.trim() !== "",
        quantity: it.quantity,
      })),
  }));
  console.log(
    `[/api/sync] SKU breakdown for ${eligible.length} order(s):\n${JSON.stringify(skuBreakdown, null, 2)}`,
  );

  const fulflizResult = await createExternalOrders(payloads, creds);
  if (!fulflizResult.ok) {
    fulflizError = {
      status: fulflizResult.status,
      code: fulflizResult.code,
      message: fulflizResult.message,
      hint: fulflizResult.hint,
      details: fulflizResult.details,
    };
    console.error(
      `[/api/sync] FulFliz rejected (${fulflizResult.code}, HTTP ${fulflizResult.status}):`,
      fulflizResult.details,
    );
    await logSyncEvent({
      storeId,
      requestedOrderIds: requestedIds,
      eligibleOrderIds,
      skippedOrderIds,
      fulflizPayloads: payloads,
      fulflizError,
      result: { ok: false, synced: 0, skipped, warning: fulflizResult.message },
    });
    return NextResponse.json(
      {
        error: fulflizResult.message,
        code: fulflizResult.code,
        hint: fulflizResult.hint,
        details: fulflizResult.details,
        retryable: true,
      },
      { status: 502 },
    );
  }
  const fulflizResponse: unknown = fulflizResult.data;

  // Match returned external IDs to our orders by order_number.
  const byOrderNumber = new Map<string, string>();
  for (const d of fulflizResult.data) {
    if (!d.order_number) continue;
    const externalId =
      (d as { extranalOrderId?: string }).extranalOrderId ||
      (d.products?.find((p) => p.extranalOrderId)?.extranalOrderId) ||
      (d as { id?: string }).id;
    if (externalId) byOrderNumber.set(String(d.order_number), externalId);
  }

  const tagEntries: Array<{ order_id: number; external_order_id: string }> = [];
  for (const o of eligible) {
    // Match on order_id — same key buildFulflizPayload() sends as order_number.
    const extId = byOrderNumber.get(String(o.order_id));
    if (extId) tagEntries.push({ order_id: o.order_id, external_order_id: extId });
  }

  if (tagEntries.length === 0) {
    const warning =
      "Submitted, but couldn't match FulFliz response to any order. Check FulFliz dashboard and server logs.";
    console.warn(
      "[/api/sync] Could not match FulFliz response back to any submitted order. " +
        "Order_number values we sent: " +
        JSON.stringify(eligible.map((o) => String(o.order_id))) +
        ". FulFliz response: " +
        JSON.stringify(fulflizResult.data).slice(0, 800),
    );
    await logSyncEvent({
      storeId,
      requestedOrderIds: requestedIds,
      eligibleOrderIds,
      skippedOrderIds,
      fulflizPayloads: payloads,
      fulflizResponse,
      result: { ok: true, synced: eligible.length, skipped, warning },
    });
    return NextResponse.json({
      ok: true,
      synced: eligible.length,
      skipped,
      warning,
    });
  }

  console.log(
    `[/api/sync] tagging ${tagEntries.length} order(s) with metafield: ${JSON.stringify(tagEntries)}`,
  );

  try {
    const bootstrap = await ensureFulflizMetafieldDefinitions(storeId);
    if (bootstrap.available) {
      await setExternalOrderIds(storeId, tagEntries);
      metafieldWrite = { tagged: tagEntries };
    } else {
      console.info(
        "[/api/sync] Metafield tables not installed — skipping tracking write.",
      );
    }
  } catch (err) {
    console.error("[/api/sync] Metafield write failed after FulFliz success:", err);
    const warning =
      "Tracking write failed — orders ARE in FulFliz but not tagged in SeloraX. See logs.";
    await logSyncEvent({
      storeId,
      requestedOrderIds: requestedIds,
      eligibleOrderIds,
      skippedOrderIds,
      fulflizPayloads: payloads,
      fulflizResponse,
      result: { ok: true, synced: eligible.length, skipped, warning },
    });
    return NextResponse.json({
      ok: true,
      synced: eligible.length,
      skipped,
      warning,
    });
  }

  await logSyncEvent({
    storeId,
    requestedOrderIds: requestedIds,
    eligibleOrderIds,
    skippedOrderIds,
    fulflizPayloads: payloads,
    fulflizResponse,
    metafieldWrite,
    result: { ok: true, synced: eligible.length, skipped },
  });
  return NextResponse.json({ ok: true, synced: eligible.length, skipped });
}
