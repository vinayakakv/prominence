import { fetchAndStitchTiles, lngLatToTile } from './elevationFill'
import { detectIslandContaining, stitchedPixelToLatLng } from './islandDetector'

export type ProminenceStep = {
  threshold: number
  touchesBoundary: boolean
  expandedTiles: boolean
  depthSoFar: number
  done: false
} | {
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
  tileZ: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  stepInterval: number
  currentThreshold: number
}

const MIN_ISLAND_PIXELS = 20
const MAX_TILES = 200
const TILE_SIZE = 256

const lngLatToPixelIdx = (
  lat: number, lng: number,
  tileZ: number, xMin: number, yMin: number, width: number, height: number,
): number => {
  const n = Math.pow(2, tileZ)
  const tileX = (lng + 180) / 360 * n
  const latRad = lat * Math.PI / 180
  const tileY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
  const px = Math.floor((tileX - xMin) * TILE_SIZE)
  const py = Math.floor((tileY - yMin) * TILE_SIZE)
  return Math.max(0, Math.min(py * width + px, width * height - 1))
}

export const stepProminence = async (ctx: ProminenceContext): Promise<{
  ctx: ProminenceContext
  step: ProminenceStep
  data: Float32Array
  width: number
  height: number
  borderPixels: Int32Array | null
}> => {
  const { peakLat, peakLng, peakEle, tileZ, xMin, xMax, yMin, yMax, stepInterval, currentThreshold } = ctx

  const { data, width, height } = await fetchAndStitchTiles({ tileZ, xMin, xMax, yMin, yMax })
  const seedIdx = lngLatToPixelIdx(peakLat, peakLng, tileZ, xMin, yMin, width, height)
  const island = detectIslandContaining(data, width, height, currentThreshold, seedIdx)

  if (!island) {
    // Seed is below threshold — descend and try again
    return {
      ctx: { ...ctx, currentThreshold: currentThreshold - stepInterval },
      step: { threshold: currentThreshold, touchesBoundary: false, expandedTiles: false, depthSoFar: peakEle - currentThreshold, done: false },
      data, width, height, borderPixels: null,
    }
  }

  // Parent found: island now contains a taller peak (filtering noise islands)
  if (island.maxEle > peakEle && island.pixels.length >= MIN_ISLAND_PIXELS) {
    const parentLatLng = stitchedPixelToLatLng(island.maxEleIdx, width, tileZ, xMin, yMin)
    return {
      ctx,
      step: {
        threshold: currentThreshold,
        done: true,
        keyColEle: currentThreshold,
        prominence: peakEle - currentThreshold,
        parentPeak: { ...parentLatLng, ele: island.maxEle },
      },
      data, width, height,
      borderPixels: island.borderPixels,
    }
  }

  // Expand tile coverage if island touches boundary
  let nextCtx = { ...ctx, currentThreshold: currentThreshold - stepInterval }
  let expandedTiles = false

  if (island.touchesBoundary) {
    const maxTile = Math.pow(2, tileZ) - 1
    const nextCols = xMax - xMin + 3
    const nextRows = yMax - yMin + 3

    if (nextCols * nextRows > MAX_TILES && tileZ > 2) {
      // Too many tiles — drop to coarser zoom
      const newTileZ = tileZ - 1
      const maxNewTile = Math.pow(2, newTileZ) - 1
      nextCtx = {
        ...nextCtx,
        tileZ: newTileZ,
        xMin: Math.max(0, Math.floor(xMin / 2) - 1),
        xMax: Math.min(maxNewTile, Math.ceil(xMax / 2) + 1),
        yMin: Math.max(0, Math.floor(yMin / 2) - 1),
        yMax: Math.min(maxNewTile, Math.ceil(yMax / 2) + 1),
      }
    } else {
      nextCtx = {
        ...nextCtx,
        xMin: Math.max(0, xMin - 1),
        xMax: Math.min(maxTile, xMax + 1),
        yMin: Math.max(0, yMin - 1),
        yMax: Math.min(maxTile, yMax + 1),
      }
    }
    expandedTiles = true
  }

  return {
    ctx: nextCtx,
    step: {
      threshold: currentThreshold,
      touchesBoundary: island.touchesBoundary,
      expandedTiles,
      depthSoFar: peakEle - currentThreshold,
      done: false,
    },
    data, width, height,
    borderPixels: island.borderPixels,
  }
}

export const snapToPeak = async (
  lat: number, lng: number, tileZ: number,
): Promise<{ lat: number; lng: number; ele: number }> => {
  const clampedZ = Math.min(Math.max(tileZ, 1), 13)
  const { x, y } = lngLatToTile(lng, lat, clampedZ)
  const maxTile = Math.pow(2, clampedZ) - 1
  const xMin = Math.max(0, x - 1)
  const xMax = Math.min(maxTile, x + 1)
  const yMin = Math.max(0, y - 1)
  const yMax = Math.min(maxTile, y + 1)

  const { data, width, height } = await fetchAndStitchTiles({ tileZ: clampedZ, xMin, xMax, yMin, yMax })
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
      if (data[idx] > bestEle) { bestEle = data[idx]; bestIdx = idx }
    }
  }

  return { ...stitchedPixelToLatLng(bestIdx, width, clampedZ, xMin, yMin), ele: bestEle }
}
