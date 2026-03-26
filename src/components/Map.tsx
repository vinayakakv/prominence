import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMapGL, { Layer, Source } from 'react-map-gl/maplibre'
import type { LayerProps, MapRef } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Compass } from 'lucide-react'
import { contourTileUrl } from '../lib/contourSource'
import { renderElevationFill, fetchAndStitchTiles, getTileCanvasCoordinates, lngLatToTile } from '../lib/elevationFill'
import { detectAndRenderIslands } from '../lib/islandDetector'
import { stepProminence, snapToPeak } from '../lib/prominenceAlgorithm'
import type { ProminenceContext, ProminenceStep } from '../lib/prominenceAlgorithm'
import { Sidebar } from './Sidebar'
import type { Phase } from './Sidebar'

const BASE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const TERRARIUM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']
const SATELLITE_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']
const DEFAULT_VIEW = { longitude: 75.35236, latitude: 13.23472, zoom: 12 }

const CONTOUR_SOURCE_ID = 'contour'
const CONTOUR_LAYER_ID = 'contour-lines'
const CONTOUR_SELECTED_LAYER_ID = 'contour-selected'
const CONTOUR_HIT_LAYER_ID = 'contour-hit'
const CONTOUR_SOURCE_LAYER = 'contours'

type Basemap = 'hillshade' | 'satellite'

const contourHitLayerSpec: LayerProps = {
  id: CONTOUR_HIT_LAYER_ID,
  type: 'line',
  ...({ 'source-layer': CONTOUR_SOURCE_LAYER } as object),
  minzoom: 9,
  paint: {
    'line-width': 10,
    'line-opacity': 0,
  },
}

const buildContourBaseLayerSpec = (basemap: Basemap): LayerProps => ({
  id: CONTOUR_LAYER_ID,
  type: 'line',
  ...({ 'source-layer': CONTOUR_SOURCE_LAYER } as object),
  minzoom: 9,
  paint: {
    'line-color': (basemap === 'satellite'
      ? ['case', ['==', ['get', 'level'], 1], '#ffffff', 'rgba(255,255,255,0.55)']
      : ['case', ['==', ['get', 'level'], 1], '#666666', '#aaaaaa']
    ) as unknown as string,
    'line-width': ['case', ['==', ['get', 'level'], 1], 1.5, 0.75] as unknown as number,
    'line-opacity': 0.9,
  },
})

const buildSelectedLayerSpec = (selectedElevation: number): LayerProps => ({
  id: CONTOUR_SELECTED_LAYER_ID,
  type: 'line',
  ...({ 'source-layer': CONTOUR_SOURCE_LAYER } as object),
  filter: ['==', ['get', 'ele'], selectedElevation] as unknown as boolean,
  paint: {
    'line-color': '#f97316',
    'line-width': 2.5,
    'line-opacity': 1,
  },
})

type MapPosition = { longitude: number; latitude: number; zoom: number }

const parseUrlParams = () => {
  const params = new URLSearchParams(window.location.search)
  const parsedLng = parseFloat(params.get('lng') ?? '')
  const parsedLat = parseFloat(params.get('lat') ?? '')
  const parsedZoom = parseFloat(params.get('zoom') ?? '')
  const parsedContour = parseFloat(params.get('contour') ?? '')
  const parsedBasemap = params.get('basemap')
  const parsedPeakLat = parseFloat(params.get('peak_lat') ?? '')
  const parsedPeakLng = parseFloat(params.get('peak_lng') ?? '')
  const parsedPeakEle = parseFloat(params.get('peak_ele') ?? '')
  return {
    longitude: isNaN(parsedLng) ? DEFAULT_VIEW.longitude : parsedLng,
    latitude: isNaN(parsedLat) ? DEFAULT_VIEW.latitude : parsedLat,
    zoom: isNaN(parsedZoom) ? DEFAULT_VIEW.zoom : parsedZoom,
    selectedContour: isNaN(parsedContour) ? null : parsedContour,
    basemap: (parsedBasemap === 'satellite' ? 'satellite' : 'hillshade') as Basemap,
    savedPeak: (!isNaN(parsedPeakLat) && !isNaN(parsedPeakLng) && !isNaN(parsedPeakEle))
      ? { lat: parsedPeakLat, lng: parsedPeakLng, ele: parsedPeakEle }
      : null,
  }
}

const reloadContourTiles = (map: maplibregl.Map) => {
  try {
    (map as any).style.sourceCaches?.[CONTOUR_SOURCE_ID]?.reload()
  } catch {}
}

const createMarkerEl = (color: string) => {
  const el = document.createElement('div')
  el.style.cssText = `width:13px;height:13px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.4);cursor:default`
  return el
}

const MapView = () => {
  const mapRef = useRef<MapRef>(null)
  const islandCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const peakMarkerRef = useRef<maplibregl.Marker | null>(null)
  const parentMarkerRef = useRef<maplibregl.Marker | null>(null)
  const steppingRef = useRef(false)

  const [initialParams] = useState(parseUrlParams)

  // Map state
  const [selectedElevation, setSelectedElevation] = useState<number | null>(initialParams.selectedContour)
  const [stepDelta, setStepDelta] = useState(100)
  const [isLoading, setIsLoading] = useState(true)
  const [mapIsLoaded, setMapIsLoaded] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>(initialParams.basemap)
  const [mapPosition, setMapPosition] = useState<MapPosition>({
    longitude: initialParams.longitude,
    latitude: initialParams.latitude,
    zoom: initialParams.zoom,
  })

  // Prominence state
  const [phase, setPhase] = useState<Phase>(initialParams.savedPeak ? 'ready' : 'idle')
  const [selectedPeak, setSelectedPeak] = useState<{ lat: number; lng: number; ele: number } | null>(initialParams.savedPeak)
  const [prominenceCtx, setProminenceCtx] = useState<ProminenceContext | null>(null)
  const [history, setHistory] = useState<ProminenceStep[]>([])
  const [paused, setPaused] = useState(false)
  const [stepInterval, setStepInterval] = useState(20)
  const [parentPeak, setParentPeak] = useState<{ lat: number; lng: number; ele: number } | null>(null)

  // URL param sync
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('lng', mapPosition.longitude.toFixed(5))
    params.set('lat', mapPosition.latitude.toFixed(5))
    params.set('zoom', mapPosition.zoom.toFixed(2))
    if (selectedElevation !== null) params.set('contour', String(selectedElevation))
    if (basemap !== 'hillshade') params.set('basemap', basemap)
    if (selectedPeak) {
      params.set('peak_lat', selectedPeak.lat.toFixed(5))
      params.set('peak_lng', selectedPeak.lng.toFixed(5))
      params.set('peak_ele', selectedPeak.ele.toFixed(1))
    }
    window.history.replaceState(null, '', `?${params.toString()}`)
  }, [mapPosition, selectedElevation, basemap, selectedPeak])

  // Basemap toggle
  useEffect(() => {
    if (!mapIsLoaded) return
    const map = mapRef.current?.getMap()
    if (!map) return
    map.setLayoutProperty('terrain-hillshade', 'visibility', basemap === 'hillshade' ? 'visible' : 'none')
    map.setLayoutProperty('satellite-layer', 'visibility', basemap === 'satellite' ? 'visible' : 'none')
  }, [basemap, mapIsLoaded])

  // Crosshair cursor during peak selection
  useEffect(() => {
    const canvas = mapRef.current?.getMap()?.getCanvas()
    if (canvas) canvas.style.cursor = phase === 'selecting' ? 'crosshair' : ''
  }, [phase])

  // Normal island fill (disabled during prominence run)
  useEffect(() => {
    if (!mapIsLoaded) return
    if (phase === 'running') return

    const map = mapRef.current?.getMap()
    const canvas = islandCanvasRef.current
    if (!map || !canvas) return

    if (selectedElevation === null) {
      map.setLayoutProperty('island-fill-layer', 'visibility', 'none')
      return
    }

    const tileZ = Math.min(Math.floor(mapPosition.zoom), 13)
    const bounds = map.getBounds()
    const maxTile = Math.pow(2, tileZ) - 1
    const sw = lngLatToTile(bounds.getWest(), bounds.getSouth(), tileZ)
    const ne = lngLatToTile(bounds.getEast(), bounds.getNorth(), tileZ)
    const xMin = Math.max(0, Math.min(sw.x, ne.x))
    const xMax = Math.min(maxTile, Math.max(sw.x, ne.x))
    const yMin = Math.max(0, Math.min(sw.y, ne.y))
    const yMax = Math.min(maxTile, Math.max(sw.y, ne.y))

    let cancelled = false
    renderElevationFill({ canvas, tileZ, xMin, xMax, yMin, yMax, threshold: selectedElevation })
      .then(() => {
        if (cancelled) return
        const source = map.getSource('island-fill') as any
        source.setCoordinates(getTileCanvasCoordinates(tileZ, xMin, yMin, xMax, yMax))
        source.play()
        requestAnimationFrame(() => { if (!cancelled) source.pause() })
        map.setLayoutProperty('island-fill-layer', 'visibility', 'visible')
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedElevation, mapPosition, mapIsLoaded, phase])

  // Peak marker
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !mapIsLoaded) return
    peakMarkerRef.current?.remove()
    peakMarkerRef.current = null
    if (!selectedPeak) return
    peakMarkerRef.current = new maplibregl.Marker({ element: createMarkerEl('#3b82f6') })
      .setLngLat([selectedPeak.lng, selectedPeak.lat])
      .addTo(map)
  }, [selectedPeak, mapIsLoaded])

  // Parent peak marker
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !mapIsLoaded) return
    parentMarkerRef.current?.remove()
    parentMarkerRef.current = null
    if (!parentPeak) return
    parentMarkerRef.current = new maplibregl.Marker({ element: createMarkerEl('#f97316') })
      .setLngLat([parentPeak.lng, parentPeak.lat])
      .addTo(map)
  }, [parentPeak, mapIsLoaded])

  const renderProminenceCanvases = useCallback((
    data: Float32Array, width: number, height: number,
    threshold: number, tileZ: number, xMin: number, yMin: number, xMax: number, yMax: number,
  ) => {
    const map = mapRef.current?.getMap()
    const fillCanvas = islandCanvasRef.current
    if (!map || !fillCanvas) return

    detectAndRenderIslands(fillCanvas, data, width, height, threshold, tileZ, xMin, yMin)
    const fillSource = map.getSource('island-fill') as any
    fillSource.setCoordinates(getTileCanvasCoordinates(tileZ, xMin, yMin, xMax, yMax))
    fillSource.play()
    requestAnimationFrame(() => fillSource.pause())
    map.setLayoutProperty('island-fill-layer', 'visibility', 'visible')
  }, [])

  const executeStep = useCallback(async (ctx: ProminenceContext) => {
    if (steppingRef.current) return
    steppingRef.current = true
    try {
      const { ctx: nextCtx, step, data, width, height } = await stepProminence(ctx)
      const { tileZ, xMin, yMin, xMax, yMax } = nextCtx
      const threshold = step.done ? step.keyColEle : ctx.currentThreshold

      renderProminenceCanvases(data, width, height, threshold, tileZ, xMin, yMin, xMax, yMax)

      // Keep URL contour param and selected contour highlight in sync with current threshold
      setSelectedElevation(threshold)

      // Zoom map to show expanded tile coverage, pause until animation + tile load settles
      if (!step.done && step.expandedTiles) {
        const coords = getTileCanvasCoordinates(nextCtx.tileZ, nextCtx.xMin, nextCtx.yMin, nextCtx.xMax, nextCtx.yMax)
        const swLng = coords[3][0], swLat = coords[2][1]
        const neLng = coords[1][0], neLat = coords[0][1]
        const map = mapRef.current?.getMap()
        if (map) {
          setPaused(true)
          map.fitBounds([[swLng, swLat], [neLng, neLat]], { padding: 40, duration: 700 })
          map.once('idle', () => {
            renderProminenceCanvases(data, width, height, threshold, nextCtx.tileZ, nextCtx.xMin, nextCtx.yMin, nextCtx.xMax, nextCtx.yMax)
            reloadContourTiles(map)
            setPaused(false)
          })
        }
      }

      setHistory(h => [...h, step])

      if (step.done) {
        setPhase('done')
        setParentPeak(step.parentPeak)
        setProminenceCtx(nextCtx)
      } else {
        setProminenceCtx(nextCtx)
      }
    } catch {
      setPaused(true)
    } finally {
      steppingRef.current = false
    }
  }, [renderProminenceCanvases])

  // Auto-run prominence steps
  useEffect(() => {
    if (phase !== 'running' || paused || !prominenceCtx) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) executeStep(prominenceCtx)
    }, 80)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [phase, paused, prominenceCtx, executeStep])

  const onToggleSelectPeak = () => {
    if (phase === 'selecting') {
      setPhase(selectedPeak ? 'ready' : 'idle')
    } else if (phase === 'idle' || phase === 'ready') {
      setPhase('selecting')
    }
  }

  const onCompute = () => {
    if (!selectedPeak || !mapIsLoaded) return
    const map = mapRef.current?.getMap()
    if (!map) return

    const tileZ = Math.min(Math.floor(mapPosition.zoom), 13)
    const bounds = map.getBounds()
    const maxTile = Math.pow(2, tileZ) - 1
    const sw = lngLatToTile(bounds.getWest(), bounds.getSouth(), tileZ)
    const ne = lngLatToTile(bounds.getEast(), bounds.getNorth(), tileZ)

    const ctx: ProminenceContext = {
      peakLat: selectedPeak.lat,
      peakLng: selectedPeak.lng,
      peakEle: selectedPeak.ele,
      tileZ,
      xMin: Math.max(0, Math.min(sw.x, ne.x)),
      xMax: Math.min(maxTile, Math.max(sw.x, ne.x)),
      yMin: Math.max(0, Math.min(sw.y, ne.y)),
      yMax: Math.min(maxTile, Math.max(sw.y, ne.y)),
      stepInterval,
      currentThreshold: selectedPeak.ele - stepInterval,
    }

    // Render fill snapshot at starting elevation before first step
    if (selectedElevation !== null) {
      const { xMin: cx, xMax: cX, yMin: cy, yMax: cY } = ctx
      fetchAndStitchTiles({ tileZ, xMin: cx, xMax: cX, yMin: cy, yMax: cY })
        .then(({ data, width, height }) => {
          renderProminenceCanvases(data, width, height, ctx.currentThreshold, tileZ, cx, cy, cX, cY)
        })
        .catch(() => {})
    }

    setProminenceCtx(ctx)
    setHistory([])
    setParentPeak(null)
    setPaused(false)
    setPhase('running')
  }

  const onStep = () => {
    if (!prominenceCtx || phase !== 'running') return
    executeStep(prominenceCtx)
  }

  const onTogglePause = () => setPaused(p => !p)

  const onReset = () => {
    setPhase(selectedPeak ? 'ready' : 'idle')
    setProminenceCtx(null)
    setHistory([])
    setPaused(false)
    setParentPeak(null)
    const map = mapRef.current?.getMap()
    if (map && mapIsLoaded) {
      map.setLayoutProperty('island-fill-layer', 'visibility', 'none')
    }
  }

  return (
    <div className="w-screen h-screen relative">
      <ReactMapGL
        ref={mapRef}
        initialViewState={{ longitude: initialParams.longitude, latitude: initialParams.latitude, zoom: initialParams.zoom }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={BASE_MAP_STYLE}
        interactiveLayerIds={[CONTOUR_HIT_LAYER_ID]}
        onClick={(event) => {
          if (phase === 'selecting') {
            const { lng, lat } = event.lngLat
            const tileZ = Math.min(Math.floor(mapPosition.zoom), 13)
            setPhase('ready')
            setSelectedPeak(null)
            snapToPeak(lat, lng, tileZ)
              .then(peak => setSelectedPeak(peak))
              .catch(() => setPhase('selecting'))
            return
          }
          const clickedFeature = event.features?.[0]
          const elevation = clickedFeature?.properties?.ele as number | undefined
          setSelectedElevation(elevation ?? null)
        }}
        onLoad={(event) => {
          const mapInstance = event.target
          const firstSymbolLayerId = mapInstance.getStyle().layers?.find(layer => layer.type === 'symbol')?.id

          mapInstance.addSource('satellite', {
            type: 'raster',
            tiles: SATELLITE_TILES,
            tileSize: 256,
            maxzoom: 19,
          })
          mapInstance.addLayer({
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            layout: { visibility: 'none' },
          }, firstSymbolLayerId)

          mapInstance.addSource('terrain-dem', {
            type: 'raster-dem',
            tiles: TERRARIUM_TILES,
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 13,
          })
          mapInstance.addLayer({
            id: 'terrain-hillshade',
            type: 'hillshade',
            source: 'terrain-dem',
            layout: { visibility: 'visible' },
            paint: {
              'hillshade-exaggeration': 0.5,
              'hillshade-illumination-direction': 335,
              'hillshade-shadow-color': '#3d2f1e',
              'hillshade-highlight-color': '#ffffff',
              'hillshade-accent-color': '#3d2f1e',
            },
          }, firstSymbolLayerId)

          // Island fill canvas
          const islandCanvas = document.createElement('canvas')
          islandCanvas.width = 256; islandCanvas.height = 256
          islandCanvasRef.current = islandCanvas
          mapInstance.addSource('island-fill', {
            type: 'canvas', canvas: islandCanvas,
            coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]],
            animate: false,
          } as any)
          mapInstance.addLayer({
            id: 'island-fill-layer', type: 'raster', source: 'island-fill',
            layout: { visibility: 'none' },
            paint: { 'raster-opacity': 0.6 },
          }, firstSymbolLayerId)

          // Retry failed contour tiles automatically
          let retryTimer: ReturnType<typeof setTimeout> | null = null
          mapInstance.on('error', () => {
            if (retryTimer) return
            retryTimer = setTimeout(() => {
              reloadContourTiles(mapInstance)
              retryTimer = null
            }, 2000)
          })

          setMapIsLoaded(true)
        }}
        onMoveEnd={(event) => {
          const { longitude, latitude, zoom } = event.viewState
          setMapPosition({ longitude, latitude, zoom })
        }}
        onSourceData={(event) => {
          if ('isSourceLoaded' in event && !event.isSourceLoaded) setIsLoading(true)
        }}
        onIdle={() => setIsLoading(false)}
      >
        <Source id={CONTOUR_SOURCE_ID} type="vector" tiles={[contourTileUrl]} minzoom={9} maxzoom={15}>
          <Layer {...buildContourBaseLayerSpec(basemap)} />
          {selectedElevation !== null && (
            <Layer {...buildSelectedLayerSpec(selectedElevation)} />
          )}
          <Layer {...contourHitLayerSpec} />
        </Source>

        {selectedPeak && parentPeak && (
          <Source type="geojson" data={{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[selectedPeak.lng, selectedPeak.lat], [parentPeak.lng, parentPeak.lat]] },
            properties: {},
          }}>
            <Layer
              type="line"
              paint={{ 'line-color': '#f97316', 'line-width': 1.5, 'line-opacity': 0.8, 'line-dasharray': [5, 3] } as any}
            />
          </Source>
        )}
      </ReactMapGL>

      <button
        onClick={() => mapRef.current?.getMap()?.resetNorth({ duration: 500 })}
        className="absolute right-3 top-3 z-20 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-2 text-gray-700 hover:bg-white transition-colors"
        title="Reset to north"
      >
        <Compass size={18} />
      </button>

      <Sidebar
        basemap={basemap}
        setBasemap={setBasemap}
        selectedElevation={selectedElevation}
        setSelectedElevation={setSelectedElevation}
        stepDelta={stepDelta}
        setStepDelta={setStepDelta}
        isLoading={isLoading}
        phase={phase}
        selectedPeak={selectedPeak}
        history={history}
        paused={paused}
        stepInterval={stepInterval}
        setStepInterval={setStepInterval}
        onToggleSelectPeak={onToggleSelectPeak}
        onZoomToPeak={() => {
          if (!selectedPeak) return
          mapRef.current?.getMap()?.flyTo({ center: [selectedPeak.lng, selectedPeak.lat], zoom: 13, duration: 800 })
        }}
        onCompute={onCompute}
        onStep={onStep}
        onTogglePause={onTogglePause}
        onReset={onReset}
      />
    </div>
  )
}

export default MapView
