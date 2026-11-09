"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Crosshair, MapPin } from "lucide-react";
import { Button, Card, Slider, Toggle, cn } from "./ui";
import { distance, formatDistance } from "@/lib/geo";
import type { GeoFix, GeoStatus } from "@/hooks/device";
import type { MapMarker } from "./GameMap";
import type { Zone } from "@/lib/types";

const GameMap = dynamic(() => import("./GameMap"), { ssr: false });

export function ZoneEditor({
  zone,
  setZone,
  enabled,
  setEnabled,
  editable,
  fix,
  geoStatus,
  markers = [],
}: {
  zone: Zone | null;
  setZone: (z: Zone) => void;
  enabled: boolean;
  /** when given, shows an on/off toggle in the header */
  setEnabled?: (v: boolean) => void;
  editable: boolean;
  fix: GeoFix | null;
  geoStatus: GeoStatus;
  markers?: MapMarker[];
}) {
  const [placing, setPlacing] = useState(false);
  const outside = fix && zone ? distance(zone, fix) - zone.r : null;

  return (
    <Card className="overflow-hidden p-0">
      {enabled && (
        <div className="relative h-72">
          <GameMap
            className="absolute inset-0"
            zone={zone}
            initialCenter={zone ?? fix}
            me={fix}
            fitKey={zone ? `${zone.lat.toFixed(5)},${zone.lng.toFixed(5)},${zone.r}` : undefined}
            onMapClick={editable && placing ? (p) => (setZone({ ...p, r: zone?.r ?? 500 }), setPlacing(false)) : undefined}
            markers={markers}
          />
          {placing && (
            <div className="glass absolute inset-x-3 top-3 z-10 rounded-2xl px-3 py-2 text-center text-sm">Tap the map to set the zone centre</div>
          )}
          {!zone && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
              <div className="glass rounded-2xl px-4 py-2 text-sm text-muted">{fix ? "Setting zone…" : "Waiting for GPS to place the zone…"}</div>
            </div>
          )}
        </div>
      )}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <MapPin className="size-4 text-zone" /> Play zone
          </div>
          <div className="flex items-center gap-3">
            {enabled && zone && <span className="font-mono text-sm tabular">{formatDistance(zone.r * 2)} wide</span>}
            {!enabled && <span className="text-sm text-muted">No boundary</span>}
            {enabled && !zone && <span className="text-sm text-danger">Not set</span>}
            {setEnabled && editable && <Toggle checked={enabled} onChange={setEnabled} />}
          </div>
        </div>
        {editable && enabled && (
          <>
            {zone && (
              <div>
                <div className="mb-1 flex justify-between text-[13px] text-muted">
                  <span>Starting size</span>
                  <span className="font-mono text-ink tabular">radius {formatDistance(zone.r)}</span>
                </div>
                <Slider value={zone.r} min={50} max={3000} step={25} onChange={(r) => setZone({ ...zone, r })} accent="var(--color-zone)" />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setPlacing((v) => !v)}>
                <Crosshair className="size-4" /> {placing ? "Cancel" : "Pick on map"}
              </Button>
              <Button variant="ghost" size="sm" className="flex-1" disabled={!fix} onClick={() => fix && setZone({ lat: fix.lat, lng: fix.lng, r: zone?.r ?? 500 })}>
                <MapPin className="size-4" /> Centre on me
              </Button>
            </div>
          </>
        )}
        <GpsLine status={geoStatus} acc={fix?.acc} outside={outside != null && outside > 0 && enabled ? formatDistance(outside) : null} />
      </div>
    </Card>
  );
}

function GpsLine({ status, acc, outside }: { status: GeoStatus; acc?: number; outside: string | null }) {
  const ok = status === "watching";
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className={cn("size-2 rounded-full", ok ? (acc && acc > 30 ? "bg-hunter" : "bg-ok") : status === "denied" ? "bg-danger" : "bg-faint")} />
      <span className="text-muted">
        {status === "denied"
          ? "Location blocked — enable it in your browser settings"
          : status === "unavailable"
            ? "This device has no GPS"
            : ok
              ? `GPS ready · ±${Math.round(acc ?? 0)} m${outside ? ` · you're ${outside} outside the zone` : ""}`
              : "Waiting for GPS…"}
      </span>
    </div>
  );
}
