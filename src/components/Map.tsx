import { useEffect, useRef, useState } from 'react'
import ReactMapGL, { Layer, Source } from 'react-map-gl/maplibre'
import type { LayerProps, MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { contourTileUrl } from '../lib/contourSource'
import { renderElevationFill, getTileCanvasCoordinates, lngLatToTile } from '../lib/elevationFill'
import { stepElevation } from '../lib/elevationStep'

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
  return {
    longitude: isNaN(parsedLng) ? DEFAULT_VIEW.longitude : parsedLng,
    latitude: isNaN(parsedLat) ? DEFAULT_VIEW.latitude : parsedLat,
    zoom: isNaN(parsedZoom) ? DEFAULT_VIEW.zoom : parsedZoom,
    selectedContour: isNaN(parsedContour) ? null : parsedContour,
    basemap: (parsedBasemap === 'satellite' ? 'satellite' : 'hillshade') as Basemap,
  }
}

const BASEMAP_OPTIONS: { id: Basemap; label: string }[] = [
  { id: 'hillshade', label: 'Terrain' },
  { id: 'satellite', label: 'Satellite' },
]

const MapView = () => {
  const mapRef = useRef<MapRef>(null)
  const islandCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [initialParams] = useState(parseUrlParams)
  const [selectedElevation, setSelectedElevation] = useState<number | null>(initialParams.selectedContour)
  const [stepDelta, setStepDelta] = useState(100)
  const [isLoadingContours, setIsLoadingContours] = useState(true)
  const [mapIsLoaded, setMapIsLoaded] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>(initialParams.basemap)
  const [mapPosition, setMapPosition] = useState<MapPosition>({
    longitude: initialParams.longitude,
    latitude: initialParams.latitude,
    zoom: initialParams.zoom,
  })

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('lng', mapPosition.longitude.toFixed(5))
    params.set('lat', mapPosition.latitude.toFixed(5))
    params.set('zoom', mapPosition.zoom.toFixed(2))
    if (selectedElevation !== null) params.set('contour', String(selectedElevation))
    if (basemap !== 'hillshade') params.set('basemap', basemap)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }, [mapPosition, selectedElevation, basemap])

  useEffect(() => {
    if (!mapIsLoaded) return
    const map = mapRef.current?.getMap()
    if (!map) return
    map.setLayoutProperty('terrain-hillshade', 'visibility', basemap === 'hillshade' ? 'visible' : 'none')
    map.setLayoutProperty('satellite-layer', 'visibility', basemap === 'satellite' ? 'visible' : 'none')
  }, [basemap, mapIsLoaded])

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
  }, [selectedElevation, mapPosition, mapIsLoaded])

  return (
    <div className="w-screen h-screen relative">
      <ReactMapGL
        ref={mapRef}
        initialViewState={{ longitude: initialParams.longitude, latitude: initialParams.latitude, zoom: initialParams.zoom }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={BASE_MAP_STYLE}
        interactiveLayerIds={[CONTOUR_HIT_LAYER_ID]}
        onClick={(event) => {
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

          const islandCanvas = document.createElement('canvas')
          islandCanvas.width = 256
          islandCanvas.height = 256
          islandCanvasRef.current = islandCanvas

          mapInstance.addSource('island-fill', {
            type: 'canvas',
            canvas: islandCanvas,
            coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]], // placeholder, updated on first render
            animate: false,
          } as any)

          mapInstance.addLayer({
            id: 'island-fill-layer',
            type: 'raster',
            source: 'island-fill',
            layout: { visibility: 'none' },
            paint: { 'raster-opacity': 0.6 },
          }, firstSymbolLayerId)

          setMapIsLoaded(true)
        }}
        onMoveEnd={(event) => {
          const { longitude, latitude, zoom } = event.viewState
          setMapPosition({ longitude, latitude, zoom })
        }}
        onSourceData={(event) => {
          if ('sourceId' in event && event.sourceId === CONTOUR_SOURCE_ID && !event.isSourceLoaded) {
            setIsLoadingContours(true)
          }
        }}
        onIdle={() => setIsLoadingContours(false)}
      >
        <Source id={CONTOUR_SOURCE_ID} type="vector" tiles={[contourTileUrl]} minzoom={9} maxzoom={15}>
          <Layer {...buildContourBaseLayerSpec(basemap)} />
          {selectedElevation !== null && (
            <Layer {...buildSelectedLayerSpec(selectedElevation)} />
          )}
          <Layer {...contourHitLayerSpec} />
        </Source>
      </ReactMapGL>

      <div className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-1.5 flex flex-col gap-1">
        {BASEMAP_OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setBasemap(id)}
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              basemap === id
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoadingContours && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/65 text-white text-[13px] font-sans px-3.5 py-1.5 pl-2.5 rounded-full flex items-center gap-2 pointer-events-none">
          <div className="size-[14px] rounded-full border-2 border-white/30 border-t-white shrink-0 animate-contour-spin" />
          Loading contours…
        </div>
      )}

      {selectedElevation !== null && (
        <div className="absolute top-4 right-4 bg-black/[0.72] text-white text-sm font-sans rounded-md overflow-hidden">
          <div className="px-3.5 py-2 pointer-events-none">
            Selected: <strong>{selectedElevation} m</strong>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
            <button
              onClick={() => setSelectedElevation(e => e !== null ? stepElevation(e, stepDelta, 'down') : null)}
              className="p-1 rounded hover:bg-white/15 transition-colors cursor-pointer"
              title={`−${stepDelta} m`}
            >
              <ChevronDown size={16} />
            </button>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={stepDelta}
                min={1}
                onChange={e => setStepDelta(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-white/10 text-white text-xs text-center rounded px-1.5 py-1 outline-none focus:bg-white/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-white/60">m</span>
            </div>
            <button
              onClick={() => setSelectedElevation(e => e !== null ? stepElevation(e, stepDelta, 'up') : null)}
              className="p-1 rounded hover:bg-white/15 transition-colors cursor-pointer"
              title={`+${stepDelta} m`}
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default MapView
