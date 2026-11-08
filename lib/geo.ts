const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in metres. */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a to b, degrees clockwise from north (0–360). */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point at `dist` metres and `brg` degrees from `p`. */
export function destination(p: LatLng, dist: number, brg: number): LatLng {
  const d = dist / R;
  const t = toRad(brg);
  const la = toRad(p.lat);
  const lo = toRad(p.lng);
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t));
  const lo2 = lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: toDeg(la2), lng: ((toDeg(lo2) + 540) % 360) - 180 };
}

/** Closed polygon ring approximating a circle, as [lng, lat] pairs. */
export function circleRing(c: LatLng, radius: number, steps = 96): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const p = destination(c, radius, (i / steps) * 360);
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

export function formatDistance(m: number): string {
  if (!isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

export function compassLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

/** Total path length, skipping GPS jumps that imply > maxSpeed m/s. */
export function pathLength(points: { lat: number; lng: number; gms: number; acc?: number | null }[], maxSpeed = 12): number {
  let total = 0;
  let prev: (typeof points)[number] | null = null;
  for (const p of points) {
    if (p.acc != null && p.acc > 50) continue;
    if (prev) {
      const d = distance(prev, p);
      const dt = Math.max(1, (p.gms - prev.gms) / 1000);
      if (d / dt <= maxSpeed && d >= 2) total += d;
    }
    prev = p;
  }
  return total;
}
