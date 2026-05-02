// Shown while a tab's data fetches. Mirrors the real table's frame so the
// layout doesn't shift when the data resolves and replaces this. The 7-column
// shape matches both OrdersTable (To-send) and SentOrdersTable (Sent) — they
// happen to render the same number of columns.
export function TableSkeleton({ rowCount = 10 }: { rowCount?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between">
        <div className="h-4 w-56 animate-pulse rounded bg-zinc-200" />
        <div className="h-9 w-44 animate-pulse rounded-md bg-zinc-200" />
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {Array.from({ length: 7 }).map((_, i) => (
                <th key={i} scope="col" className="px-4 py-3">
                  <div className="h-3 w-16 animate-pulse rounded bg-zinc-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {Array.from({ length: rowCount }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: 7 }).map((_, c) => (
                  <td key={c} className="px-4 py-4">
                    <div className="h-3 w-full max-w-[120px] animate-pulse rounded bg-zinc-100" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="h-7 w-64 animate-pulse rounded bg-zinc-200" />
        <div className="h-8 w-56 animate-pulse rounded bg-zinc-200" />
      </div>

      <span className="sr-only">Loading orders…</span>
    </div>
  );
}
