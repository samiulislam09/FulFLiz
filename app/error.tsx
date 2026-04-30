"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-900">
        <h2 className="text-lg font-semibold">Couldn&apos;t load orders</h2>
        <p className="mt-2 text-sm">
          {error.message || "Something went wrong while talking to SeloraX."}
        </p>
        <button
          type="button"
          onClick={unstable_retry}
          className="mt-4 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
