import "server-only";
import { env } from "./env";
import { FULFLIZ_METAFIELD_PATH, type SeloraxListResponse, type SeloraxOrder } from "./types";

// Backend caps `limit` at 250 (SeloraX-Backend/routers/apps/v1/orders.js:392).
const BACKEND_LIMIT_CAP = 250;

function seloraxHeaders(storeId: string) {
  return {
    "Content-Type": "application/json",
    "X-Client-Id": env.SELORAX_CLIENT_ID,
    "X-Client-Secret": env.SELORAX_CLIENT_SECRET,
    "X-Store-Id": storeId,
  };
}

// undici wraps low-level network errors (ECONNREFUSED, ENOTFOUND, etc.) under
// a generic "TypeError: fetch failed" — the actionable detail lives in `cause`.
// Surface it so deployment misconfigurations are obvious in the logs.
async function seloraxFetch(url: URL | string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const detail = cause?.code
      ? `${cause.code}${cause.message ? ` — ${cause.message}` : ""}`
      : (err as Error).message;
    throw new Error(`Could not reach SeloraX at ${url.toString()}: ${detail}`);
  }
}

// Mirrors the dashboard's "Ready to Ship" tab filter shape exactly — see
// SeloraX-dashboard/app/[slug]/orders/page.js (`3pl-requested` config).
//
// NOTE: the courier filter uses `dataType: "text"` + `type: "select"`, which
// is unhandled in models/order.js → generateFilterCondition (returns "").
// This means the courier filter is silently a no-op, exactly like the dashboard.
// Counts here will match the dashboard's "Ready to Ship" total. If you want
// a strict steadfast/pathao filter, swap the courier entry to
// { dataType: "select", type: "is", value: ["steadfast", "pathao"] }.
function approvedCourierFilters() {
  return [
    {
      name: "order_status",
      type: "is",
      tableAlias: "o",
      dataType: "select",
      value: ["processing"],
    },
    {
      name: "tracking_code",
      type: "is_not_empty",
      tableAlias: "o",
      dataType: "text",
      value: "",
    },
    {
      name: "courier",
      type: "select",
      tableAlias: "o",
      dataType: "text",
      value: ["steadfast", "pathao"],
    },
  ];
}

async function postFilters(storeId: string, body: unknown): Promise<SeloraxListResponse> {
  const url = `${env.APP_API_URL}/api/apps/v1/orders/filters`;
  const res = await seloraxFetch(url, {
    method: "POST",
    headers: seloraxHeaders(storeId),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SeloraX /orders/filters failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as SeloraxListResponse;
}

export async function listProcessingOrdersWithCourier(
  storeId: string,
  options: { page?: number; limit?: number } = {},
): Promise<SeloraxListResponse> {
  const { page = 1, limit = 50 } = options;
  return postFilters(storeId, {
    filters: approvedCourierFilters(),
    // Hide orders we've already synced to FulFliz so the table is a true
    // "to-do" list. Backed by the metafield write the route handler does
    // after a successful sync.
    exclude_metafields: [{ namespace: "fulfliz", key: "external_order_id" }],
    page,
    limit,
    sort: "created_at",
    order: "DESC",
  });
}

export type SentOrdersResult = {
  data: SeloraxOrder[];
  pagination: { page: number; limit: number; total: number };
  // True when the unfiltered ready-to-ship set (processing + tracking_code)
  // hit the backend's 250-row cap. Means older sent orders may be missing
  // from this view. The page surfaces this as a banner so it's not silent.
  truncated: boolean;
};

/**
 * Returns orders that have already been sent to FulFliz (i.e. have the
 * `fulfliz.external_order_id` metafield set), within the same "ready to ship"
 * universe as listProcessingOrdersWithCourier.
 *
 * Implementation note: the backend supports `exclude_metafields` but not the
 * inverse. We fetch the most recent BACKEND_LIMIT_CAP ready-to-ship orders,
 * filter client-side for the ones with the metafield, then paginate the
 * filtered set ourselves. This is bounded by BACKEND_LIMIT_CAP — if a store
 * has more than that many simultaneous ready-to-ship orders, older sent
 * orders won't appear here. `truncated` flags that case.
 */
export async function listSentOrders(
  storeId: string,
  options: { page?: number; limit?: number } = {},
): Promise<SentOrdersResult> {
  const { page = 1, limit = 25 } = options;
  const all = await postFilters(storeId, {
    filters: approvedCourierFilters(),
    page: 1,
    limit: BACKEND_LIMIT_CAP,
    sort: "created_at",
    order: "DESC",
  });
  const sent = all.data.filter((o) => Boolean(o.metafields?.[FULFLIZ_METAFIELD_PATH]));
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    data: sent.slice(start, end),
    pagination: { page, limit, total: sent.length },
    truncated: all.data.length >= BACKEND_LIMIT_CAP,
  };
}

export async function fetchOrdersByIds(storeId: string, orderIds: number[]): Promise<SeloraxOrder[]> {
  if (orderIds.length === 0) return [];
  const filters = [
    ...approvedCourierFilters(),
    {
      name: "order_id",
      type: "is",
      tableAlias: "o",
      dataType: "select",
      value: orderIds,
    },
  ];
  const json = await postFilters(storeId, { filters, page: 1, limit: 500 });
  return json.data;
}

export async function setExternalOrderIds(
  storeId: string,
  entries: Array<{ order_id: number; external_order_id: string }>,
): Promise<void> {
  if (entries.length === 0) return;
  const url = `${env.APP_API_URL}/api/apps/v1/metafields/values`;
  const body = {
    metafields: entries.map(({ order_id, external_order_id }) => ({
      namespace: "fulfliz",
      key: "external_order_id",
      resource_type: "order",
      resource_id: order_id,
      value: external_order_id,
    })),
  };
  const res = await seloraxFetch(url, {
    method: "POST",
    headers: seloraxHeaders(storeId),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SeloraX metafield write failed: ${res.status} ${text.slice(0, 200)}`);
  }
}
