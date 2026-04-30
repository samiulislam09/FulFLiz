# FulFliz Order Sync — Design Spec

**Date:** 2026-04-30
**App:** `apps/fulfliz/` (Next.js 16.2.4, React 19.2.4)
**Touches:** `apps/fulfliz/`, `SeloraX-Backend/routers/apps/v1/orders.js`

## 1. Goal

Let an operator pull SeloraX orders that are in `processing` status **and** have a courier assigned, pick a subset (or all) via checkboxes, and submit them as a single batch to FulFliz's Create External Order API. Track which orders have been sent so they cannot be sent twice.

## 2. Non-goals

- No editing of order fields in this UI (read-only list).
- No FulFliz status sync back into SeloraX after creation.
- No multi-store support — the app reads `STORE_ID` from `.env` and operates on one store.
- No automated tests in v1 (matches parent project pattern). Manual smoke checklist only.
- No retry queues, no job runners, no webhooks. The user clicks, the request runs, the result returns synchronously.

## 3. External contracts

### 3.1 SeloraX (source) — modified

`GET {APP_API_URL}/api/apps/v1/orders` with these new behaviours added by this work:

- Query params extended:
  - `has_courier=1` (where clause: `AND o.courier IS NOT NULL AND o.courier <> ''`).
  - `order_ids=12,34,56` (where clause: `AND o.order_id IN (?, ?, ?)`). Comma-separated, integers only, capped at 500 per request to keep the IN-clause sane. Used by the route handler to re-fetch a known set without paging.
- Existing `order_status` and pagination params unchanged.
- SELECT projection extended to include: `o.courier`, `o.courier_id`, `o.tracking_code`, `o.store_serial_order_no`.
- LEFT JOIN `app_metafield_values` (filtered by the calling `app_id`) so each order row carries a `metafields` map of the form `{ "<namespace>.<key>": "<value>" }`. Generic — not coupled to FulFliz.
- LEFT JOIN `order_items` + `product_variants` so each order row carries `items: [{ sku, quantity }]`.

Auth headers (existing, unchanged): `X-Client-Id`, `X-Client-Secret`, `X-Store-Id`.

Response example after the changes:

```json
{
  "data": [
    {
      "order_id": 12345,
      "store_serial_order_no": "1042",
      "order_status": "processing",
      "courier": "Pathao",
      "courier_id": "PATHAO-123",
      "tracking_code": "PATHAO-CN-998877",
      "grand_total": 1250,
      "created_at": "2026-04-29T10:00:00Z",
      "items": [{ "sku": "SKU-RED-M", "quantity": 2 }],
      "metafields": { "fulfliz.external_order_id": null }
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 8 },
  "status": 200
}
```

`POST {APP_API_URL}/api/apps/v1/metafields/values` (existing, unchanged) is used to record `fulfliz.external_order_id` per synced order. Batch shape is used:

```json
{
  "metafields": [
    {
      "namespace": "fulfliz",
      "key": "external_order_id",
      "resource_type": "order",
      "resource_id": 12345,
      "value": "<extranalOrderId from FulFliz>"
    }
  ]
}
```

The metafield definition (`namespace='fulfliz', key='external_order_id', value_type='string', resource_type='order'`) is bootstrapped lazily on the first sync via `POST /api/apps/v1/metafields/definitions`. A 409 response (already exists) is treated as success.

### 3.2 FulFliz (destination)

`POST {FULFLIZ_API_BASE_URL}/external/orders/{FULFLIZ_CLIENT_ID}` with body shape:

```json
[
  {
    "apiSecret": "{FULFLIZ_API_SECRET}",
    "courier_cn_id": "{order.tracking_code}",
    "order_number": "{order.store_serial_order_no}",
    "merchant_name": "{FULFLIZ_MERCHANT_NAME}",
    "currier_name": "{order.courier}",
    "products": [{ "sku": "...", "quantity": 2 }]
  }
]
```

`currier_name` is intentionally misspelled — that's the field name FulFliz's API expects. Do not "fix" it.

Success response (per FulFliz docs):

```json
{
  "status": true,
  "message": "Extranal Orders created successfully",
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "courier_cn_id": "...",
      "courier_name": "...",
      "merchant_name": "...",
      "order_number": "...",
      "extranalOrderId": "uuid",
      "products": [{ "id": "...", "sku": "...", "quantity": 2, "extranalOrderId": "..." }]
    }
  ]
}
```

The `extranalOrderId` (top-level per-order) is what we persist as the SeloraX metafield value.

## 4. Field mapping

| FulFliz field | SeloraX source | Notes |
|---|---|---|
| `apiSecret` | env `FULFLIZ_API_SECRET` | per-payload, never logged |
| `courier_cn_id` | `order.tracking_code` | required by FulFliz |
| `order_number` | `order.store_serial_order_no` | merchant-facing reference, not the global PK |
| `merchant_name` | env `FULFLIZ_MERCHANT_NAME` | one app instance = one merchant |
| `currier_name` | `order.courier` | sic — matches FulFliz spec |
| `products[].sku` | from JOINed `product_variants.sku` | per-line-item |
| `products[].quantity` | `order_items.quantity` | per-line-item |

## 5. Architecture

Three trust zones:

```
[Browser]                    [Next.js server]                  [SeloraX backend]   [FulFliz API]
                                                                     |                  |
Server Component ─────renders OrdersTable shell                      |                  |
   |  fetch with creds ─────────────────────────────────────────────►|                  |
   |◄────────────────────── orders + metafields + items ─────────────|                  |
   |                                                                 |                  |
Client Component (OrdersTable)                                       |                  |
   user picks N rows, clicks Sync                                    |                  |
   POST /api/sync {orderIds} ────►Route Handler                      |                  |
                                       re-fetch by IDs ─────────────►|                  |
                                       drop already-synced           |                  |
                                       build payload                 |                  |
                                       POST batch ─────────────────────────────────────►|
                                  ◄────────────────────────────────────── data[] ───────|
                                       bootstrap definition (idempotent)                |
                                       POST batch metafields ───────►|                  |
                                  ◄──────────────────── 200 ─────────|                  |
   ◄──────────────────────── { ok, synced, skipped } ────────────────|                  |
   router.refresh() reloads list
```

**Why a Route Handler re-fetches the orders by ID instead of trusting the client's payload:** the browser only chooses *which* orders, not *what's in them*. A tampered request cannot smuggle arbitrary `sku` or `courier_cn_id` values into FulFliz.

**Server-only modules:** every file in `app/_lib/` starts with `import "server-only"` so a future Client Component import is a build error, not a runtime secret leak.

## 6. File layout

```
SeloraX-Backend/
└── routers/apps/v1/orders.js       # MODIFY — list endpoint additions

apps/fulfliz/
├── .env                            # ADD — FULFLIZ_* vars
├── app/
│   ├── page.tsx                    # REWRITE — Server Component, renders OrdersTable
│   ├── layout.tsx                  # KEEP — already minimal
│   ├── error.tsx                   # NEW — error boundary with reset()
│   ├── _components/
│   │   ├── OrdersTable.tsx         # NEW — Client Component, table + checkboxes
│   │   ├── SyncButton.tsx          # NEW — Client Component, isolated for useTransition
│   │   └── EmptyState.tsx          # NEW — "no processing orders with courier"
│   ├── api/sync/route.ts           # NEW — POST handler, the only mutation surface
│   └── _lib/
│       ├── env.ts                  # NEW — typed env loader, throws at boot if any var missing
│       ├── selorax.ts              # NEW — server-only SeloraX HTTP client
│       ├── fulfliz.ts              # NEW — server-only FulFliz HTTP client
│       ├── bootstrap-metafield.ts  # NEW — idempotent definition ensure
│       └── types.ts                # NEW — SeloraxOrder, FulflizOrderPayload, etc.
└── docs/superpowers/specs/
    └── 2026-04-30-fulfliz-order-sync-design.md   # this file
```

No new runtime dependencies. Tailwind v4 + React 19 cover everything: native `<input type="checkbox">`, `useTransition`, inline status text instead of a toast library.

## 7. Environment variables

New vars in `apps/fulfliz/.env`:

```
FULFLIZ_API_BASE_URL=https://api.fulfliz.com/api/v1
FULFLIZ_CLIENT_ID=<uuid from FulFliz merchant panel — goes in URL path>
FULFLIZ_API_SECRET=<from FulFliz merchant panel — goes in payload>
FULFLIZ_MERCHANT_NAME=<merchant display name>
```

Existing vars unchanged: `SELORAX_CLIENT_ID`, `SELORAX_CLIENT_SECRET`, `STORE_ID`, `APP_API_URL`, `APP_URL`.

`app/_lib/env.ts` reads each with a runtime check and throws if any are missing. Done at module top-level so a misconfigured deploy fails on startup, not on first request.

## 8. Route handler logic — `POST /api/sync`

Request body: `{ orderIds: number[] }`.

```
1. Validate body: orderIds is non-empty array of positive integers, length <= 500;
   reject 400 otherwise.
2. Re-fetch from SeloraX with order_status=processing&has_courier=1
   &order_ids=<comma-joined orderIds>. Single request — the order_ids filter
   means no pagination loop.
3. Compute the eligible set:
     eligible = re-fetched orders where metafields["fulfliz.external_order_id"]
                is null/missing.
   Anything in orderIds but NOT in eligible counts as skipped — covers both
   "status/courier changed since list" and "already synced".
4. If eligible is empty, return 200 { ok: true, synced: 0,
   skipped: orderIds.length }.
5. Build FulFliz payload (one entry per eligible order).
6. POST to FulFliz.
   - On non-2xx: return 502 { error, retryable: true }, write nothing.
   - On 2xx but malformed (no data[]): return 200 { ok: true, warning: "..." },
     write nothing.
7. Bootstrap metafield definition if missing (one extra GET per sync; 409 = ok).
8. Batch POST to SeloraX /metafields/values with extranalOrderId per order.
   - On failure: return 200 { ok: true, warning: "tracking write failed; check
     logs" } and console.error the body. The orders ARE in FulFliz; we just
     couldn't tag them.
9. Return 200 { ok: true, synced: eligible.length,
   skipped: orderIds.length - eligible.length }.
```

## 9. Error handling matrix

| Failure | Behaviour | User-visible |
|---|---|---|
| SeloraX list call fails (Server Component) | Throw → `app/error.tsx` boundary | "Couldn't load orders. Retry." |
| SeloraX 5xx during sync | Handler returns 502, no writes | Red banner: "Sync failed (network). Try again." Selection preserved. |
| Order changed status / lost courier between list and submit | Silently dropped, counted as `skipped` | Notice: "23 sent, 2 skipped (status changed)." |
| Order already has `fulfliz.external_order_id` | Silently dropped, counted as `skipped` | Same notice |
| FulFliz non-2xx | Handler returns 502, no metafield writes | Red banner: "FulFliz rejected the request: <message>" |
| FulFliz 2xx but malformed body | 200 with `warning`, no metafield writes | Yellow banner: "Submitted, but some IDs not returned. Check FulFliz dashboard." |
| Metafield write fails after FulFliz success | 200 with `warning`, log loudly | Yellow banner: "tracking write failed: see logs" |
| Bootstrap definition POST 409 | Treated as success | Invisible |
| Empty selection | Submit button disabled in UI; handler also rejects 400 | Disabled button, tooltip "Select at least one order" |
| Bad SeloraX creds | 401 bubbles at first page load | Error page: "App is not configured correctly" |

**Concurrency:** submit button uses `useTransition`, disabled while `isPending`. Single-flight per click. Server has no global lock; relies on the disable + the "drop already-synced" check on every submit. Acceptable for v1 — if duplicate FulFliz submissions show up in practice, add a Redis lock then.

**Rate limits:** SeloraX metafields cap of 120/min/app. One batch write per sync — far below the limit. FulFliz: no documented limit; we don't auto-retry.

## 10. Manual smoke test checklist

Run after every change to this feature:

1. Start SeloraX backend (`cd SeloraX-Backend && npm run dev`) and Next.js (`cd apps/fulfliz && yarn dev`).
2. Load `http://localhost:3000/` — table renders with N processing+courier orders, count matches a manual SQL check (`SELECT COUNT(*) FROM orders WHERE store_id=2 AND order_status='processing' AND courier IS NOT NULL AND courier <> ''`).
3. Tick one row → "Send to FulFliz (1)" button enables.
4. Click → row shows synced state, FulFliz dashboard shows the order, `SELECT * FROM app_metafield_values WHERE resource_type='order' AND resource_id=<id>` returns one row.
5. Reload page → that order's checkbox is disabled (already synced).
6. Tick all rows with "Select all" → submit → all sync, banner shows "N sent".
7. Stop SeloraX backend, click submit → red banner "Sync failed".
8. With invalid `FULFLIZ_API_SECRET` in `.env` and SeloraX up → red banner "FulFliz rejected the request".
9. Edit one order in DB to set `order_status='shipped'` between list and click → submit shows "skipped" count.

## 11. Open questions / future work (not in scope)

- One-merchant-per-instance is fine for now; if SeloraX dashboard wants this UI embedded across stores, refactor `STORE_ID` to a request param.
- No retry button on failed metafield writes — operator notices the warning and re-runs. Add a "Retry tagging" affordance if this turns out to bite.
- No FulFliz → SeloraX status sync. If FulFliz exposes webhooks for shipped/delivered, that's a separate spec.
- No tests. If field-mapping bugs ever ship, revisit option B (Vitest on `_lib/` pure functions).
