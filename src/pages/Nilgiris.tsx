import { ArrowUpRight, Download, Layers, Mountain, RotateCcw, Share2, X } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { contourTileUrl, demSource } from '../lib/contourSource'
import { exportNilgirisView } from '../lib/nilgirisExport'
import { elevationStops, registerElevationColors, sampleElevation } from '../lib/nilgirisTerrain'
import { readPlateauSettings, writePlateauSettings } from '../lib/nilgirisViewState'
import './nilgiris.css'

const HOME = { center: [76.62, 11.4] as [number, number], zoom: 10.2, pitch: 0, bearing: 0 }
// Editorial starting points, approximately located; base-map labels come from OSM.
const places = [
  { name: 'Gudalur', priority: 13, kind: 'Western foothills', lng: 76.5002, lat: 11.5037 },
  // https://mapcarta.com/14870246
  { name: 'Naduvattam', priority: 12, kind: 'Hill town', lng: 76.54438, lat: 11.47989 },
  // https://peakvisor.com/peak/mukurti-peak.html
  { name: 'Mukurthi peak', priority: 4, kind: 'Summit', lng: 76.517613, lat: 11.37138 },
  { name: 'Ooty', priority: 2, kind: 'Plateau town', lng: 76.695, lat: 11.4102 },
  // https://mapcarta.com/35266784
  { name: 'Elk hill', priority: 6, kind: 'Summit', lng: 76.71102, lat: 11.39801 },
  { name: 'Doddabetta peak', priority: 3, kind: 'Summit', lng: 76.7358, lat: 11.4008 },
  { name: 'Avalanche lake', priority: 11, kind: 'Western plateau', lng: 76.5802, lat: 11.3037 },
  // https://mapcarta.com/35266310
  { name: 'Kolaribetta Peak', priority: 1, kind: 'Summit', lng: 76.55722, lat: 11.29124 },
  // https://peakvisor.com/peak/bakasura-malai.html
  { name: 'Bakasuramalai', priority: 5, kind: 'Summit', lng: 76.836439, lat: 11.31654 },
  // https://peakvisor.com/peak/nilgiri-peak.html
  { name: 'Nilgiri Peak', priority: 7, kind: 'Summit', lng: 76.475468, lat: 11.38359 },
  // https://peakvisor.com/peak/anginda.html
  { name: 'Anginda Peak', priority: 8, kind: 'Summit', lng: 76.457943, lat: 11.187283 },
  // https://mapcarta.com/35268900
  { name: 'Perumal Mudi', priority: 9, kind: 'Summit', lng: 76.80688, lat: 11.05419 },
  // https://peakvisor.com/peak/melmudi-peak.html
  { name: 'Mel-mudi Peak', priority: 10, kind: 'Summit', lng: 76.860895, lat: 11.127273 },
  // https://www.geonames.org/advanced-search.html?country=IN&q=N%C4%ABlagiri
  { name: 'Coonoor', priority: 14, kind: 'Hill town', lng: 76.79375, lat: 11.34979 },
  // https://mapcarta.com/14851452
  { name: 'Wellington', priority: 15, kind: 'Cantonment town', lng: 76.78442, lat: 11.36552 },
  // https://www.geonames.org/advanced-search.html?country=IN&q=N%C4%ABlagiri
  { name: 'Kotagiri', priority: 16, kind: 'Hill town', lng: 76.86035, lat: 11.42072 },
  // https://mapcarta.com/Aruvankadu
  { name: 'Aruvankadu', priority: 17, kind: 'Hill town', lng: 76.7579, lat: 11.3632 },
]
const summitColor = '#8b3e29'
const placeColor = '#24557a'
const labelColor = (kind: string) => (kind === 'Summit' ? summitColor : placeColor)

const attribution =
  '<a href="https://registry.opendata.aws/terrain-tiles/">Mapzen terrain</a> · SRTM / GMTED2010: USGS · ETOPO1: NOAA'
const legendGradient = `linear-gradient(to right, ${elevationStops.map((s) => `rgb(${s.color.join(',')}) ${s.height / 28}%`).join(', ')})`

function initialCamera() {
  const params = new URLSearchParams(window.location.search)
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(params.get(key) ?? fallback)
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  }
  return {
    center: [
      number('lng', HOME.center[0], 75.8, 77.3),
      number('lat', HOME.center[1], 10.8, 11.9),
    ] as [number, number],
    zoom: number('zoom', HOME.zoom, 8, 16),
    pitch: number('pitch', 0, 0, 70),
    bearing: number('bearing', 0, -180, 180),
  }
}

type Inspection = { lng: number; lat: number; name?: string; height?: number; failed?: boolean }

export default function Nilgiris() {
  const container = useRef<HTMLElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const inspectRef = useRef<(lng: number, lat: number, name?: string) => void>(() => {})
  const clearPinRef = useRef<() => void>(() => {})
  const [camera] = useState(initialCamera)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [colors, setColors] = useState(true)
  const [plateau] = useState(() => readPlateauSettings(window.location.search))
  const [stretched, setStretched] = useState(plateau.stretched)
  const [stretchStart, setStretchStart] = useState(plateau.stretchStart)
  const [contours, setContours] = useState(true)
  const [relief, setRelief] = useState(true)
  const [basemapNames, setBasemapNames] = useState(false)
  const [basemapRoads, setBasemapRoads] = useState(false)
  const [terrain, setTerrain] = useState(camera.pitch > 0)
  const [exaggeration, setExaggeration] = useState(1.3)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [zoom, setZoom] = useState(camera.zoom)
  const [shareStatus, setShareStatus] = useState('')
  const [panel, setPanel] = useState(false)
  const [exportSize, setExportSize] = useState(3600)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const exportController = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!container.current) return
    const oldTitle = document.title
    document.title = 'The Nilgiris · Mountainology'
    registerElevationColors()
    let active = true
    let sampleController: AbortController | undefined
    let pin: maplibregl.Marker | undefined
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: container.current,
        ...camera,
        minZoom: 8,
        maxZoom: 16,
        maxPitch: 70,
        maxBounds: [
          [75.8, 10.8],
          [77.3, 11.9],
        ],
        attributionControl: { compact: true },
      })
    } catch {
      setError('The map could not start. Check that WebGL is enabled in your browser.')
      return () => {
        document.title = oldTitle
      }
    }
    mapRef.current = map
    // StrictMode can dispose the first map before MapLibre registers its fetch abort handle.
    queueMicrotask(() => {
      if (active) map.setStyle('https://tiles.openfreemap.org/styles/positron')
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    const resizeObserver = new ResizeObserver(() => {
      if (active) map.resize()
    })
    resizeObserver.observe(container.current)
    const inspect = (lng: number, lat: number, name?: string) => {
      sampleController?.abort()
      sampleController = new AbortController()
      const controller = sampleController
      setInspection({ lng, lat, name })
      pin?.remove()
      pin = new maplibregl.Marker({ color: '#a65335', scale: 0.8 }).setLngLat([lng, lat]).addTo(map)
      sampleElevation(lng, lat, controller)
        .then((height) => {
          if (active && !controller.signal.aborted) setInspection({ lng, lat, name, height })
        })
        .catch(() => {
          if (active && !controller.signal.aborted) setInspection({ lng, lat, name, failed: true })
        })
    }
    inspectRef.current = inspect
    clearPinRef.current = () => {
      sampleController?.abort()
      pin?.remove()
    }
    map.on('error', () => {
      if (active)
        setError('Some map data could not load. Check your connection, then reload to retry.')
    })
    map.on('load', () => {
      if (!active) return
      // Keep roads, water, and place labels above the elevation wash.
      const before = map
        .getStyle()
        .layers.find((layer) => layer.type === 'line' || layer.type === 'symbol')?.id
      map.addSource('nilgiris-colors', {
        type: 'raster',
        tiles: ['nilgiris-elevation://{z}/{x}/{y}'],
        tileSize: 256,
        maxzoom: 13,
        attribution,
      })
      map.addLayer(
        {
          id: 'nilgiris-colors',
          type: 'raster',
          source: 'nilgiris-colors',
          paint: { 'raster-opacity': 0.78, 'raster-fade-duration': 150 },
        },
        before,
      )
      for (const id of ['nilgiris-dem', 'nilgiris-shade']) {
        map.addSource(id, {
          type: 'raster-dem',
          tiles: [demSource.sharedDemProtocolUrl],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 13,
          attribution,
        })
      }
      map.addLayer(
        {
          id: 'nilgiris-hillshade',
          type: 'hillshade',
          source: 'nilgiris-shade',
          paint: {
            'hillshade-exaggeration': 0.45,
            'hillshade-shadow-color': '#384d45',
            'hillshade-highlight-color': '#fff7df',
            'hillshade-accent-color': '#746b50',
          },
        },
        before,
      )
      map.addSource('nilgiris-contours', { type: 'vector', tiles: [contourTileUrl], maxzoom: 14 })
      map.addLayer(
        {
          id: 'nilgiris-contours',
          type: 'line',
          source: 'nilgiris-contours',
          'source-layer': 'contours',
          minzoom: 9,
          paint: {
            'line-color': '#665f46',
            'line-opacity': 0.48,
            'line-width': ['case', ['>', ['get', 'level'], 0], 1, 0.45],
          },
        },
        before,
      )
      map.addLayer({
        id: 'nilgiris-contour-labels',
        type: 'symbol',
        source: 'nilgiris-contours',
        'source-layer': 'contours',
        minzoom: 11,
        filter: ['>', ['get', 'level'], 0],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'symbol-spacing': 350,
        },
        paint: { 'text-color': '#64583e', 'text-halo-color': '#f4efdc', 'text-halo-width': 1.2 },
      })
      map.addSource('nilgiris-places', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: places.map(({ lng, lat, ...properties }) => ({
            type: 'Feature',
            properties: { ...properties, color: labelColor(properties.kind) },
            geometry: { type: 'Point', coordinates: [lng, lat] },
          })),
        },
      })
      // Dots remain visible and clickable even when their labels cannot fit.
      map.addLayer({
        id: 'nilgiris-place-points',
        type: 'circle',
        source: 'nilgiris-places',
        paint: {
          'circle-radius': ['case', ['<=', ['get', 'priority'], 3], 4, 3],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fffcef',
          'circle-stroke-width': 1.5,
        },
      })
      map.addLayer({
        id: 'nilgiris-place-labels',
        type: 'symbol',
        source: 'nilgiris-places',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['case', ['<=', ['get', 'priority'], 3], 13, 11],
          // Lower keys get first choice: Kolaribetta, Ooty, Doddabetta, other summits.
          'symbol-sort-key': ['get', 'priority'],
          'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
          'text-radial-offset': 0.7,
          'text-justify': 'auto',
          'text-padding': 5,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': '#fffcef',
          'text-halo-width': 1.5,
        },
      })
      setReady(true)
    })
    const placeAt = (point: maplibregl.Point) => {
      if (!map.getLayer('nilgiris-place-labels')) return undefined
      const features = map.queryRenderedFeatures(
        [
          [point.x - 5, point.y - 5],
          [point.x + 5, point.y + 5],
        ],
        { layers: ['nilgiris-place-labels', 'nilgiris-place-points'] },
      )
      return places
        .filter((place) => features.some((feature) => feature.properties.name === place.name))
        .sort((a, b) => a.priority - b.priority)[0]
    }
    map.on('mousemove', (event) => {
      map.getCanvas().style.cursor = placeAt(event.point) ? 'pointer' : ''
    })
    map.on('click', (event) => {
      const place = placeAt(event.point)
      if (place) {
        inspect(place.lng, place.lat, place.name)
        map.flyTo({ center: [place.lng, place.lat], zoom: 12.5, duration: 1000 })
      } else {
        inspect(event.lngLat.lng, event.lngLat.lat)
      }
    })
    map.on('moveend', () => {
      if (!active) return
      setZoom(map.getZoom())
      const params = new URLSearchParams(window.location.search)
      const center = map.getCenter()
      params.set('lng', center.lng.toFixed(5))
      params.set('lat', center.lat.toFixed(5))
      params.set('zoom', map.getZoom().toFixed(2))
      params.set('pitch', map.getPitch().toFixed(0))
      params.set('bearing', map.getBearing().toFixed(0))
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?${params}${window.location.hash}`,
      )
    })
    return () => {
      active = false
      exportController.current?.abort()
      sampleController?.abort()
      resizeObserver.disconnect()
      pin?.remove()
      map.remove()
      mapRef.current = null
      document.title = oldTitle
    }
  }, [camera])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const [id, visible] of [
      ['nilgiris-colors', colors],
      ['nilgiris-hillshade', relief],
      ['nilgiris-contours', contours],
      ['nilgiris-contour-labels', contours],
    ] as const) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
    }
    map.setTerrain(terrain ? { source: 'nilgiris-dem', exaggeration } : null)
  }, [ready, colors, relief, contours, terrain, exaggeration])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const layer of map.getStyle().layers) {
      // Only style-provided layers: preserve our contour labels and editorial place layers.
      if (layer.id.startsWith('nilgiris-')) continue
      const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
      const transport = sourceLayer === 'transportation' || sourceLayer === 'transportation_name'
      const label = layer.type === 'symbol'
      if (!transport && !label) continue
      const visible = (!transport || basemapRoads) && (!label || basemapNames)
      map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none')
    }
  }, [ready, basemapNames, basemapRoads])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource('nilgiris-colors') as maplibregl.RasterTileSource
    source.setTiles([
      `nilgiris-elevation://${stretched ? `plateau/${stretchStart}/` : ''}{z}/{x}/{y}`,
    ])
  }, [ready, stretched, stretchStart])

  useEffect(() => {
    const params = writePlateauSettings(window.location.search, stretched, stretchStart)
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${params}${window.location.hash}`,
    )
  }, [stretched, stretchStart])

  const exportView = async () => {
    const map = mapRef.current
    if (!map || exportController.current) return
    const controller = new AbortController()
    exportController.current = controller
    setExporting(true)
    setExportStatus('Rendering the current view…')
    try {
      const result = await exportNilgirisView(map, {
        longEdge: exportSize,
        colors,
        stretched,
        stretchStart,
        summitColor,
        placeColor,
        signal: controller.signal,
      })
      if (!controller.signal.aborted) {
        setExportStatus(`Downloaded ${result.width} × ${result.height} px PNG.`)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setExportStatus(error instanceof Error ? error.message : 'Export failed. Please try again.')
      }
    } finally {
      exportController.current = null
      if (!controller.signal.aborted) setExporting(false)
    }
  }

  const toggleTerrain = () => {
    const enabled = !terrain
    setTerrain(enabled)
    mapRef.current?.easeTo({ pitch: enabled ? 55 : 0, duration: 800 })
  }
  const reset = () => {
    setTerrain(false)
    mapRef.current?.flyTo({ ...HOME, duration: 1000 })
  }
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareStatus('Link copied')
    } catch {
      setShareStatus('Copy the URL from your address bar')
    }
  }
  const interval =
    zoom >= 14 ? 10 : zoom >= 13 ? 20 : zoom >= 12 ? 50 : zoom >= 11 ? 100 : zoom >= 10 ? 200 : 500

  return (
    <main className="nilgiris-page">
      <header className="nilgiris-header">
        <a href="/" className="nilgiris-brand">
          <Mountain size={23} strokeWidth={1.4} />
          <span>MOUNTAINOLOGY</span>
        </a>
        <span className="nilgiris-series">FIELD ATLAS</span>
        <button type="button" className="nilgiris-share" onClick={share}>
          <Share2 size={15} />
          <span>{shareStatus || 'Share this view'}</span>
        </button>
      </header>
      <div className="nilgiris-workspace">
        <aside className={`nilgiris-panel ${panel ? 'is-open' : ''}`}>
          <div className="nilgiris-intro">
            <p className="nilgiris-eyebrow">WESTERN GHATS · INDIA</p>
            <h1>
              The Nilgiris<span>A landscape in layers.</span>
            </h1>
            <p>Follow the folds of the Blue Mountains, from the foothills to the high plateau.</p>
          </div>
          <div className="nilgiris-panel-body">
            <section className="nilgiris-section">
              <h2>
                <Layers size={15} /> Read the terrain
              </h2>
              <fieldset className="nilgiris-mode" aria-label="Map dimension">
                <button
                  type="button"
                  disabled={!ready}
                  aria-pressed={!terrain}
                  onClick={() => terrain && toggleTerrain()}
                >
                  2D map
                </button>
                <button
                  type="button"
                  disabled={!ready}
                  aria-pressed={terrain}
                  onClick={() => !terrain && toggleTerrain()}
                >
                  3D terrain
                </button>
              </fieldset>
              {terrain && (
                <label className="nilgiris-slider">
                  Vertical exaggeration <span>{exaggeration.toFixed(1)}×</span>
                  <input
                    type="range"
                    min="1"
                    max="2.5"
                    step="0.1"
                    value={exaggeration}
                    onChange={(e) => setExaggeration(Number(e.target.value))}
                  />
                </label>
              )}
              {[
                { label: 'Elevation colors', value: colors, set: setColors },
                { label: 'Hillshade', value: relief, set: setRelief },
                { label: 'Contour lines', value: contours, set: setContours },
                { label: 'Basemap place names', value: basemapNames, set: setBasemapNames },
                { label: 'Roads & transport', value: basemapRoads, set: setBasemapRoads },
              ].map((option) => (
                <label className="nilgiris-toggle" key={option.label}>
                  <span>{option.label}</span>
                  <input
                    type="checkbox"
                    checked={option.value}
                    onChange={(e) => option.set(e.target.checked)}
                    disabled={!ready}
                  />
                </label>
              ))}
              <label className="nilgiris-toggle">
                <span>High plateau stretch</span>
                <input
                  type="checkbox"
                  checked={stretched}
                  onChange={(e) => setStretched(e.target.checked)}
                  disabled={!ready || !colors}
                />
              </label>
              {stretched && colors && (
                <label className="nilgiris-slider">
                  Stretch starts at <span>{stretchStart.toLocaleString('en-IN')} m</span>
                  <input
                    type="range"
                    min="0"
                    max="2700"
                    step="100"
                    value={stretchStart}
                    onChange={(e) => setStretchStart(Number(e.target.value))}
                    aria-valuetext={`${stretchStart} metres`}
                    disabled={!ready}
                  />
                </label>
              )}
              {stretched && colors && (
                <p className="nilgiris-hint">
                  Full palette across {stretchStart.toLocaleString('en-IN')}–2,800 m. Lower
                  elevations share the first color. The scale stays fixed as you pan.
                </p>
              )}
              <p className="nilgiris-hint">
                {contours
                  ? `${interval} m contour interval · adapts as you zoom`
                  : 'Contours hidden'}
              </p>
            </section>
            <section className="nilgiris-section nilgiris-export">
              <h2>
                <Download size={15} /> Export for publication
              </h2>
              <label className="nilgiris-export-size">
                Map image size
                <select
                  value={exportSize}
                  onChange={(event) => setExportSize(Number(event.target.value))}
                  disabled={exporting}
                >
                  <option value={2400}>2,400 px · 8 inches at 300 ppi</option>
                  <option value={3600}>3,600 px · 12 inches at 300 ppi</option>
                </select>
              </label>
              <p className="nilgiris-hint">
                Longest map edge, plus a legend and source credits. Exports the current framing and
                visible layers as a PNG, without the controls or inspection pin.
              </p>
              <button
                type="button"
                className="nilgiris-export-button"
                disabled={!ready || exporting}
                onClick={exportView}
              >
                <Download size={15} /> {exporting ? 'Preparing PNG…' : 'Download PNG'}
              </button>
              <p className="nilgiris-hint" role="status">
                {exportStatus}
              </p>
            </section>
            <section className="nilgiris-section nilgiris-places">
              <h2>
                Places to explore <span>{String(places.length).padStart(2, '0')}</span>
              </h2>
              <p className="nilgiris-label-key">
                <span style={{ color: summitColor }}>● Mountains</span>
                <span style={{ color: placeColor }}>● Other places</span>
              </p>
              {places.map((place, index) => (
                <button
                  type="button"
                  key={place.name}
                  disabled={!ready}
                  onClick={() => {
                    inspectRef.current(place.lng, place.lat, place.name)
                    mapRef.current?.flyTo({
                      center: [place.lng, place.lat],
                      zoom: 12.5,
                      duration: 1000,
                    })
                    setPanel(false)
                  }}
                >
                  <span className="nilgiris-place-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span style={{ color: labelColor(place.kind) }}>{place.name}</span>
                    <small>{place.kind}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </section>
            <p className="nilgiris-note">
              Click the map to sample elevation.
              <br />
              Drag to explore. Zoom in for finer contours.
            </p>
            <a className="nilgiris-explorer-link" href="/">
              Open the prominence explorer <ArrowUpRight size={14} />
            </a>
          </div>
        </aside>
        <div className="nilgiris-map-wrap">
          <section
            ref={container}
            className="nilgiris-map"
            aria-label="Interactive topographic map of the Nilgiris"
          />
          <div className="nilgiris-map-top">
            <span className="nilgiris-map-tag">
              <i /> NILGIRIS / {terrain ? '3D RELIEF' : 'TOPOGRAPHIC'}
            </span>
            <button type="button" onClick={reset} disabled={!ready} title="Return to regional view">
              <RotateCcw size={14} /> Reset view
            </button>
          </div>
          <button
            type="button"
            className="nilgiris-mobile-toggle"
            onClick={() => setPanel(!panel)}
            aria-expanded={panel}
          >
            <Layers size={16} /> {panel ? 'Close layers & places' : 'Layers & places'}
          </button>
          {!ready && !error && (
            <div className="nilgiris-loading" role="status">
              Loading the landscape…
            </div>
          )}
          {error && (
            <div className="nilgiris-error" role="alert">
              {error}
              <button type="button" onClick={() => window.location.reload()}>
                Reload map
              </button>
            </div>
          )}
          {inspection && (
            <div className="nilgiris-inspection" aria-live="polite">
              <button
                type="button"
                aria-label="Close elevation detail"
                onClick={() => {
                  clearPinRef.current()
                  setInspection(null)
                }}
              >
                <X size={16} />
              </button>
              <p>{inspection.name || 'Elevation at this point'}</p>
              <strong>
                {inspection.failed
                  ? 'Unavailable'
                  : inspection.height === undefined
                    ? 'Sampling…'
                    : `${inspection.height.toLocaleString()} m`}
              </strong>
              <small>
                {inspection.lat.toFixed(4)}° N, {inspection.lng.toFixed(4)}° E
              </small>
              <small>
                Approximate DEM elevation
                {terrain ? ` · terrain shown at ${exaggeration.toFixed(1)}×` : ''}
              </small>
            </div>
          )}
          {colors && (
            <div className="nilgiris-legend">
              <div>
                <span>{stretched ? 'HIGH PLATEAU' : 'ELEVATION'}</span>
                <span>metres above sea level</span>
              </div>
              <div className="nilgiris-gradient" style={{ background: legendGradient }} />
              <div className="nilgiris-legend-ticks">
                {[0, 0.25, 0.5, 0.75].map((fraction) => {
                  const start = stretched ? stretchStart : 0
                  const height = start + (2800 - start) * fraction
                  return (
                    <span key={fraction}>
                      {stretched && fraction === 0 ? '≤' : ''}
                      {height.toLocaleString('en-IN')}
                    </span>
                  )
                })}
                <span>2,800+</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
