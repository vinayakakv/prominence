# Mountainology — Prominence

An interactive map tool for computing and visualising **topographic prominence** of mountain peaks. Select any peak, set a step interval, and watch the algorithm descend contour by contour — expanding across tile boundaries as needed — until it finds the key col and parent peak.

**[View Live Demo →](https://prominence.vinayakakv.com)**

## AI Disclaimer

This repository is mostly coded by Claude Code, as you see from the commits. The code quality etc. are good for a PoC, and nowhere near the standards for maintainability and reliability.

## Features

- Step-through or autorun prominence computation with animated island fill
- Terrain and satellite basemaps with contour line overlay
- Peak snapping to nearest DEM local maximum
- Zoom-out and tile expansion when the island reaches the viewport boundary
- Mobile-friendly collapsible sidebar with algorithm trace

## Tech

React · TypeScript · MapLibre GL JS · maplibre-contour · Tailwind CSS v4 · shadcn/ui

## Development

```bash
bun install
bun run dev
```

## Nilgiris field atlas

The separate **`/nilgiris`** page adds elevation colors, hillshade, adaptive labeled
contours, seventeen editorial place labels, click-to-sample DEM heights, and 3D terrain
with adjustable exaggeration. The original prominence explorer remains at `/`
with its existing query parameters and behavior.

Basemap place names and roads/transport are hidden by default, with separate
layer toggles to restore them. Road labels require both toggles. Contour labels
and the seventeen editorial place layers remain independently enabled. Place names use
collision-aware symbol placement, prioritizing Kolaribetta, Ooty, Doddabetta, then
the other summits. Dots stay clickable when a name cannot fit; the sidebar also
provides keyboard-accessible place navigation. Mountains use rust-colored labels
and dots; other places use blue, with a matching sidebar key. Town labels include
Coonoor, Wellington, Kotagiri, and Aruvankadu.

Run `bun run dev`, then open `/nilgiris`. Camera position, zoom, pitch and bearing
are stored in the URL; **Share this view** copies that URL. Layer visibility and
exaggeration are local controls and currently reset on reload. Elevations
can also be viewed with **High plateau stretch**, an optional color scale spanning
an adjustable start elevation up to 2,800 m, with a matching legend. The start
defaults to 2,000 m and can be set from 0 to 2,700 m in 100 m steps. Values below
the selected start share the first color;
the scale stays fixed as you pan. The URL saves `stretch=1` (enabled) or `stretch=0`
and `stretchStart=2000` (metres), restoring both on reload and in shared links.
Missing or invalid starts default to 2,000 m; numeric values are clamped to 0–2,700 m
and rounded to 100 m steps. Place coordinates
are approximate editorial starting points in `src/pages/Nilgiris.tsx`; map labels
come from OpenStreetMap. Sampled heights are approximate DEM values, which can
differ from surveyed summit heights. Contour spacing is not a statement of DEM accuracy.

The page uses OpenFreeMap's Positron style and the existing Mapzen Terrarium DEM
source, capped at zoom 13. Colors, hillshade, contours and 3D share the underlying
DEM cache. The palette and color tile protocol live in `src/lib/nilgirisTerrain.ts`.
No API key or additional dependencies are required. Internet access is needed for
the style, fonts, base-map tiles, and elevation tiles.

### Publication export

**Export for publication** downloads a PNG of the current map framing, camera,
and visible layers. Choose a longest map edge of 2,400 or 3,600 pixels (8 or 12
inches at 300 ppi). These are pixel dimensions; set the intended print resolution
in your publication software. A footer adds the elevation legend when enabled,
place color key, center coordinates, bearing, source credits, and a scale bar for
flat 2D views. 3D exports state the vertical exaggeration instead of a scale bar.
The footer increases the final image height. App controls and inspection pins
are omitted. More output pixels do not increase the underlying DEM accuracy.

Export uses a separate MapLibre instance with the same CSS viewport and a higher
pixel ratio, waits for loaded tiles and settled labels, and releases it afterward.
It requires WebGL and access to the map data sources; failed or timed-out loads
show a retry message instead of downloading a partial map. Rendering lives in
`src/lib/nilgirisExport.ts`. Browser/GPU limits may reduce the pixel dimensions;
the download filename and status report the actual size.

### Static hosting and embedding

`bun run build` emits both `dist/index.html` and `dist/nilgiris/index.html`, with
root-relative assets. Upload the entire `dist` directory to the site root. Static
hosts with directory-index support can serve `/nilgiris/` directly; configure a
redirect from `/nilgiris` to `/nilgiris/` if your host does not do that automatically.
For hosts using SPA rewrites, route `/nilgiris` to `/index.html` instead. No rewrite
of the existing prominence query parameters is needed.

Embed the deployed page in a blog (replace the origin with your deployment):

```html
<iframe
  src="https://your-map-domain.example/nilgiris/"
  title="Interactive topographic map of the Nilgiris"
  width="100%"
  height="720"
  loading="lazy"
  style="border: 0; border-radius: 8px;"
  allow="clipboard-write"
></iframe>
```

Data references: [OpenFreeMap](https://openfreemap.org/quick_start/),
[Mapzen terrain tiles](https://registry.opendata.aws/terrain-tiles/), and
[terrain attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
