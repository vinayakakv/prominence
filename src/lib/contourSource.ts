import maplibregl from 'maplibre-gl'
import mlContour from 'maplibre-contour'
import { CONTOUR_SOURCE_LAYER, MAX_DEM_ZOOM, TERRARIUM_TILE_URL } from '@/config/map'

export const demSource = new mlContour.DemSource({
  url: TERRARIUM_TILE_URL,
  encoding: 'terrarium',
  maxzoom: MAX_DEM_ZOOM,
  worker: true,
})

demSource.setupMaplibre(maplibregl)

export const contourTileUrl = demSource.contourProtocolUrl({
  thresholds: {
    9: [500, 1000],
    10: [200, 1000],
    11: [100, 500],
    12: [50, 200],
    13: [20, 100],
    14: [10, 50],
  },
  elevationKey: 'ele',
  levelKey: 'level',
  contourLayer: CONTOUR_SOURCE_LAYER,
})
