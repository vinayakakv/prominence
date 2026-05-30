import { demSource } from './contourSource'
import { TILE_SIZE } from '@/config/map'
import { getTileCanvasCoordinates, lngLatToTile } from './geoTiles'
import { detectAndRenderIslands } from './islandDetector'

type TileFetch = {
  tileX: number
  tileY: number
  tile: { width: number; height: number; data: Float32Array }
}

export const fetchAndStitchTiles = async (args: {
  tileZ: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}) => {
  const { tileZ, xMin, xMax, yMin, yMax } = args
  const cols = xMax - xMin + 1
  const rows = yMax - yMin + 1
  const width = cols * TILE_SIZE
  const height = rows * TILE_SIZE
  const data = new Float32Array(width * height)

  const fetches: Promise<TileFetch>[] = []
  for (let tileY = yMin; tileY <= yMax; tileY++) {
    for (let tileX = xMin; tileX <= xMax; tileX++) {
      fetches.push(
        demSource
          .getDemTile(tileZ, tileX, tileY)
          .then((tile: TileFetch['tile']) => ({ tileX, tileY, tile })),
      )
    }
  }
  const tiles = await Promise.all(fetches)

  for (const { tileX, tileY, tile } of tiles) {
    const colOffset = (tileX - xMin) * TILE_SIZE
    const rowOffset = (tileY - yMin) * TILE_SIZE
    for (let rowIndex = 0; rowIndex < TILE_SIZE; rowIndex++) {
      const srcStart = rowIndex * TILE_SIZE
      const dstStart = (rowOffset + rowIndex) * width + colOffset
      data.set(tile.data.subarray(srcStart, srcStart + TILE_SIZE), dstStart)
    }
  }

  return { data, width, height }
}

export const renderElevationFill = async (args: {
  canvas: HTMLCanvasElement
  tileZ: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  threshold: number
}) => {
  const { canvas, tileZ, xMin, xMax, yMin, yMax, threshold } = args
  const { data, width, height } = await fetchAndStitchTiles({ tileZ, xMin, xMax, yMin, yMax })
  detectAndRenderIslands({ canvas, data, width, height, threshold, tileZ, xMin, yMin })
  return { data, width, height }
}

export { getTileCanvasCoordinates, lngLatToTile }
