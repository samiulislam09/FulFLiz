import { Suspense } from "react";
import { listProcessingOrdersWithCourier, listSentOrders } from "@/app/_lib/selorax";
import { loadFulflizCredentials } from "@/app/_lib/credentials";
import { FULFLIZ_METAFIELD_PATH, type View } from "@/app/_lib/types";
import { OrdersTable } from "@/app/_components/OrdersTable";
import { SentOrdersTable } from "@/app/_components/SentOrdersTable";
import { EmptyState } from "@/app/_components/EmptyState";
import { SetupForm } from "@/app/_components/SetupForm";
import { SettingsButton } from "@/app/_components/SettingsButton";
import { ViewTabs } from "@/app/_components/ViewTabs";
import { TableSkeleton } from "@/app/_components/TableSkeleton";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function parseLimit(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

function parseStoreId(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  return raw.trim();
}

function parseView(value: string | string[] | undefined): View {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "sent" ? "sent" : "todo";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ store_id?: string; page?: string; limit?: string; view?: string }>;
}) {
  const params = await searchParams;
  const storeId = parseStoreId(params.store_id);

  if (!storeId) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
          <h2 className="text-lg font-semibold">Store context missing</h2>
          <p className="mt-2 text-sm">
            This app must be opened from inside the SeloraX dashboard so it knows which store to
            operate on. The dashboard passes the store via{" "}
            <span className="font-mono text-xs">?store_id=…</span> in the URL.
          </p>
        </div>
      </div>
    );
  }

  const credsResult = await loadFulflizCredentials(storeId);

  if (credsResult.state !== "ready") {
    const blockingMessage =
      credsResult.state === "tables-not-installed"
        ? "Metafield tables aren't installed in this database. Run the metafields migration before saving credentials."
        : null;

    return (
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            FulFliz Order Sync
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Configure your FulFliz credentials to start syncing orders.
          </p>
        </header>
        <SetupForm storeId={storeId} blockingMessage={blockingMessage} />
      </div>
    );
  }

  const view = parseView(params.view);
  const page = parsePage(params.page);
  const limit = parseLimit(params.limit);

  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  });
  const numberFmt = new Intl.NumberFormat("en-US");

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            FulFliz Order Sync
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {view === "sent"
              ? "Orders you've already sent to FulFliz."
              : "Processing orders with a courier assigned. Select the ones you want to send to FulFliz."}
          </p>
        </div>
        <SettingsButton
          storeId={storeId}
          initial={{
            merchantName: credsResult.credentials.merchantName,
            clientId: credsResult.credentials.clientId,
            apiSecret: credsResult.credentials.apiSecret,
          }}
        />
      </header>

      <div className="mb-6">
        <ViewTabs storeId={storeId} active={view} />
      </div>

      {/*
        key includes view + page + limit so any URL change that triggers a new
        data fetch also remounts the boundary, forcing the skeleton to show.
        Without `key`, React would keep the previous table visible during the
        transition and the skeleton would never appear.
      */}
      <Suspense key={`${view}:${page}:${limit}`} fallback={<TableSkeleton />}>
        {view === "sent" ? (
          <SentView
            storeId={storeId}
            page={page}
            limit={limit}
            dateFmt={dateFmt}
            numberFmt={numberFmt}
          />
        ) : (
          <TodoView
            storeId={storeId}
            page={page}
            limit={limit}
            dateFmt={dateFmt}
            numberFmt={numberFmt}
          />
        )}
      </Suspense>
    </div>
  );
}

async function TodoView({
  storeId,
  page,
  limit,
  dateFmt,
  numberFmt,
}: {
  storeId: string;
  page: number;
  limit: number;
  dateFmt: Intl.DateTimeFormat;
  numberFmt: Intl.NumberFormat;
}) {
  const { data, pagination } = await listProcessingOrdersWithCourier(storeId, { page, limit });

  const rows = data.map((o) => ({
    order_id: o.order_id,
    store_serial_order_no: o.store_serial_order_no,
    courier: o.courier,
    tracking_code: o.tracking_code,
    grand_total_display: numberFmt.format(o.grand_total),
    created_at_display: dateFmt.format(new Date(o.created_at)),
    itemCount: o.items.length,
    alreadySynced: Boolean(o.metafields?.[FULFLIZ_METAFIELD_PATH]),
  }));

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  if (pagination.total === 0) {
    return <EmptyState view="todo" />;
  }

  return (
    <OrdersTable
      storeId={storeId}
      rows={rows}
      pagination={{
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages,
        pageSizes: [...PAGE_SIZES],
      }}
    />
  );
}

async function SentView({
  storeId,
  page,
  limit,
  dateFmt,
  numberFmt,
}: {
  storeId: string;
  page: number;
  limit: number;
  dateFmt: Intl.DateTimeFormat;
  numberFmt: Intl.NumberFormat;
}) {
  const { data, pagination, truncated } = await listSentOrders(storeId, { page, limit });

  const rows = data.map((o) => ({
    order_id: o.order_id,
    store_serial_order_no: o.store_serial_order_no,
    courier: o.courier,
    tracking_code: o.tracking_code,
    external_order_id: String(o.metafields?.[FULFLIZ_METAFIELD_PATH] ?? ""),
    grand_total_display: numberFmt.format(o.grand_total),
    created_at_display: dateFmt.format(new Date(o.created_at)),
    itemCount: o.items.length,
  }));

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  if (pagination.total === 0) {
    return <EmptyState view="sent" />;
  }

  return (
    <SentOrdersTable
      storeId={storeId}
      rows={rows}
      pagination={{
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages,
        pageSizes: [...PAGE_SIZES],
      }}
      truncated={truncated}
    />
  );
}
