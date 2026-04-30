import { NextResponse } from "next/server";
import { fetchOrdersByIds, setExternalOrderIds } from "@/app/_lib/selorax";
import { buildFulflizPayload, createExternalOrders, ordersWithoutSkus } from "@/app/_lib/fulfliz";
import { ensureFulflizMetafieldDefinition } from "@/app/_lib/bootstrap-metafield";
import { FULFLIZ_METAFIELD_PATH } from "@/app/_lib/types";

type Body = { orderIds?: unknown };

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

  const validated = validateOrderIds(body.orderIds);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const requestedIds = validated.ids;

  let orders;
  try {
    orders = await fetchOrdersByIds(requestedIds);
  } catch (err) {
    console.error("[/api/sync] SeloraX re-fetch failed:", err);
    return NextResponse.json(
      { error: "Could not reach SeloraX", retryable: true },
      { status: 502 },
    );
  }

  // Drop orders that are already synced OR have no SKU-bearing items. Both
  // count toward `skipped` so the user sees one number, not two confusing ones.
  const notSynced = orders.filter((o) => !o.metafields?.[FULFLIZ_METAFIELD_PATH]);
  const skuLessIds = new Set(ordersWithoutSkus(notSynced));
  const eligible = notSynced.filter((o) => !skuLessIds.has(o.order_id));

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
    return NextResponse.json({ ok: true, synced: 0, skipped });
  }

  const payloads = eligible.map(buildFulflizPayload);
  const fulflizResult = await createExternalOrders(payloads);
  if (!fulflizResult.ok) {
    console.error("[/api/sync] FulFliz rejected:", fulflizResult.status, fulflizResult.error);
    return NextResponse.json(
      { error: `FulFliz: ${fulflizResult.error || "unknown error"}`, retryable: true },
      { status: 502 },
    );
  }

  // Match returned external IDs to our orders by order_number (the only stable
  // identifier in both directions). FulFliz echoes order_number per entry.
  const byOrderNumber = new Map(
    fulflizResult.data
      .filter((d) => d.order_number && d.extranalOrderId)
      .map((d) => [d.order_number, d.extranalOrderId]),
  );

  const tagEntries: Array<{ order_id: number; external_order_id: string }> = [];
  for (const o of eligible) {
    const key = o.store_serial_order_no ?? String(o.order_id);
    const extId = byOrderNumber.get(key);
    if (extId) tagEntries.push({ order_id: o.order_id, external_order_id: extId });
  }

  if (tagEntries.length === 0) {
    console.warn(
      "[/api/sync] FulFliz returned no extranalOrderId — orders sent but not tagged. Response:",
      JSON.stringify(fulflizResult.data).slice(0, 500),
    );
    return NextResponse.json({
      ok: true,
      synced: eligible.length,
      skipped,
      warning: "Submitted, but FulFliz returned no IDs. Check FulFliz dashboard.",
    });
  }

  try {
    const bootstrap = await ensureFulflizMetafieldDefinition();
    if (bootstrap.available) {
      await setExternalOrderIds(tagEntries);
    } else {
      // Metafield tables not installed in this environment — orders are in
      // FulFliz, we just can't persist the back-link. Log once per process for
      // visibility, but don't surface a warning to the user since this is a
      // known/expected configuration, not a failure.
      console.info(
        "[/api/sync] Metafield tables not installed — skipping tracking write. " +
          "Run SeloraX-Backend/migrations/2026-03-09-app-metafields.sql to enable.",
      );
    }
  } catch (err) {
    console.error("[/api/sync] Metafield write failed after FulFliz success:", err);
    return NextResponse.json({
      ok: true,
      synced: eligible.length,
      skipped,
      warning: "Tracking write failed — orders ARE in FulFliz but not tagged in SeloraX. See logs.",
    });
  }

  return NextResponse.json({ ok: true, synced: eligible.length, skipped });
}
