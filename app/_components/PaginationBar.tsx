"use client";

import { useRouter } from "next/navigation";
import type { View } from "@/app/_lib/types";

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  pageSizes: number[];
};

export function PaginationBar({
  storeId,
  view,
  pagination,
}: {
  storeId: string;
  view: View;
  pagination: Pagination;
}) {
  const router = useRouter();
  const { page, limit, total, totalPages, pageSizes } = pagination;

  const navigate = (nextPage: number, nextLimit: number) => {
    const params = new URLSearchParams();
    // store_id must persist across pagination — without it the Server Component
    // re-renders into the "store context missing" error state.
    params.set("store_id", storeId);
    if (view === "sent") params.set("view", "sent");
    params.set("page", String(nextPage));
    params.set("limit", String(nextLimit));
    router.push(`/?${params.toString()}`);
  };

  const onLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // Reset to page 1 when changing page size — otherwise the user can land
    // on a page that no longer exists at the new size.
    navigate(1, Number(e.target.value));
  };

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 text-sm text-zinc-600 sm:flex-row">
      <div className="flex items-center gap-2">
        <label htmlFor="page-size">Rows per page:</label>
        <select
          id="page-size"
          value={limit}
          onChange={onLimitChange}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-zinc-900"
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="ml-3">
          Showing <span className="font-medium text-zinc-900">{start}</span>–
          <span className="font-medium text-zinc-900">{end}</span> of{" "}
          <span className="font-medium text-zinc-900">{total}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(page - 1, limit)}
          disabled={page <= 1}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="px-2">
          Page <span className="font-medium text-zinc-900">{page}</span> of{" "}
          <span className="font-medium text-zinc-900">{totalPages}</span>
        </span>
        <button
          type="button"
          onClick={() => navigate(page + 1, limit)}
          disabled={page >= totalPages}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
