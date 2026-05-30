import { useEffect, useRef, useState } from 'react'
import ReactMapGL, { Layer, Source } from 'react-map-gl/maplibre'
import type { LayerProps, MapRef } from 'react-map-gl/maplibre'
import type maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Compass } from 'lucide-react'
import {
  BASE_MAP_STYLE,
  CONTOUR_HIT_LAYER_ID,
  CONTOUR_LAYER_ID,
  CONTOUR_SELECTED_LAYER_ID,
  CONTOUR_SOURCE_ID,
  CONTOUR_SOURCE_LAYER,
  ISLAND_FILL_LAYER_ID,
  MAX_DEM_ZOOM,
  TILE_SIZE,
} from '@/config/map'
import { useElevationOverlay } from '@/hooks/useElevationOverlay'
import { addBaseMapLayers, useBasemapVisibility } from '@/hooks/useMapLayers'
import { usePeakMarkers } from '@/hooks/useMapMarkers'
import { useInitialUrlParams, useSyncUrlParams } from '@/hooks/useUrlMapState'
import type { Basemap, LatLng, MapPosition, Mode, Peak, Phase } from '@/types/app'
import { contourTileUrl } from '../lib/contourSource'
import { snapToPeak } from '../lib/prominenceAlgorithm'
import type { ProminenceContext, ProminenceStep } from '../lib/prominenceAlgorithm'
import { getNextProminenceTransition } from '../lib/prominenceTransition'
import type { ProminenceFillResult } from '../lib/prominenceTransition'
import { getTileCanvasCoordinates } from '../lib/geoTiles'
import { InfoPanel } from './Sidebar'
import { BottomBar } from './MobileStatusBar'
import { stepElevation } from '../lib/elevationStep'

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

const MIN_ISLAND_PIXELS = 20

type FillResult = ProminenceFillResult

const MapView = () => {
  const mapRef = useRef<MapRef>(null)
  const islandCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const peakMarkerRef = useRef<maplibregl.Marker | null>(null)
  const parentMarkerRef = useRef<maplibregl.Marker | null>(null)
  const prominenceCtxRef = useRef<ProminenceContext | null>(null)

  const initialParams = useInitialUrlParams()

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
  const [selectedPeak, setSelectedPeak] = useState<Peak | null>(initialParams.savedPeak)
  const [prominenceCtx, setProminenceCtx] = useState<ProminenceContext | null>(null)
  const [fillResult, setFillResult] = useState<FillResult | null>(null)
  const [history, setHistory] = useState<ProminenceStep[]>([])
  const [paused, setPaused] = useState(false)
  const [stepInterval, setStepInterval] = useState(20)
  const [parentPeak, setParentPeak] = useState<Peak | null>(null)

  // Two-mode UI state
  const [mode, setMode] = useState<Mode>('contour')
  const [contourClickPoint, setContourClickPoint] = useState<LatLng | null>(null)
  const [contourIslandMax, setContourIslandMax] = useState<Peak | null>(null)
  const [infoOpen, setInfoOpen] = useState(() => window.innerWidth >= 768)

  useBasemapVisibility({ mapRef, mapIsLoaded, basemap })
  usePeakMarkers({
    mapRef,
    mapIsLoaded,
    peakMarkerRef,
    parentMarkerRef,
    selectedPeak,
    parentPeak,
  })
  useSyncUrlParams({ mapPosition, selectedElevation, basemap, selectedPeak })
  useElevationOverlay({
    mapRef,
    islandCanvasRef,
    prominenceCtxRef,
    mapPosition,
    selectedElevation,
    mapIsLoaded,
    phase,
    mode,
    contourClickPoint,
    setFillResult,
    setContourIslandMax,
  })

  // Crosshair cursor in prominence mode when idle/done (map click selects peak)
  useEffect(() => {
    const canvas = mapRef.current?.getMap()?.getCanvas()
    if (!canvas) return
    const showCrosshair =
      phase === 'selecting' || (mode === 'prominence' && (phase === 'idle' || phase === 'done'))
    canvas.style.cursor = showCrosshair ? 'crosshair' : ''
  }, [phase, mode])

  useEffect(() => {
    if (phase !== 'running' || !fillResult || !prominenceCtx || paused) return
    if (fillResult.threshold !== prominenceCtx.currentThreshold) return

    setFillResult(null)
    const transition = getNextProminenceTransition({
      context: prominenceCtx,
      fillResult,
      minIslandPixels: MIN_ISLAND_PIXELS,
    })

    if (transition.type === 'lower-threshold') {
      prominenceCtxRef.current = transition.nextContext
      setProminenceCtx(transition.nextContext)
      setSelectedElevation(transition.nextContext.currentThreshold)
      return
    }

    if (transition.type === 'complete') {
      setHistory((h) => [...h, transition.step])
      setPhase('done')
      setParentPeak(transition.parentPeak)
      return
    }

    if (transition.type === 'expand-viewport') {
      setHistory((h) => [...h, transition.step])
      const map = mapRef.current?.getMap()
      if (map) {
        const { tileZ, xMin, xMax, yMin, yMax } = fillResult
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

    setHistory((h) => [...h, transition.step])
    prominenceCtxRef.current = transition.nextContext
    setProminenceCtx(transition.nextContext)
    setSelectedElevation(transition.nextContext.currentThreshold)
  }, [fillResult, phase, paused, prominenceCtx])

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
    setHistory([])
    setPaused(false)
    setParentPeak(null)
    const map = mapRef.current?.getMap()
    if (map && mapIsLoaded) {
      map.setLayoutProperty(ISLAND_FILL_LAYER_ID, 'visibility', 'none')
    }
  }

  const onReset = () => {
    onStop()
    setSelectedPeak(null)
    setSelectedElevation(null)
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
            const tileZ = Math.min(Math.floor(mapPosition.zoom), MAX_DEM_ZOOM)
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
            const tileZ = Math.min(Math.floor(mapPosition.zoom), MAX_DEM_ZOOM)
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
          const islandCanvas = document.createElement('canvas')
          islandCanvas.width = TILE_SIZE
          islandCanvas.height = TILE_SIZE
          islandCanvasRef.current = islandCanvas
          addBaseMapLayers({ map: event.target, islandCanvas })
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
          mapRef.current
            ?.getMap()
            ?.flyTo({ center: [selectedPeak.lng, selectedPeak.lat], zoom: 13, duration: 800 })
        }}
        onStop={onStop}
        onSelectParent={(peak) => {
          onStop()
          setSelectedPeak(peak)
          setPhase('ready')
          mapRef.current?.getMap()?.flyTo({ center: [peak.lng, peak.lat], zoom: 13, duration: 800 })
        }}
        isLoading={isLoading}
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
        onSelectElevation={setSelectedElevation}
      />
    </div>
  )
}

export default MapView
