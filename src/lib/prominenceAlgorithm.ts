import { MAX_DEM_ZOOM, TILE_SIZE } from '@/config/map'
import type { Peak } from '@/types/app'
import { fetchAndStitchTiles } from './elevationFill'
import { lngLatToPixelIdx, lngLatToTile, stitchedPixelToLatLng } from './geoTiles'

export type ProminenceStep =
  | {
      threshold: number
      touchesBoundary: boolean
      expandedTiles: boolean
      depthSoFar: number
      done: false
    }
  | {
      threshold: number
      done: true
      keyColEle: number
      prominence: number
      parentPeak: Peak
    }

export type ProminenceContext = {
  peakLat: number
  peakLng: number
  peakEle: number
  stepInterval: number
  currentThreshold: number
}

export const snapToPeak = async (args: { lat: number; lng: number; tileZ: number }) => {
  const { lat, lng, tileZ } = args
  const clampedZ = Math.min(Math.max(tileZ, 1), MAX_DEM_ZOOM)
  const { x, y } = lngLatToTile({ lng, lat, zoomLevel: clampedZ })
  const maxTile = 2 ** clampedZ - 1
  const xMin = Math.max(0, x - 1)
  const xMax = Math.min(maxTile, x + 1)
  const yMin = Math.max(0, y - 1)
  const yMax = Math.min(maxTile, y + 1)

  const { data, width, height } = await fetchAndStitchTiles({
    tileZ: clampedZ,
    xMin,
    xMax,
    yMin,
    yMax,
  })
  const seedIdx = lngLatToPixelIdx({ lat, lng, tileZ: clampedZ, xMin, yMin, width, height })

  // Search radius ~500m in pixels
  const metersPerPixel = 40075000 / (TILE_SIZE * 2 ** clampedZ)
  const searchRadius = Math.min(30, Math.max(2, Math.round(500 / metersPerPixel)))

  const seedRow = (seedIdx / width) | 0
  const seedCol = seedIdx % width
  let bestEle = -Infinity
  let bestIdx = seedIdx

  for (let rowDelta = -searchRadius; rowDelta <= searchRadius; rowDelta++) {
    for (let colDelta = -searchRadius; colDelta <= searchRadius; colDelta++) {
      const candidateRow = seedRow + rowDelta
      const candidateCol = seedCol + colDelta
      if (candidateRow < 0 || candidateRow >= height || candidateCol < 0 || candidateCol >= width)
        continue
      const idx = candidateRow * width + candidateCol
      if (data[idx] > bestEle) {
        bestEle = data[idx]
        bestIdx = idx
      }
    }
  }

  return {
    ...stitchedPixelToLatLng({ pixelIdx: bestIdx, width, tileZ: clampedZ, xMin, yMin }),
    ele: bestEle,
  }
}

export { lngLatToPixelIdx }
