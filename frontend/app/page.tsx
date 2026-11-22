"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi, type TrustIndex } from "@/lib/api";
import { zoneColor, zoneLabel, type Zone } from "@/lib/utils";
import { Button, Card, CardTitle, ErrorNote, Input, ScoreRing, SeverityBadge } from "@/components/ui";

export default function Home() {
  const { data, error } = useApi<TrustIndex>("/index");
  const [q, setQ] = useState("Which revenue metric should I trust?");
  const router = useRouter();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Enterprise Trust Index</h1>
        <p className="text-sm text-muted-foreground">How far can leaders trust the numbers and recommendations they act on?</p>
      </header>
      <ErrorNote error={error} />

      <form
        className="flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/ask?q=${encodeURIComponent(q)}`);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a trust question…" />
        <Button type="submit" className="h-11">Ask</Button>
      </form>

      {data && (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="flex items-center gap-6">
              <ScoreRing score={data.index} zone={data.zone} size={128} />
              <div className="text-sm">
                <p className="font-semibold">Viewer-weighted trust</p>
                <p className="text-muted-foreground">{data.metrics} metrics · {data.certified} certified</p>
              </div>
            </Card>
            <Card>
              <CardTitle>Metrics by trust zone</CardTitle>
              <ZoneBar zones={data.zones} />
            </Card>
            <Card>
              <CardTitle>Open conflicts</CardTitle>
              <p className="mt-3 text-3xl font-semibold">{data.conflicts_open}</p>
              <p className="text-sm text-red-700">{data.conflicts_critical} critical</p>
              <CardTitle className="mt-4">AI recommendations</CardTitle>
              <p className="mt-1 text-sm">
                {(["green", "yellow", "red"] as Zone[]).map((z) => (
                  <span key={z} className="mr-3" style={{ color: zoneColor[z] }}>
                    {data.recommendations[z]} {zoneLabel[z].toLowerCase()}
                  </span>
                ))}
              </p>
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <CardTitle>Top conflicts by blast radius</CardTitle>
              <Link href="/conflicts" className="text-sm text-primary">Open conflict queue</Link>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {data.top_conflicts.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2 pr-3"><SeverityBadge severity={c.severity} /></td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{c.code}</td>
                    <td className="py-2 pr-3">{c.title}</td>
                    <td className="py-2 text-right text-muted-foreground">{c.blast_radius} dashboards</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function ZoneBar({ zones }: { zones: Record<Zone, number> }) {
  const total = zones.green + zones.yellow + zones.red || 1;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {(["green", "yellow", "red"] as Zone[]).map((z) => (
          <div key={z} style={{ width: `${(zones[z] / total) * 100}%`, background: zoneColor[z] }} />
        ))}
      </div>
      <div className="flex justify-between text-xs">
        {(["green", "yellow", "red"] as Zone[]).map((z) => (
          <span key={z} style={{ color: zoneColor[z] }}>
            {zones[z]} {zoneLabel[z].toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
