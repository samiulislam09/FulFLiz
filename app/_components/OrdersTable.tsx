"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderRow } from "@/app/_lib/types";
import { PaginationBar, type Pagination } from "./PaginationBar";

type Banner =
  | { kind: "success"; message: string }
  | { kind: "warning"; message: string; hint?: string; details?: string }
  | { kind: "error"; message: string; hint?: string; details?: string };

type SyncResponse = {
  ok?: boolean;
  synced?: number;
  skipped?: number;
  warning?: string;
  error?: string;
  hint?: string;
  details?: string;
};

export function OrdersTable({
  storeId,
  rows,
  pagination,
}: {
  storeId: string;
  rows: OrderRow[];
  pagination: Pagination;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [banner, setBanner] = useState<Banner | null>(null);

  const selectableIds = useMemo(
    () => rows.filter((r) => !r.alreadySynced).map((r) => r.order_id),
    [rows],
  );
  const allSelected = selectableIds.length > 0 && selected.size === selectableIds.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSync = () => {
    setBanner(null);
    const ids = Array.from(selected);
    startTransition(async () => {
      let res: Response;
      try {
        res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId, orderIds: ids }),
        });
      } catch (err) {
        setBanner({ kind: "error", message: `Network error: ${(err as Error).message}` });
        return;
      }

      let json: SyncResponse;
      try {
        json = (await res.json()) as SyncResponse;
      } catch {
        setBanner({ kind: "error", message: `Invalid response (${res.status})` });
        return;
      }

      if (!res.ok || !json.ok) {
        setBanner({
          kind: "error",
          message: json.error ?? `Sync failed (${res.status})`,
          hint: json.hint,
          details: json.details,
        });
        return;
      }

      const { synced = 0, skipped = 0, warning } = json;
      const summary =
        skipped > 0 ? `${synced} sent, ${skipped} skipped` : `${synced} sent to FulFliz`;
      if (warning) {
        setBanner({ kind: "warning", message: `${summary}. ${warning}`, details: json.details });
      } else {
        setBanner({ kind: "success", message: summary });
      }
      setSelected(new Set());
      router.refresh();
    });
  };

  const submitDisabled = isPending || selected.size === 0;

  return (
    <div className="space-y-4">
      {banner && <BannerView banner={banner} onClose={() => setBanner(null)} />}

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">
          {rows.length} order{rows.length === 1 ? "" : "s"} ready to sync
          {selected.size > 0 && ` · ${selected.size} selected`}
        </p>
        <button
          type="button"
          onClick={handleSync}
          disabled={submitDisabled}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
          title={selected.size === 0 ? "Select at least one order" : undefined}
        >
          {isPending ? "Sending..." : `Send to FulFliz${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600">
            <tr>
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  className="h-4 w-4 rounded border-zinc-300"
                />
              </th>
              <th scope="col" className="px-4 py-3">Order ID</th>
              <th scope="col" className="px-4 py-3">Courier</th>
              <th scope="col" className="px-4 py-3">Tracking</th>
              <th scope="col" className="px-4 py-3">Items</th>
              <th scope="col" className="px-4 py-3">Total</th>
              <th scope="col" className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {rows.map((row) => {
              const isChecked = selected.has(row.order_id);
              const disabled = row.alreadySynced;
              return (
                <tr
                  key={row.order_id}
                  className={
                    disabled
                      ? "bg-zinc-50/50 text-zinc-500"
                      : "hover:bg-zinc-50"
                  }
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select order ${row.store_serial_order_no ?? row.order_id}`}
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => toggleOne(row.order_id)}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                    {row.order_id}
                  </td>
                  <td className="px-4 py-3">{row.courier ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.tracking_code ?? "—"}</td>
                  <td className="px-4 py-3">{row.itemCount}</td>
                  <td className="px-4 py-3">৳{row.grand_total_display}</td>
                  <td className="px-4 py-3 text-xs">{row.created_at_display}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PaginationBar storeId={storeId} view="todo" pagination={pagination} />
    </div>
  );
}

function BannerView({ banner, onClose }: { banner: Banner; onClose: () => void }) {
  const [showDetails, setShowDetails] = useState(false);

  const palette =
    banner.kind === "error"
      ? {
          container: "border-red-300 bg-red-50 text-red-900",
          icon: "text-red-500",
          symbol: "!",
          mutedText: "text-red-700",
          detailsBtn: "text-red-700 hover:text-red-900",
          detailsBox: "bg-red-100/60 border-red-200 text-red-900",
        }
      : banner.kind === "warning"
        ? {
            container: "border-amber-300 bg-amber-50 text-amber-900",
            icon: "text-amber-500",
            symbol: "!",
            mutedText: "text-amber-700",
            detailsBtn: "text-amber-700 hover:text-amber-900",
            detailsBox: "bg-amber-100/60 border-amber-200 text-amber-900",
          }
        : {
            container: "border-emerald-300 bg-emerald-50 text-emerald-900",
            icon: "text-emerald-500",
            symbol: "✓",
            mutedText: "text-emerald-700",
            detailsBtn: "text-emerald-700 hover:text-emerald-900",
            detailsBox: "bg-emerald-100/60 border-emerald-200 text-emerald-900",
          };

  // Only error/warning banners can carry hint/details.
  const hint =
    banner.kind === "error" || banner.kind === "warning" ? banner.hint : undefined;
  const details =
    banner.kind === "error" || banner.kind === "warning" ? banner.details : undefined;

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${palette.container}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden
            className={`flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white text-xs font-bold ${palette.icon}`}
          >
            {palette.symbol}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium leading-5">{banner.message}</p>
            {hint && <p className={`text-xs leading-5 ${palette.mutedText}`}>{hint}</p>}
            {details && (
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className={`text-xs font-medium underline-offset-2 hover:underline ${palette.detailsBtn}`}
              >
                {showDetails ? "Hide technical details" : "Show technical details"}
              </button>
            )}
            {showDetails && details && (
              <pre
                className={`mt-2 max-h-48 overflow-auto rounded border px-2 py-1 text-[11px] leading-4 whitespace-pre-wrap break-all ${palette.detailsBox}`}
              >
                {details}
              </pre>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="text-current opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}
