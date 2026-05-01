import "server-only";

function read(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function readOptional(name: string): string {
  return process.env[name] ?? "";
}

// Getters defer validation until each var is actually read. This keeps
// `next build` working without production secrets while still failing loudly
// on the first request that needs them.
//
// `STORE_ID` is intentionally not here — it's read per-request from the URL
// (Server Components: `searchParams.store_id`; route handlers: request body).
// FULFLIZ_* are stored as per-store metafields, not env.
export const env = {
  get SELORAX_CLIENT_ID() { return read("SELORAX_CLIENT_ID"); },
  get SELORAX_CLIENT_SECRET() { return read("SELORAX_CLIENT_SECRET"); },
  get APP_API_URL() { return read("APP_API_URL"); },
  get FULFLIZ_API_BASE_URL() { return readOptional("FULFLIZ_API_BASE_URL") || "https://api.fulfliz.com/api/v1"; },
} as const;
