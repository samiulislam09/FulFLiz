import Link from "next/link";
import type { View } from "@/app/_lib/types";

function tabHref(storeId: string, view: View): string {
  const params = new URLSearchParams();
  params.set("store_id", storeId);
  // Always reset to page 1 when switching views — the two tabs have unrelated
  // page counts so preserving page would land on a possibly-empty page.
  if (view === "sent") params.set("view", "sent");
  return `/?${params.toString()}`;
}

export function ViewTabs({ storeId, active }: { storeId: string; active: View }) {
  return (
    <nav className="flex gap-1 border-b border-zinc-200" aria-label="Order views">
      <TabLink href={tabHref(storeId, "todo")} active={active === "todo"}>
        To send
      </TabLink>
      <TabLink href={tabHref(storeId, "sent")} active={active === "sent"}>
        Sent
      </TabLink>
    </nav>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const base = "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors";
  const styles = active
    ? "border-zinc-900 text-zinc-900"
    : "border-transparent text-zinc-500 hover:text-zinc-900 hover:border-zinc-300";
  return (
    <Link href={href} className={`${base} ${styles}`} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
