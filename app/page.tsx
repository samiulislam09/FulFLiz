import { listProcessingOrdersWithCourier } from "@/app/_lib/selorax";
import { FULFLIZ_METAFIELD_PATH } from "@/app/_lib/types";
import { OrdersTable } from "@/app/_components/OrdersTable";
import { EmptyState } from "@/app/_components/EmptyState";

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

export default async function Home({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise that must be awaited.
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const limit = parseLimit(params.limit);

  const { data, pagination } = await listProcessingOrdersWithCourier({ page, limit });

  const rows = data.map((o) => ({
    order_id: o.order_id,
    store_serial_order_no: o.store_serial_order_no,
    courier: o.courier,
    tracking_code: o.tracking_code,
    grand_total: o.grand_total,
    created_at: o.created_at,
    itemCount: o.items.length,
    alreadySynced: Boolean(o.metafields?.[FULFLIZ_METAFIELD_PATH]),
  }));

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          FulFliz Order Sync
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Processing orders with a courier assigned. Select the ones you want to send to FulFliz.
        </p>
      </header>

      {pagination.total === 0 ? (
        <EmptyState />
      ) : (
        <OrdersTable
          rows={rows}
          pagination={{
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages,
            pageSizes: [...PAGE_SIZES],
          }}
        />
      )}
    </div>
  );
}
