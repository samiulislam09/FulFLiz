import "server-only";
import { getRedis } from "./redis";
import type { FulflizPayload } from "./types";

// Per-store stream key. Capped via XADD MAXLEN ~ N — the `~` is approximate
// trimming, which Redis can do in O(1) by dropping whole macro-nodes instead
// of one entry at a time. Slight overshoot is fine for a debug log.
const STREAM_PREFIX = "fulfliz:logs";
const STREAM_MAXLEN = 10_000;

function streamKey(storeId: string): string {
  return `${STREAM_PREFIX}:${storeId}`;
}

// FulflizPayload contains apiSecret. Never store it.
function redactPayload(p: FulflizPayload): Omit<FulflizPayload, "apiSecret"> & { apiSecret: "[redacted]" } {
  return { ...p, apiSecret: "[redacted]" };
}

export type SyncLogEvent = {
  ts: string; // ISO 8601
  storeId: string;
  requestedOrderIds: number[];
  eligibleOrderIds: number[];
  skippedOrderIds: number[];
  // Only the slim, FulFliz-bound payload is persisted (apiSecret redacted).
  // The raw SeloraX order is intentionally NOT logged — too bulky and adds
  // nothing the FulFliz request body doesn't already capture.
  fulflizPayloads: Array<ReturnType<typeof redactPayload>>;
  fulflizResponse?: unknown;
  fulflizError?: {
    status: number;
    code: string;
    message: string;
    hint?: string;
    details: string;
  };
  metafieldWrite?: { tagged: Array<{ order_id: number; external_order_id: string }> };
  result: { ok: boolean; synced: number; skipped: number; warning?: string };
};

export type SyncLogInput = Omit<SyncLogEvent, "ts" | "fulflizPayloads"> & {
  fulflizPayloads: FulflizPayload[];
};

// Logging must never break the sync. Failures are reported to console only.
export async function logSyncEvent(input: SyncLogInput): Promise<void> {
  const event: SyncLogEvent = {
    ...input,
    ts: new Date().toISOString(),
    fulflizPayloads: input.fulflizPayloads.map(redactPayload),
  };

  try {
    const client = await getRedis();
    // Top-level fields (ok, synced, skipped, ts) are stored alongside `data`
    // so a viewer UI can render summary columns without having to JSON.parse
    // every entry. Full record lives in `data`.
    await client.xAdd(
      streamKey(event.storeId),
      "*",
      {
        ts: event.ts,
        ok: event.result.ok ? "1" : "0",
        synced: String(event.result.synced),
        skipped: String(event.result.skipped),
        data: JSON.stringify(event),
      },
      { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: STREAM_MAXLEN } },
    );
  } catch (err) {
    console.error("[logger] failed to write sync log to Redis:", err);
  }
}
