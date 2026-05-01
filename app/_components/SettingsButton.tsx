"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SetupForm } from "./SetupForm";

type Props = {
  storeId: string;
  initial: {
    merchantName: string;
    clientId: string;
    apiSecret: string;
  };
};

export function SettingsButton({ storeId, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="FulFliz settings"
        title="FulFliz settings"
        className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
      >
        <GearIcon />
        <span>Settings</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="FulFliz credentials"
          onClick={(e) => {
            // Click on backdrop closes; clicks inside the form do not.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-xl">
            <SetupForm
              storeId={storeId}
              initial={initial}
              heading="FulFliz settings"
              description="Update the credentials sent with every order sync. Stored as store-scoped metafields."
              submitLabel="Save changes"
              onCancel={() => setOpen(false)}
              onSuccess={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M11.078 2.25a1.5 1.5 0 0 0-2.156 0l-.62.642a1.5 1.5 0 0 1-1.456.4l-.872-.213a1.5 1.5 0 0 0-1.835 1.06l-.241.86a1.5 1.5 0 0 1-1.067 1.067l-.86.24a1.5 1.5 0 0 0-1.06 1.836l.213.872a1.5 1.5 0 0 1-.4 1.456l-.642.62a1.5 1.5 0 0 0 0 2.156l.642.62a1.5 1.5 0 0 1 .4 1.456l-.213.872a1.5 1.5 0 0 0 1.06 1.835l.86.241a1.5 1.5 0 0 1 1.067 1.067l.24.86a1.5 1.5 0 0 0 1.836 1.06l.872-.213a1.5 1.5 0 0 1 1.456.4l.62.642a1.5 1.5 0 0 0 2.156 0l.62-.642a1.5 1.5 0 0 1 1.456-.4l.872.213a1.5 1.5 0 0 0 1.835-1.06l.241-.86a1.5 1.5 0 0 1 1.067-1.067l.86-.24a1.5 1.5 0 0 0 1.06-1.836l-.213-.872a1.5 1.5 0 0 1 .4-1.456l.642-.62a1.5 1.5 0 0 0 0-2.156l-.642-.62a1.5 1.5 0 0 1-.4-1.456l.213-.872a1.5 1.5 0 0 0-1.06-1.835l-.86-.241a1.5 1.5 0 0 1-1.067-1.067l-.24-.86a1.5 1.5 0 0 0-1.836-1.06l-.872.213a1.5 1.5 0 0 1-1.456-.4l-.62-.642ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
