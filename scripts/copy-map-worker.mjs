// MapLibre 6 loads its tile worker from a separate file that bundlers don't emit.
// Copy it into /public so it's served at /maplibre-gl-worker.mjs.
import { copyFileSync } from "node:fs";
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
