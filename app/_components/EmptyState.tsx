import type { View } from "@/app/_lib/types";

export function EmptyState({ view = "todo" }: { view?: View }) {
  if (view === "sent") {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center">
        <h2 className="text-base font-medium text-zinc-900">No orders sent to FulFliz yet</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Orders you sync from the <span className="font-medium">To send</span> tab will appear
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center">
      <h2 className="text-base font-medium text-zinc-900">No orders to sync</h2>
      <p className="mt-2 text-sm text-zinc-600">
        There are no orders in <span className="font-mono">processing</span> status with a courier
        assigned. New eligible orders will appear here.
      </p>
    </div>
  );
}
