# Mountainology — Prominence

An interactive map tool for computing and visualising **topographic prominence** of mountain peaks. Select any peak, set a step interval, and watch the algorithm descend contour by contour — expanding across tile boundaries as needed — until it finds the key col and parent peak.

**[View Live Demo →](https://prominence.vinayakakv.com)**

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
