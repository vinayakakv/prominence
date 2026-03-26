import maplibregl from 'maplibre-gl'
import mlContour from 'maplibre-contour'

export const demSource = new mlContour.DemSource({
  url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  encoding: 'terrarium',
  maxzoom: 13,
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
  contourLayer: 'contours',
})
