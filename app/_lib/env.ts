import "server-only";

function read(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Getters defer validation until each var is actually read. This keeps
// `next build` working without production secrets while still failing loudly
// on the first request that needs them.
export const env = {
  get SELORAX_CLIENT_ID() { return read("SELORAX_CLIENT_ID"); },
  get SELORAX_CLIENT_SECRET() { return read("SELORAX_CLIENT_SECRET"); },
  get STORE_ID() { return read("STORE_ID"); },
  get APP_API_URL() { return read("APP_API_URL"); },
  get FULFLIZ_API_BASE_URL() { return read("FULFLIZ_API_BASE_URL"); },
  get FULFLIZ_CLIENT_ID() { return read("FULFLIZ_CLIENT_ID"); },
  get FULFLIZ_API_SECRET() { return read("FULFLIZ_API_SECRET"); },
  get FULFLIZ_MERCHANT_NAME() { return read("FULFLIZ_MERCHANT_NAME"); },
} as const;
