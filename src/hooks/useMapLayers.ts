import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import type maplibregl from 'maplibre-gl'
import {
  ISLAND_FILL_LAYER_ID,
  ISLAND_FILL_SOURCE_ID,
  SATELLITE_LAYER_ID,
  SATELLITE_SOURCE_ID,
  SATELLITE_TILES,
  TERRAIN_DEM_SOURCE_ID,
  TERRAIN_HILLSHADE_LAYER_ID,
  TERRARIUM_TILES,
} from '@/config/map'
import type { Basemap } from '@/types/app'

export const useBasemapVisibility = (args: {
  mapRef: MutableRefObject<MapRef | null>
  mapIsLoaded: boolean
  basemap: Basemap
}) => {
  const { mapRef, mapIsLoaded, basemap } = args

  useEffect(() => {
    if (!mapIsLoaded) return
    const map = mapRef.current?.getMap()
    if (!map) return
    map.setLayoutProperty(
      TERRAIN_HILLSHADE_LAYER_ID,
      'visibility',
      basemap === 'hillshade' ? 'visible' : 'none',
    )
    map.setLayoutProperty(
      SATELLITE_LAYER_ID,
      'visibility',
      basemap === 'satellite' ? 'visible' : 'none',
    )
  }, [basemap, mapIsLoaded, mapRef])
}

export const addBaseMapLayers = (args: {
  map: maplibregl.Map
  islandCanvas: HTMLCanvasElement
}) => {
  const { map, islandCanvas } = args
  const firstSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id

  map.addSource(SATELLITE_SOURCE_ID, {
    type: 'raster',
    tiles: SATELLITE_TILES,
    tileSize: 256,
    maxzoom: 19,
  })
  map.addLayer(
    {
      id: SATELLITE_LAYER_ID,
      type: 'raster',
      source: SATELLITE_SOURCE_ID,
      layout: { visibility: 'none' },
    },
    firstSymbolLayerId,
  )

  map.addSource(TERRAIN_DEM_SOURCE_ID, {
    type: 'raster-dem',
    tiles: TERRARIUM_TILES,
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 13,
  })
  map.addLayer(
    {
      id: TERRAIN_HILLSHADE_LAYER_ID,
      type: 'hillshade',
      source: TERRAIN_DEM_SOURCE_ID,
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

  map.addSource(ISLAND_FILL_SOURCE_ID, {
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
  map.addLayer(
    {
      id: ISLAND_FILL_LAYER_ID,
      type: 'raster',
      source: ISLAND_FILL_SOURCE_ID,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.6 },
    },
    firstSymbolLayerId,
  )
}
