import "server-only";
import { env } from "./env";
import type { FulflizCredentials } from "./credentials";
import type {
  FulflizCreatedOrder,
  FulflizPayload,
  FulflizResponse,
  SeloraxOrder,
} from "./types";

export function buildFulflizPayload(
  order: SeloraxOrder,
  creds: FulflizCredentials,
): FulflizPayload {
  // FulFliz requires string for order_number — coerce regardless of how MySQL
  // returns store_serial_order_no (often numeric for purely-digit values).
  const orderNumber =
    order.store_serial_order_no !== null && order.store_serial_order_no !== undefined
      ? String(order.store_serial_order_no)
      : String(order.order_id);

  return {
    apiSecret: creds.apiSecret,
    courier_cn_id: String(order.tracking_code ?? ""),
    order_number: orderNumber,
    merchant_name: creds.merchantName,
    currier_name: String(order.courier ?? ""),
    // Only items with a real SKU are sent. Items missing a sku_code in
    // product_variant_option_combinations are dropped per-item; orders that
    // end up with no items at all are caught by ordersWithoutSkus() and
    // skipped before ever calling FulFliz.
    products: order.items
      .filter((it) => it.sku && (it.quantity ?? 0) > 0)
      .map((it) => ({
        sku: String(it.sku),
        quantity: Number(it.quantity),
      })),
  };
}

// Returns order_ids whose products[] would be empty after the SKU filter.
// The route handler counts these as `skipped` and surfaces a notice instead
// of submitting an empty payload to FulFliz.
export function ordersWithoutSkus(orders: SeloraxOrder[]): number[] {
  return orders
    .filter((o) => !o.items.some((it) => it.sku && (it.quantity ?? 0) > 0))
    .map((o) => o.order_id);
}

// Known FulFliz error patterns mapped to user-friendly messages. Add more
// entries as we observe them in the wild.
function parseFulflizError(
  rawBody: string,
  payloads: FulflizPayload[],
): { code: string; message: string; hint?: string } {
  let parsed: { error?: string; message?: string } = {};
  try {
    parsed = JSON.parse(rawBody) as { error?: string; message?: string };
  } catch {
    /* not JSON — fall through */
  }
  const fulflizMessage = parsed?.error ?? parsed?.message ?? rawBody;

  if (/extranalOrderProducts_sku_fkey/i.test(fulflizMessage)) {
    const allSkus = Array.from(
      new Set(payloads.flatMap((p) => p.products.map((it) => it.sku))),
    );
    return {
      code: "sku_not_registered",
      message: "One or more SKUs aren't registered in FulFliz.",
      hint:
        allSkus.length > 0
          ? `Register these SKUs in your FulFliz merchant panel, then retry: ${allSkus.join(", ")}`
          : "Register the missing SKUs in your FulFliz merchant panel and retry.",
    };
  }

  if (/Foreign key constraint violated.*courier/i.test(fulflizMessage)) {
    return {
      code: "courier_not_registered",
      message: "FulFliz doesn't recognize the courier name.",
      hint: "Verify the courier name on the order matches one FulFliz supports.",
    };
  }

  if (/Foreign key constraint violated/i.test(fulflizMessage)) {
    return {
      code: "fk_violation",
      message: "FulFliz rejected the order — one of the referenced values isn't registered there.",
      hint: "Check the SKUs, courier name, or merchant name on the failing order.",
    };
  }

  if (/apiSecret|invalid.*secret|unauthor/i.test(fulflizMessage)) {
    return {
      code: "auth_failed",
      message: "FulFliz rejected the API credentials.",
      hint: "Re-check the FulFliz API secret in setup.",
    };
  }

  return {
    code: "unknown",
    message: parsed?.message || "FulFliz rejected the request.",
  };
}

export async function createExternalOrders(
  payloads: FulflizPayload[],
  creds: FulflizCredentials,
): Promise<
  | { ok: true; data: FulflizCreatedOrder[] }
  | { ok: false; status: number; code: string; message: string; hint?: string; details: string }
> {
  const url = `${env.FULFLIZ_API_BASE_URL}/external/orders/${creds.clientId}`;

  // Log payload for debugging. apiSecret is redacted so this is safe to leave
  // on in dev; remove if you don't want it in production logs.
  const redacted = payloads.map((p) => ({ ...p, apiSecret: "[redacted]" }));
  console.log(
    `[fulfliz] POST ${url}\n${JSON.stringify(redacted, null, 2)}`,
  );

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloads),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const parsed = parseFulflizError(text, payloads);
    return { ok: false, status: res.status, ...parsed, details: text.slice(0, 1500) };
  }

  const json = (await res.json()) as FulflizResponse;
  console.log(`[fulfliz] response\n${JSON.stringify(json, null, 2)}`);

  if (!json.status || !Array.isArray(json.data)) {
    const raw = JSON.stringify(json);
    const parsed = parseFulflizError(raw, payloads);
    return { ok: false, status: 502, ...parsed, details: raw.slice(0, 1500) };
  }
  return { ok: true, data: json.data };
}
