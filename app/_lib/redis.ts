import "server-only";
import { createClient, type RedisClientType } from "redis";

// Redis Cloud hands you a `host:port` string with no scheme. createClient()
// requires `redis://` or `rediss://`, so prefix it here. Keeps the env value
// copy-pasteable from the Redis Cloud console.
function buildRedisUrl(): string {
  const raw = process.env.REDIS_URL;
  const password = process.env.REDIS_PASSWORD;
  if (!raw) throw new Error("Missing REDIS_URL");
  if (!password) throw new Error("Missing REDIS_PASSWORD");
  const withScheme = /^rediss?:\/\//.test(raw) ? raw : `redis://${raw}`;
  const u = new URL(withScheme);
  if (!u.username) u.username = "default";
  u.password = password;
  return u.toString();
}

// Cache the client on globalThis so Next.js HMR doesn't open a fresh
// connection on every code edit in dev. In a production serverless runtime
// the module is loaded once per worker, so this is a normal singleton.
type GlobalWithRedis = typeof globalThis & {
  __fulflizRedis?: { client: RedisClientType; connecting: Promise<RedisClientType> | null };
};
const g = globalThis as GlobalWithRedis;

export async function getRedis(): Promise<RedisClientType> {
  const cached = g.__fulflizRedis;
  if (cached?.client.isOpen) return cached.client;
  if (cached?.connecting) return cached.connecting;

  const client: RedisClientType = createClient({ url: buildRedisUrl() });
  client.on("error", (err) => console.error("[redis] client error:", err));

  const connecting = client.connect().then(() => client);
  g.__fulflizRedis = { client, connecting };
  try {
    await connecting;
  } finally {
    if (g.__fulflizRedis) g.__fulflizRedis.connecting = null;
  }
  return client;
}
