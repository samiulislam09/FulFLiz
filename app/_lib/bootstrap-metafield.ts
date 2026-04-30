import "server-only";
import { env } from "./env";

const headers = () => ({
  "Content-Type": "application/json",
  "X-Client-Id": env.SELORAX_CLIENT_ID,
  "X-Client-Secret": env.SELORAX_CLIENT_SECRET,
  "X-Store-Id": env.STORE_ID,
});

export type BootstrapResult =
  | { available: true }
  | { available: false; reason: "tables-not-installed" };

let cached: BootstrapResult | null = null;

// SeloraX surfaces missing-table errors as a 500 with `error: "Table '...' doesn't exist"`.
// Detecting this lets us run in environments where the metafields migration
// (migrations/2026-03-09-app-metafields.sql) hasn't been applied — instead of
// failing every sync with a warning banner, we just skip the tracking write.
function isMissingTableBody(body: string): boolean {
  return body.includes("doesn't exist") && body.includes("app_metafield");
}

export async function ensureFulflizMetafieldDefinition(): Promise<BootstrapResult> {
  if (cached) return cached;

  const definitionsUrl = `${env.APP_API_URL}/api/apps/v1/metafields/definitions?resource_type=order`;
  const listRes = await fetch(definitionsUrl, { headers: headers(), cache: "no-store" });

  if (listRes.status >= 500) {
    const body = await listRes.text().catch(() => "");
    if (isMissingTableBody(body)) {
      cached = { available: false, reason: "tables-not-installed" };
      return cached;
    }
  }

  if (listRes.ok) {
    const json = (await listRes.json()) as { data: Array<{ namespace: string; key: string }> };
    const exists = json.data?.some(
      (d) => d.namespace === "fulfliz" && d.key === "external_order_id",
    );
    if (exists) {
      cached = { available: true };
      return cached;
    }
  }

  const createRes = await fetch(`${env.APP_API_URL}/api/apps/v1/metafields/definitions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      namespace: "fulfliz",
      key: "external_order_id",
      name: "FulFliz External Order ID",
      description: "ID returned by FulFliz Create External Order API after a successful sync.",
      resource_type: "order",
      value_type: "string",
    }),
    cache: "no-store",
  });

  if (createRes.ok || createRes.status === 409) {
    cached = { available: true };
    return cached;
  }

  if (createRes.status >= 500) {
    const body = await createRes.text().catch(() => "");
    if (isMissingTableBody(body)) {
      cached = { available: false, reason: "tables-not-installed" };
      return cached;
    }
  }

  const text = await createRes.text().catch(() => "");
  throw new Error(`Failed to create metafield definition: ${createRes.status} ${text.slice(0, 200)}`);
}
