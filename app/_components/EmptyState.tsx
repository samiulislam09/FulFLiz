export function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center">
      <h2 className="text-base font-medium text-zinc-900">
        No orders to sync
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        There are no orders in <span className="font-mono">processing</span> status with a
        courier assigned. New eligible orders will appear here.
      </p>
    </div>
  );
}
