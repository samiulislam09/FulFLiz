import "server-only";
import { env } from "./env";
import type {
  FulflizCreatedOrder,
  FulflizPayload,
  FulflizResponse,
  SeloraxOrder,
} from "./types";

// TEMPORARY: placeholder SKU used when an order_item's variant has no
// sku_code in product_variant_option_combinations. FulFliz requires a SKU,
// and we want to get the rest of the integration tested end-to-end before
// the merchant backfills real SKUs in the catalog. Replace this fallback
// (or remove it and re-enable the SKU-less filter) once SKUs are populated.
const FALLBACK_SKU = "SKU-7955-27007";

export function buildFulflizPayload(order: SeloraxOrder): FulflizPayload {
  // FulFliz requires string for order_number — coerce regardless of how MySQL
  // returns store_serial_order_no (often numeric for purely-digit values).
  const orderNumber =
    order.store_serial_order_no !== null && order.store_serial_order_no !== undefined
      ? String(order.store_serial_order_no)
      : String(order.order_id);

  return {
    apiSecret: env.FULFLIZ_API_SECRET,
    courier_cn_id: String(order.tracking_code ?? ""),
    order_number: orderNumber,
    merchant_name: env.FULFLIZ_MERCHANT_NAME,
    currier_name: String(order.courier ?? ""),
    products: order.items
      .filter((it) => (it.quantity ?? 0) > 0)
      .map((it) => ({
        sku: it.sku ? String(it.sku) : FALLBACK_SKU,
        quantity: Number(it.quantity),
      })),
  };
}

// Returns a list of order_ids whose products[] would be empty (no items at
// all, or only zero-quantity items). With the FALLBACK_SKU above, missing
// SKUs no longer cause an order to be dropped — only structurally empty
// orders are skipped now.
export function ordersWithoutSkus(orders: SeloraxOrder[]): number[] {
  return orders
    .filter((o) => !o.items.some((it) => (it.quantity ?? 0) > 0))
    .map((o) => o.order_id);
}

export async function createExternalOrders(
  payloads: FulflizPayload[],
): Promise<{ ok: true; data: FulflizCreatedOrder[] } | { ok: false; status: number; error: string }> {
  const url = `${env.FULFLIZ_API_BASE_URL}/external/orders/${env.FULFLIZ_CLIENT_ID}`;

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
    return { ok: false, status: res.status, error: text.slice(0, 500) };
  }

  const json = (await res.json()) as FulflizResponse;
  if (!json.status || !Array.isArray(json.data)) {
    return { ok: false, status: 502, error: `Malformed response: ${JSON.stringify(json).slice(0, 300)}` };
  }
  return { ok: true, data: json.data };
}
