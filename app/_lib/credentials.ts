import "server-only";
import { env } from "./env";

export type FulflizCredentials = {
  merchantName: string;
  clientId: string;
  apiSecret: string;
};

export type CredentialsResult =
  | { state: "ready"; credentials: FulflizCredentials }
  | { state: "missing"; missing: Array<keyof FulflizCredentials> }
  | { state: "tables-not-installed" };

const NAMESPACE = "fulfliz";
const KEYS = {
  merchantName: "merchant_name",
  clientId: "client_id",
  apiSecret: "api_secret",
} as const;

const headers = () => ({
  "Content-Type": "application/json",
  "X-Client-Id": env.SELORAX_CLIENT_ID,
  "X-Client-Secret": env.SELORAX_CLIENT_SECRET,
  "X-Store-Id": env.STORE_ID,
});

function isMissingTableBody(body: string): boolean {
  return body.includes("doesn't exist") && body.includes("app_metafield");
}

/**
 * Reads the 3 FulFliz credential metafields for the configured store. Returns
 * a discriminated result so callers can distinguish "all set" from "user has
 * to fill in setup form" from "metafield tables don't exist in this DB".
 */
export async function loadFulflizCredentials(): Promise<CredentialsResult> {
  const url = new URL(`${env.APP_API_URL}/api/apps/v1/metafields/values`);
  url.searchParams.set("resource_type", "store");
  url.searchParams.set("resource_id", env.STORE_ID);

  const res = await fetch(url, { headers: headers(), cache: "no-store" });

  if (res.status >= 500) {
    const body = await res.text().catch(() => "");
    if (isMissingTableBody(body)) return { state: "tables-not-installed" };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load credentials metafields: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    data: Array<{ namespace: string; key: string; value: string }>;
  };

  const get = (key: string): string => {
    const found = json.data?.find((m) => m.namespace === NAMESPACE && m.key === key);
    return found?.value?.trim() ?? "";
  };

  const merchantName = get(KEYS.merchantName);
  const clientId = get(KEYS.clientId);
  const apiSecret = get(KEYS.apiSecret);

  const missing: Array<keyof FulflizCredentials> = [];
  if (!merchantName) missing.push("merchantName");
  if (!clientId) missing.push("clientId");
  if (!apiSecret) missing.push("apiSecret");

  if (missing.length > 0) return { state: "missing", missing };
  return { state: "ready", credentials: { merchantName, clientId, apiSecret } };
}

/**
 * Writes the 3 credential metafields for the configured store. Definitions
 * must already exist (see bootstrap-metafield.ts → ensureCredentialDefinitions).
 */
export async function saveFulflizCredentials(creds: FulflizCredentials): Promise<void> {
  const url = `${env.APP_API_URL}/api/apps/v1/metafields/values`;
  const body = {
    metafields: [
      { namespace: NAMESPACE, key: KEYS.merchantName, resource_type: "store", resource_id: Number(env.STORE_ID), value: creds.merchantName },
      { namespace: NAMESPACE, key: KEYS.clientId, resource_type: "store", resource_id: Number(env.STORE_ID), value: creds.clientId },
      { namespace: NAMESPACE, key: KEYS.apiSecret, resource_type: "store", resource_id: Number(env.STORE_ID), value: creds.apiSecret },
    ],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to save credentials: ${res.status} ${text.slice(0, 200)}`);
  }
}
