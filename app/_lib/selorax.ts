import "server-only";
import { env } from "./env";
import type { SeloraxListResponse, SeloraxOrder } from "./types";

function seloraxHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Client-Id": env.SELORAX_CLIENT_ID,
    "X-Client-Secret": env.SELORAX_CLIENT_SECRET,
    "X-Store-Id": env.STORE_ID,
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

async function postFilters(body: unknown): Promise<SeloraxListResponse> {
  const url = `${env.APP_API_URL}/api/apps/v1/orders/filters`;
  const res = await seloraxFetch(url, {
    method: "POST",
    headers: seloraxHeaders(),
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
  options: { page?: number; limit?: number } = {},
): Promise<SeloraxListResponse> {
  const { page = 1, limit = 50 } = options;
  return postFilters({
    filters: approvedCourierFilters(),
    page,
    limit,
    sort: "created_at",
    order: "DESC",
  });
}

export async function fetchOrdersByIds(orderIds: number[]): Promise<SeloraxOrder[]> {
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
  const json = await postFilters({ filters, page: 1, limit: 500 });
  return json.data;
}

export async function setExternalOrderIds(
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
    headers: seloraxHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SeloraX metafield write failed: ${res.status} ${text.slice(0, 200)}`);
  }
}
