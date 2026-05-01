"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  // Pre-fill values come from the metafields read on the server (in case some
  // are set but others aren't). Only blank fields need filling in.
  initial?: {
    merchantName?: string;
    clientId?: string;
    apiSecret?: string;
  };
  // Banner message shown above the form — e.g. "Metafield tables not installed".
  blockingMessage?: string | null;
};

export function SetupForm({ initial, blockingMessage }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [merchantName, setMerchantName] = useState(initial?.merchantName ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [apiSecret, setApiSecret] = useState(initial?.apiSecret ?? "");
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      let res: Response;
      try {
        res = await fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantName, clientId, apiSecret }),
        });
      } catch (err) {
        setError(`Network error: ${(err as Error).message}`);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Save failed (${res.status})`);
        return;
      }
      router.refresh();
    });
  };

  const disabled = isPending || Boolean(blockingMessage);

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Set up FulFliz credentials</h2>
        <p className="mt-1 text-sm text-zinc-600">
          These are stored as store-scoped metafields and used for every order sync. You only need
          to do this once per store.
        </p>

        {blockingMessage && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {blockingMessage}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field
            id="merchantName"
            label="Merchant Name"
            hint="Sent as merchant_name in every order payload."
            value={merchantName}
            onChange={setMerchantName}
            disabled={disabled}
          />
          <Field
            id="clientId"
            label="FulFliz Client ID"
            hint="Found in your FulFliz merchant panel under API credentials. Goes in the URL."
            value={clientId}
            onChange={setClientId}
            disabled={disabled}
          />
          <div>
            <label htmlFor="apiSecret" className="block text-sm font-medium text-zinc-900">
              FulFliz API Secret
            </label>
            <div className="relative mt-1">
              <input
                id="apiSecret"
                type={showSecret ? "text" : "password"}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                disabled={disabled}
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-16 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-500"
                required
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-zinc-600 hover:text-zinc-900"
              >
                {showSecret ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Stored in plain text in the SeloraX metafield table. Treat as sensitive.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={disabled || !merchantName || !clientId || !apiSecret}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
            >
              {isPending ? "Saving..." : "Save & continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-900">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-500"
        required
        autoComplete="off"
      />
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
