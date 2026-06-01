import { MAX_DEM_ZOOM, TILE_SIZE } from '@/config/map'
import type { Peak } from '@/types/app'
import { fetchAndStitchTiles } from './elevationFill'
import { lngLatToPixelIndex, lngLatToTile, stitchedPixelToLatLng } from './geoTiles'

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
      keyColElevation: number
      prominence: number
      parentPeak: Peak
    }

export type ProminenceContext = {
  peakLat: number
  peakLng: number
  peakElevation: number
  stepInterval: number
  currentThreshold: number
}

export const snapToPeak = async (args: { lat: number; lng: number; tileZ: number }) => {
  const { lat, lng, tileZ } = args
  const clampedZ = Math.min(Math.max(tileZ, 1), MAX_DEM_ZOOM)
  const { tileX, tileY } = lngLatToTile({ lng, lat, zoomLevel: clampedZ })
  const maxTile = 2 ** clampedZ - 1
  const xMin = Math.max(0, tileX - 1)
  const xMax = Math.min(maxTile, tileX + 1)
  const yMin = Math.max(0, tileY - 1)
  const yMax = Math.min(maxTile, tileY + 1)

  const { data, width, height } = await fetchAndStitchTiles({
    tileZ: clampedZ,
    xMin,
    xMax,
    yMin,
    yMax,
  })
  const seedPixelIndex = lngLatToPixelIndex({
    lat,
    lng,
    tileZ: clampedZ,
    xMin,
    yMin,
    width,
    height,
  })

  // Search radius ~500m in pixels
  const metersPerPixel = 40075000 / (TILE_SIZE * 2 ** clampedZ)
  const searchRadius = Math.min(30, Math.max(2, Math.round(500 / metersPerPixel)))

  const seedRow = (seedPixelIndex / width) | 0
  const seedCol = seedPixelIndex % width
  let bestElevation = -Infinity
  let bestPixelIndex = seedPixelIndex

  for (let rowDelta = -searchRadius; rowDelta <= searchRadius; rowDelta++) {
    for (let colDelta = -searchRadius; colDelta <= searchRadius; colDelta++) {
      const candidateRow = seedRow + rowDelta
      const candidateCol = seedCol + colDelta
      if (candidateRow < 0 || candidateRow >= height || candidateCol < 0 || candidateCol >= width)
        continue
      const candidatePixelIndex = candidateRow * width + candidateCol
      if (data[candidatePixelIndex] > bestElevation) {
        bestElevation = data[candidatePixelIndex]
        bestPixelIndex = candidatePixelIndex
      }
    }
  }

  return {
    ...stitchedPixelToLatLng({ pixelIndex: bestPixelIndex, width, tileZ: clampedZ, xMin, yMin }),
    elevation: bestElevation,
  }
}

export { lngLatToPixelIndex as lngLatToPixelIdx }
