import { NextResponse } from "next/server";
import { saveFulflizCredentials } from "@/app/_lib/credentials";
import { ensureFulflizMetafieldDefinitions } from "@/app/_lib/bootstrap-metafield";

type Body = {
  merchantName?: unknown;
  clientId?: unknown;
  apiSecret?: unknown;
};

function asString(v: unknown, name: string, max = 500): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof v !== "string") return { ok: false, error: `${name} must be a string` };
  const trimmed = v.trim();
  if (!trimmed) return { ok: false, error: `${name} cannot be empty` };
  if (trimmed.length > max) return { ok: false, error: `${name} exceeds ${max} characters` };
  return { ok: true, value: trimmed };
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const merchant = asString(body.merchantName, "merchantName", 255);
  const client = asString(body.clientId, "clientId");
  const secret = asString(body.apiSecret, "apiSecret", 1000);

  for (const r of [merchant, client, secret]) {
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  }

  // Definitions must exist before values can be saved. Bootstrap is idempotent
  // and cached per process, so this is cheap on subsequent setups.
  let bootstrap;
  try {
    bootstrap = await ensureFulflizMetafieldDefinitions();
  } catch (err) {
    console.error("[/api/setup] Bootstrap failed:", err);
    return NextResponse.json(
      { error: "Could not initialize metafield definitions. See logs." },
      { status: 502 },
    );
  }

  if (!bootstrap.available) {
    return NextResponse.json(
      {
        error:
          "Metafield tables aren't installed in this database — can't save credentials. " +
          "Run SeloraX-Backend/migrations/2026-03-09-app-metafields.sql first.",
      },
      { status: 503 },
    );
  }

  try {
    await saveFulflizCredentials({
      merchantName: (merchant as { value: string }).value,
      clientId: (client as { value: string }).value,
      apiSecret: (secret as { value: string }).value,
    });
  } catch (err) {
    console.error("[/api/setup] Save failed:", err);
    return NextResponse.json({ error: "Failed to save credentials. See logs." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
