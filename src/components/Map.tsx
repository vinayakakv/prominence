import { useEffect, useRef, useState } from 'react'
import ReactMapGL, { Layer, Source } from 'react-map-gl/maplibre'
import type { LayerProps, MapRef } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Compass } from 'lucide-react'
import { contourTileUrl } from '../lib/contourSource'
import { renderElevationFill, getTileCanvasCoordinates, lngLatToTile } from '../lib/elevationFill'
import { detectIslandContaining, stitchedPixelToLatLng } from '../lib/islandDetector'
import { lngLatToPixelIdx, snapToPeak } from '../lib/prominenceAlgorithm'
import type { ProminenceContext, ProminenceStep } from '../lib/prominenceAlgorithm'
import { InfoPanel } from './Sidebar'
import { BottomBar } from './MobileStatusBar'
import type { Phase, Mode, Basemap } from './Sidebar'
import { stepElevation } from '../lib/elevationStep'

const BASE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const TERRARIUM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']
const SATELLITE_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
]
const DEFAULT_VIEW = { longitude: 75.35236, latitude: 13.23472, zoom: 12 }

const CONTOUR_SOURCE_ID = 'contour'
const CONTOUR_LAYER_ID = 'contour-lines'
const CONTOUR_SELECTED_LAYER_ID = 'contour-selected'
const CONTOUR_HIT_LAYER_ID = 'contour-hit'
const CONTOUR_SOURCE_LAYER = 'contours'

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
      : ['case', ['==', ['get', 'level'], 1], '#666666', '#aaaaaa']) as unknown as string,
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
    longitude: Number.isNaN(parsedLng) ? DEFAULT_VIEW.longitude : parsedLng,
    latitude: Number.isNaN(parsedLat) ? DEFAULT_VIEW.latitude : parsedLat,
    zoom: Number.isNaN(parsedZoom) ? DEFAULT_VIEW.zoom : parsedZoom,
    selectedContour: Number.isNaN(parsedContour) ? null : parsedContour,
    basemap: (parsedBasemap === 'satellite' ? 'satellite' : 'hillshade') as Basemap,
    savedPeak:
      !Number.isNaN(parsedPeakLat) && !Number.isNaN(parsedPeakLng) && !Number.isNaN(parsedPeakEle)
        ? { lat: parsedPeakLat, lng: parsedPeakLng, ele: parsedPeakEle }
        : null,
  }
}


const createMarkerEl = (color: string) => {
  const markerEl = document.createElement('div')
  markerEl.style.cssText = `width:13px;height:13px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.4);cursor:default`
  return markerEl
}

const MIN_ISLAND_PIXELS = 20

type FillResult = {
  island: ReturnType<typeof detectIslandContaining>
  threshold: number
  tileZ: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  width: number
  height: number
}

const MapView = () => {
  const mapRef = useRef<MapRef>(null)
  const islandCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const peakMarkerRef = useRef<maplibregl.Marker | null>(null)
  const parentMarkerRef = useRef<maplibregl.Marker | null>(null)
  const prominenceCtxRef = useRef<ProminenceContext | null>(null)

  const [initialParams] = useState(parseUrlParams)

  // Map state
  const [selectedElevation, setSelectedElevation] = useState<number | null>(
    initialParams.selectedContour,
  )
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
  const [selectedPeak, setSelectedPeak] = useState<{
    lat: number
    lng: number
    ele: number
  } | null>(initialParams.savedPeak)
  const [prominenceCtx, setProminenceCtx] = useState<ProminenceContext | null>(null)
  const [fillResult, setFillResult] = useState<FillResult | null>(null)
  const [history, setHistory] = useState<ProminenceStep[]>([])
  const [paused, setPaused] = useState(false)
  const [stepInterval, setStepInterval] = useState(20)
  const [parentPeak, setParentPeak] = useState<{ lat: number; lng: number; ele: number } | null>(
    null,
  )

  // Two-mode UI state
  const [mode, setMode] = useState<Mode>('contour')
  const [contourClickPoint, setContourClickPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [contourIslandMax, setContourIslandMax] = useState<{ lat: number; lng: number; ele: number } | null>(null)
  const [infoOpen, setInfoOpen] = useState(() => window.innerWidth >= 768)

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
    map.setLayoutProperty(
      'terrain-hillshade',
      'visibility',
      basemap === 'hillshade' ? 'visible' : 'none',
    )
    map.setLayoutProperty(
      'satellite-layer',
      'visibility',
      basemap === 'satellite' ? 'visible' : 'none',
    )
  }, [basemap, mapIsLoaded])

  // Crosshair cursor in prominence mode when idle/done (map click selects peak)
  useEffect(() => {
    const canvas = mapRef.current?.getMap()?.getCanvas()
    if (!canvas) return
    const showCrosshair =
      phase === 'selecting' ||
      (mode === 'prominence' && (phase === 'idle' || phase === 'done'))
    canvas.style.cursor = showCrosshair ? 'crosshair' : ''
  }, [phase, mode])

  // Island fill — runs for all elevation selections including during prominence
  useEffect(() => {
    if (!mapIsLoaded) return

    const map = mapRef.current?.getMap()
    const canvas = islandCanvasRef.current
    if (!map || !canvas) return

    if (selectedElevation === null) {
      map.setLayoutProperty('island-fill-layer', 'visibility', 'none')
      return
    }

    const tileZ = Math.min(Math.floor(mapPosition.zoom), 13)
    const bounds = map.getBounds()
    const maxTile = 2 ** tileZ - 1
    const sw = lngLatToTile({ lng: bounds.getWest(), lat: bounds.getSouth(), zoomLevel: tileZ })
    const ne = lngLatToTile({ lng: bounds.getEast(), lat: bounds.getNorth(), zoomLevel: tileZ })
    const xMin = Math.max(0, Math.min(sw.x, ne.x))
    const xMax = Math.min(maxTile, Math.max(sw.x, ne.x))
    const yMin = Math.max(0, Math.min(sw.y, ne.y))
    const yMax = Math.min(maxTile, Math.max(sw.y, ne.y))

    let cancelled = false
    renderElevationFill({ canvas, tileZ, xMin, xMax, yMin, yMax, threshold: selectedElevation })
      .then(({ data, width, height }) => {
        if (cancelled) return
        const source = map.getSource('island-fill') as maplibregl.CanvasSource
        source.setCoordinates(getTileCanvasCoordinates({ zoomLevel: tileZ, xMin, yMin, xMax, yMax }))
        source.play()
        requestAnimationFrame(() => {
          if (!cancelled) source.pause()
        })
        map.setLayoutProperty('island-fill-layer', 'visibility', 'visible')

        // During prominence: detect the peak's island and signal the algorithm
        const ctx = prominenceCtxRef.current
        if (ctx && phase === 'running') {
          const seedIdx = lngLatToPixelIdx({
            lat: ctx.peakLat,
            lng: ctx.peakLng,
            tileZ,
            xMin,
            yMin,
            width,
            height,
          })
          const island = detectIslandContaining({ data, width, height, threshold: ctx.currentThreshold, seedIdx })
          setFillResult({
            island,
            threshold: ctx.currentThreshold,
            tileZ,
            xMin,
            xMax,
            yMin,
            yMax,
            width,
            height,
          })
        }

        // Contour mode: detect island max elevation for the clicked contour point
        if (mode === 'contour' && contourClickPoint && selectedElevation !== null) {
          const seedIdx = lngLatToPixelIdx({
            lat: contourClickPoint.lat,
            lng: contourClickPoint.lng,
            tileZ,
            xMin,
            yMin,
            width,
            height,
          })
          const island = detectIslandContaining({ data, width, height, threshold: selectedElevation, seedIdx })
          if (island) {
            const maxLatLng = stitchedPixelToLatLng({ pixelIdx: island.maxEleIdx, width, tileZ, xMin, yMin })
            setContourIslandMax({ ...maxLatLng, ele: island.maxEle })
          } else {
            setContourIslandMax(null)
          }
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedElevation, mapPosition, mapIsLoaded, phase, mode, contourClickPoint])

  // Algorithm advance — reactive state machine driven by fillResult
  useEffect(() => {
    if (phase !== 'running' || !fillResult || !prominenceCtx || paused) return
    if (fillResult.threshold !== prominenceCtx.currentThreshold) return

    const { island, threshold, tileZ, xMin, xMax, yMin, yMax, width } = fillResult
    const { peakEle, stepInterval } = prominenceCtx

    setFillResult(null)

    if (!island) {
      // Peak not in island — lower threshold
      const next = threshold - stepInterval
      const nextCtx = { ...prominenceCtx, currentThreshold: next }
      prominenceCtxRef.current = nextCtx
      setProminenceCtx(nextCtx)
      setSelectedElevation(next)
      return
    }

    // Parent peak found
    if (island.maxEle > peakEle && island.pixels.length >= MIN_ISLAND_PIXELS) {
      const parentLatLng = stitchedPixelToLatLng({ pixelIdx: island.maxEleIdx, width, tileZ, xMin, yMin })
      const doneStep: ProminenceStep = {
        threshold,
        done: true,
        keyColEle: threshold,
        prominence: peakEle - threshold,
        parentPeak: { ...parentLatLng, ele: island.maxEle },
      }
      setHistory((h) => [...h, doneStep])
      setPhase('done')
      setParentPeak({ ...parentLatLng, ele: island.maxEle })
      return
    }

    // Island touches viewport boundary → expand by zooming out
    if (island.touchesBoundary) {
      setHistory((h) => [
        ...h,
        {
          threshold,
          touchesBoundary: true,
          expandedTiles: false,
          depthSoFar: peakEle - threshold,
          done: false,
        },
      ])
      const map = mapRef.current?.getMap()
      if (map) {
        const coords = getTileCanvasCoordinates({ zoomLevel: tileZ, xMin, yMin, xMax, yMax })
        const sw: [number, number] = [coords[3][0], coords[2][1]]
        const ne: [number, number] = [coords[1][0], coords[0][1]]
        setPaused(true)
        map.fitBounds([sw, ne], { padding: 80, duration: 700 })
        map.once('idle', () => {
          setPaused(false)
        })
      }
      return
    }

    // Normal step — lower threshold
    setHistory((h) => [
      ...h,
      {
        threshold,
        touchesBoundary: false,
        expandedTiles: false,
        depthSoFar: peakEle - threshold,
        done: false,
      },
    ])
    const next = threshold - stepInterval
    const nextCtx = { ...prominenceCtx, currentThreshold: next }
    prominenceCtxRef.current = nextCtx
    setProminenceCtx(nextCtx)
    setSelectedElevation(next)
  }, [fillResult, phase, paused, prominenceCtx])

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

  const onCompute = () => {
    if (!selectedPeak || !mapIsLoaded) return
    const startThreshold = selectedPeak.ele - stepInterval
    const ctx: ProminenceContext = {
      peakLat: selectedPeak.lat,
      peakLng: selectedPeak.lng,
      peakEle: selectedPeak.ele,
      stepInterval,
      currentThreshold: startThreshold,
    }
    prominenceCtxRef.current = ctx
    setProminenceCtx(ctx)
    setSelectedElevation(startThreshold)
    setHistory([])
    setParentPeak(null)
    setFillResult(null)
    setPaused(false)
    setPhase('running')
  }

  const onStep = () => {
    if (phase !== 'running' || !paused) return
    setPaused(false)
  }

  const onTogglePause = () => setPaused((p) => !p)

  const onStop = () => {
    prominenceCtxRef.current = null
    setPhase('ready')
    setProminenceCtx(null)
    setFillResult(null)
    setSelectedElevation(null)
    setHistory([])
    setPaused(false)
    setParentPeak(null)
    const map = mapRef.current?.getMap()
    if (map && mapIsLoaded) {
      map.setLayoutProperty('island-fill-layer', 'visibility', 'none')
    }
  }

  const onReset = () => {
    onStop()
    setSelectedPeak(null)
    setPhase('idle')
  }

  const onSetMode = (newMode: Mode) => {
    setMode(newMode)
    // Clear mode-specific state on switch
    if (newMode === 'prominence') {
      setContourClickPoint(null)
      setContourIslandMax(null)
    } else {
      if (phase === 'running' || phase === 'done') {
        onReset()
      }
    }
  }

  const onZoomToContourMax = () => {
    if (!contourIslandMax) return
    mapRef.current?.getMap()?.flyTo({
      center: [contourIslandMax.lng, contourIslandMax.lat],
      zoom: 13,
      duration: 800,
    })
  }

  return (
    <div className="w-screen h-dvh relative">
      <ReactMapGL
        ref={mapRef}
        initialViewState={{
          longitude: initialParams.longitude,
          latitude: initialParams.latitude,
          zoom: initialParams.zoom,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={BASE_MAP_STYLE}
        interactiveLayerIds={[CONTOUR_HIT_LAYER_ID]}
        onClick={(event) => {
          if (mode === 'prominence') {
            if (phase === 'running') return
            if (phase === 'done') onReset()
            const { lng, lat } = event.lngLat
            const tileZ = Math.min(Math.floor(mapPosition.zoom), 13)
            setPhase('ready')
            setSelectedPeak(null)
            snapToPeak({ lat, lng, tileZ })
              .then((peak) => setSelectedPeak(peak))
              .catch(() => setPhase('idle'))
            return
          }
          // Contour mode
          if (phase === 'selecting') {
            const { lng, lat } = event.lngLat
            const tileZ = Math.min(Math.floor(mapPosition.zoom), 13)
            setPhase('ready')
            setSelectedPeak(null)
            snapToPeak({ lat, lng, tileZ })
              .then((peak) => setSelectedPeak(peak))
              .catch(() => setPhase('selecting'))
            return
          }
          const clickedFeature = event.features?.[0]
          const elevation = clickedFeature?.properties?.ele as number | undefined
          if (elevation !== undefined) {
            setSelectedElevation(elevation)
            setContourClickPoint({ lat: event.lngLat.lat, lng: event.lngLat.lng })
            setContourIslandMax(null)
          } else {
            setSelectedElevation(null)
            setContourClickPoint(null)
            setContourIslandMax(null)
          }
        }}
        onLoad={(event) => {
          const mapInstance = event.target
          const firstSymbolLayerId = mapInstance
            .getStyle()
            .layers?.find((layer) => layer.type === 'symbol')?.id

          mapInstance.addSource('satellite', {
            type: 'raster',
            tiles: SATELLITE_TILES,
            tileSize: 256,
            maxzoom: 19,
          })
          mapInstance.addLayer(
            {
              id: 'satellite-layer',
              type: 'raster',
              source: 'satellite',
              layout: { visibility: 'none' },
            },
            firstSymbolLayerId,
          )

          mapInstance.addSource('terrain-dem', {
            type: 'raster-dem',
            tiles: TERRARIUM_TILES,
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 13,
          })
          mapInstance.addLayer(
            {
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
            },
            firstSymbolLayerId,
          )

          // Island fill canvas
          const islandCanvas = document.createElement('canvas')
          islandCanvas.width = 256
          islandCanvas.height = 256
          islandCanvasRef.current = islandCanvas
          mapInstance.addSource('island-fill', {
            type: 'canvas',
            canvas: islandCanvas,
            coordinates: [
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
            animate: false,
          })
          mapInstance.addLayer(
            {
              id: 'island-fill-layer',
              type: 'raster',
              source: 'island-fill',
              layout: { visibility: 'none' },
              paint: { 'raster-opacity': 0.6 },
            },
            firstSymbolLayerId,
          )

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
        <Source
          id={CONTOUR_SOURCE_ID}
          type="vector"
          tiles={[contourTileUrl]}
          minzoom={9}
          maxzoom={15}
        >
          <Layer {...buildContourBaseLayerSpec(basemap)} />
          {selectedElevation !== null && <Layer {...buildSelectedLayerSpec(selectedElevation)} />}
          <Layer {...contourHitLayerSpec} />
        </Source>

        {selectedPeak && parentPeak && (
          <Source
            type="geojson"
            data={{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [selectedPeak.lng, selectedPeak.lat],
                  [parentPeak.lng, parentPeak.lat],
                ],
              },
              properties: {},
            }}
          >
            <Layer
              type="line"
              paint={{
                'line-color': '#f97316',
                'line-width': 1.5,
                'line-opacity': 0.8,
                'line-dasharray': [5, 3],
              }}
            />
          </Source>
        )}
      </ReactMapGL>

      <button
        type="button"
        onClick={() => mapRef.current?.getMap()?.resetNorth({ duration: 500 })}
        className="absolute left-3 top-3 z-20 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-2 text-gray-700 hover:bg-white transition-colors"
        title="Reset to north"
      >
        <Compass size={18} />
      </button>

      <BottomBar
        mode={mode}
        onSetMode={onSetMode}
        phase={phase}
        selectedElevation={selectedElevation}
        onStepElevation={(direction) =>
          setSelectedElevation((prev) =>
            prev !== null ? stepElevation(prev, stepDelta, direction) : prev,
          )
        }
        contourIslandMax={contourIslandMax}
        onZoomToContourMax={onZoomToContourMax}
        onClearElevation={() => {
          setSelectedElevation(null)
          setContourClickPoint(null)
          setContourIslandMax(null)
        }}
        selectedPeak={selectedPeak}
        history={history}
        paused={paused}
        infoOpen={infoOpen}
        onToggleInfo={() => setInfoOpen((open) => !open)}
        onCompute={onCompute}
        onTogglePause={onTogglePause}
        onStep={onStep}
        onZoomToPeak={() => {
          if (!selectedPeak) return
          mapRef.current?.getMap()?.flyTo({ center: [selectedPeak.lng, selectedPeak.lat], zoom: 13, duration: 800 })
        }}
        onStop={onStop}
        onSelectParent={(peak) => {
          onStop()
          setSelectedPeak(peak)
          setPhase('ready')
          mapRef.current?.getMap()?.flyTo({ center: [peak.lng, peak.lat], zoom: 13, duration: 800 })
        }}
      />

      <InfoPanel
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        basemap={basemap}
        setBasemap={setBasemap}
        stepDelta={stepDelta}
        setStepDelta={setStepDelta}
        stepInterval={stepInterval}
        setStepInterval={setStepInterval}
        selectedElevation={selectedElevation}
        history={history}
        isLoading={isLoading}
        onSelectElevation={setSelectedElevation}
      />
    </div>
  )
}

export default MapView
