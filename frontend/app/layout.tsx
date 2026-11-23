import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decision Trust",
  description: "A credit score for enterprise knowledge",
};

const nav = [
  { href: "/", label: "Home" },
  { href: "/ask", label: "Ask" },
  { href: "/reconcile", label: "Reconcile" },
  { href: "/metrics", label: "Metrics" },
  { href: "/conflicts", label: "Conflicts" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/graph", label: "Trust Graph" },
  { href: "/calibration", label: "Calibration" },
  { href: "/ingest", label: "Ingest" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 border-r border-border bg-muted/60 px-4 py-6">
            <Link href="/" className="mb-8 block px-2 text-base font-semibold">
              Decision Trust
            </Link>
            <nav className="flex flex-col gap-1">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-white hover:text-foreground">
                  {n.label}
                </Link>
              ))}
            </nav>
            <p className="mt-10 px-2 text-xs text-muted-foreground">Workspace: Acme Consumer Goods (demo)</p>
          </aside>
          <main className="flex-1 px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
