import "server-only";
import { env } from "./env";

const headers = (storeId: string) => ({
  "Content-Type": "application/json",
  "X-Client-Id": env.SELORAX_CLIENT_ID,
  "X-Client-Secret": env.SELORAX_CLIENT_SECRET,
  "X-Store-Id": storeId,
});

export type BootstrapResult =
  | { available: true }
  | { available: false; reason: "tables-not-installed" };

// Cached per-store. Definitions are per-store on the dashboard schema, so
// we may need to bootstrap once per store served by this Next.js process.
const cache = new Map<string, BootstrapResult>();

const DEFINITIONS = [
  {
    namespace: "fulfliz",
    key: "external_order_id",
    name: "FulFliz External Order ID",
    description: "ID returned by FulFliz Create External Order API after a successful sync.",
    resource_type: "order" as const,
    value_type: "string" as const,
  },
  {
    namespace: "fulfliz",
    key: "merchant_name",
    name: "FulFliz Merchant Name",
    description: "Merchant name sent in the FulFliz Create External Order payload.",
    resource_type: "store" as const,
    value_type: "string" as const,
  },
  {
    namespace: "fulfliz",
    key: "client_id",
    name: "FulFliz Client ID",
    description: "FulFliz client ID — goes in the URL path of the Create External Order endpoint.",
    resource_type: "store" as const,
    value_type: "string" as const,
  },
  {
    namespace: "fulfliz",
    key: "api_secret",
    name: "FulFliz API Secret",
    description: "FulFliz API secret — sent in the payload of every Create External Order request. Treat as sensitive.",
    resource_type: "store" as const,
    value_type: "string" as const,
  },
];

function isMissingTableBody(body: string): boolean {
  return body.includes("doesn't exist") && body.includes("metafield");
}

export async function ensureFulflizMetafieldDefinitions(storeId: string): Promise<BootstrapResult> {
  const cached = cache.get(storeId);
  if (cached) return cached;

  // Probe — if the metafield tables are missing, this returns a 500 we can detect once.
  const probeUrl = `${env.APP_API_URL}/api/apps/v1/metafields/definitions?resource_type=order`;
  const probeRes = await fetch(probeUrl, { headers: headers(storeId), cache: "no-store" });

  if (probeRes.status >= 500) {
    const body = await probeRes.text().catch(() => "");
    if (isMissingTableBody(body)) {
      const result: BootstrapResult = { available: false, reason: "tables-not-installed" };
      cache.set(storeId, result);
      return result;
    }
  }

  if (!probeRes.ok) {
    const text = await probeRes.text().catch(() => "");
    throw new Error(`Bootstrap probe failed: ${probeRes.status} ${text.slice(0, 200)}`);
  }

  const orderDefs = await fetch(
    `${env.APP_API_URL}/api/apps/v1/metafields/definitions?resource_type=order`,
    { headers: headers(storeId), cache: "no-store" },
  );
  const storeDefs = await fetch(
    `${env.APP_API_URL}/api/apps/v1/metafields/definitions?resource_type=store`,
    { headers: headers(storeId), cache: "no-store" },
  );

  const existing = new Set<string>();
  for (const r of [orderDefs, storeDefs]) {
    if (r.ok) {
      const json = (await r.json()) as { data?: Array<{ namespace: string; key: string }> };
      for (const d of json.data ?? []) existing.add(`${d.namespace}.${d.key}`);
    }
  }

  for (const def of DEFINITIONS) {
    if (existing.has(`${def.namespace}.${def.key}`)) continue;

    const createRes = await fetch(`${env.APP_API_URL}/api/apps/v1/metafields/definitions`, {
      method: "POST",
      headers: headers(storeId),
      body: JSON.stringify(def),
      cache: "no-store",
    });

    if (createRes.ok || createRes.status === 409) continue;

    if (createRes.status >= 500) {
      const body = await createRes.text().catch(() => "");
      if (isMissingTableBody(body)) {
        const result: BootstrapResult = { available: false, reason: "tables-not-installed" };
        cache.set(storeId, result);
        return result;
      }
    }

    const text = await createRes.text().catch(() => "");
    throw new Error(`Failed to create definition ${def.namespace}.${def.key}: ${createRes.status} ${text.slice(0, 200)}`);
  }

  const result: BootstrapResult = { available: true };
  cache.set(storeId, result);
  return result;
}
