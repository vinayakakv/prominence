import { fetchAndStitchTiles, lngLatToTile } from './elevationFill'
import { stitchedPixelToLatLng } from './islandDetector'

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
      parentPeak: { lat: number; lng: number; ele: number }
    }

export type ProminenceContext = {
  peakLat: number
  peakLng: number
  peakEle: number
  stepInterval: number
  currentThreshold: number
}

const TILE_SIZE = 256

export const lngLatToPixelIdx = (
  lat: number,
  lng: number,
  tileZ: number,
  xMin: number,
  yMin: number,
  width: number,
  height: number,
): number => {
  const n = 2 ** tileZ
  const tileX = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const tileY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  const px = Math.floor((tileX - xMin) * TILE_SIZE)
  const py = Math.floor((tileY - yMin) * TILE_SIZE)
  return Math.max(0, Math.min(py * width + px, width * height - 1))
}

export const snapToPeak = async (
  lat: number,
  lng: number,
  tileZ: number,
): Promise<{ lat: number; lng: number; ele: number }> => {
  const clampedZ = Math.min(Math.max(tileZ, 1), 13)
  const { x, y } = lngLatToTile(lng, lat, clampedZ)
  const maxTile = Math.pow(2, clampedZ) - 1
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
  const seedIdx = lngLatToPixelIdx(lat, lng, clampedZ, xMin, yMin, width, height)

  // Search radius ~500m in pixels
  const metersPerPixel = 40075000 / (TILE_SIZE * Math.pow(2, clampedZ))
  const sr = Math.min(30, Math.max(2, Math.round(500 / metersPerPixel)))

  const seedRow = (seedIdx / width) | 0
  const seedCol = seedIdx % width
  let bestEle = -Infinity
  let bestIdx = seedIdx

  for (let dy = -sr; dy <= sr; dy++) {
    for (let dx = -sr; dx <= sr; dx++) {
      const r = seedRow + dy
      const c = seedCol + dx
      if (r < 0 || r >= height || c < 0 || c >= width) continue
      const idx = r * width + c
      if (data[idx] > bestEle) {
        bestEle = data[idx]
        bestIdx = idx
      }
    }
  }

  return { ...stitchedPixelToLatLng(bestIdx, width, clampedZ, xMin, yMin), ele: bestEle }
}
