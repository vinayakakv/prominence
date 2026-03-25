import { useEffect, useState } from 'react'
import ReactMapGL, { Layer, Source } from 'react-map-gl/maplibre'
import type { LayerProps } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { contourTileUrl } from '../lib/contourSource'

const BASE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const TERRARIUM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']
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

const contourBaseLayerSpec: LayerProps = {
  id: CONTOUR_LAYER_ID,
  type: 'line',
  ...({ 'source-layer': CONTOUR_SOURCE_LAYER } as object),
  minzoom: 9,
  paint: {
    'line-color': [
      'case', ['==', ['get', 'level'], 1], '#666666', '#aaaaaa',
    ] as unknown as string,
    'line-width': [
      'case', ['==', ['get', 'level'], 1], 1.5, 0.75,
    ] as unknown as number,
    'line-opacity': 0.9,
  },
}

const buildSelectedLayerSpec = (selectedElevation: number): LayerProps => ({
  id: CONTOUR_SELECTED_LAYER_ID,
  type: 'line',
  ...({ 'source-layer': CONTOUR_SOURCE_LAYER } as object),
  filter: ['==', ['get', 'ele'], selectedElevation] as unknown as boolean,
  paint: {
    'line-color': '#f97316',
    'line-width': 3,
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
  return {
    longitude: isNaN(parsedLng) ? DEFAULT_VIEW.longitude : parsedLng,
    latitude: isNaN(parsedLat) ? DEFAULT_VIEW.latitude : parsedLat,
    zoom: isNaN(parsedZoom) ? DEFAULT_VIEW.zoom : parsedZoom,
    selectedContour: isNaN(parsedContour) ? null : parsedContour,
  }
}

const MapView = () => {
  const [initialParams] = useState(parseUrlParams)
  const [selectedElevation, setSelectedElevation] = useState<number | null>(initialParams.selectedContour)
  const [isLoadingContours, setIsLoadingContours] = useState(true)
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
    window.history.replaceState(null, '', `?${params.toString()}`)
  }, [mapPosition, selectedElevation])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <ReactMapGL
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
            paint: {
              'hillshade-exaggeration': 0.5,
              'hillshade-illumination-direction': 335,
              'hillshade-shadow-color': '#3d2f1e',
              'hillshade-highlight-color': '#ffffff',
              'hillshade-accent-color': '#3d2f1e',
            },
          }, firstSymbolLayerId)
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
        <Source id={CONTOUR_SOURCE_ID} type="vector" tiles={[contourTileUrl]} maxzoom={15}>
          <Layer {...contourBaseLayerSpec} />
          {selectedElevation !== null && (
            <Layer {...buildSelectedLayerSpec(selectedElevation)} />
          )}
          <Layer {...contourHitLayerSpec} />
        </Source>
      </ReactMapGL>

      {isLoadingContours && (
        <div style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.65)',
          color: '#ffffff',
          padding: '6px 14px 6px 10px',
          borderRadius: 20,
          fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'none',
        }}>
          <div className="contour-spinner" />
          Loading contours…
        </div>
      )}

      {selectedElevation !== null && (
        <div style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(0, 0, 0, 0.72)',
          color: '#ffffff',
          padding: '8px 14px',
          borderRadius: 6,
          fontSize: 14,
          fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'none',
        }}>
          Selected: <strong>{selectedElevation} m</strong>
        </div>
      )}
    </div>
  )
}

export default MapView
