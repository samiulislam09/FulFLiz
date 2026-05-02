import type { SentOrderRow } from "@/app/_lib/types";
import { PaginationBar, type Pagination } from "./PaginationBar";

export function SentOrdersTable({
  storeId,
  rows,
  pagination,
  truncated,
}: {
  storeId: string;
  rows: SentOrderRow[];
  pagination: Pagination;
  truncated: boolean;
}) {
  return (
    <div className="space-y-4">
      {truncated && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Showing the most recent sent orders only.</p>
          <p className="mt-1 text-xs text-amber-800">
            We scan the 250 most recent ready-to-ship orders to build this list. If you have more
            than that, older sent orders may be missing here. They&apos;re still in FulFliz.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">
          {pagination.total} order{pagination.total === 1 ? "" : "s"} sent to FulFliz
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600">
            <tr>
              <th scope="col" className="px-4 py-3">Order ID</th>
              <th scope="col" className="px-4 py-3">Courier</th>
              <th scope="col" className="px-4 py-3">Tracking</th>
              <th scope="col" className="px-4 py-3">Items</th>
              <th scope="col" className="px-4 py-3">Total</th>
              <th scope="col" className="px-4 py-3">Created</th>
              <th scope="col" className="px-4 py-3">FulFliz ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {rows.map((row) => (
              <tr key={row.order_id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{row.order_id}</td>
                <td className="px-4 py-3">{row.courier ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.tracking_code ?? "—"}</td>
                <td className="px-4 py-3">{row.itemCount}</td>
                <td className="px-4 py-3">৳{row.grand_total_display}</td>
                <td className="px-4 py-3 text-xs">{row.created_at_display}</td>
                <td
                  className="max-w-[160px] truncate px-4 py-3 font-mono text-xs text-zinc-700"
                  title={row.external_order_id}
                >
                  {row.external_order_id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationBar storeId={storeId} view="sent" pagination={pagination} />
    </div>
  );
}
