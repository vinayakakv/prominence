import { demSource } from './contourSource'
import { detectAndRenderIslands } from './islandDetector'

export const lngLatToTile = (args: { lng: number; lat: number; zoomLevel: number }) => {
  const { lng, lat, zoomLevel } = args
  const tileCount = 2 ** zoomLevel
  const x = Math.floor(((lng + 180) / 360) * tileCount)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCount)
  return { x, y }
}

const tileLngLat = (args: { zoomLevel: number; tileX: number; tileY: number }): [number, number] => {
  const { zoomLevel, tileX, tileY } = args
  const tileCount = 2 ** zoomLevel
  const lng = (tileX / tileCount) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / tileCount))) * 180) / Math.PI
  return [lng, lat]
}

// Returns [NW, NE, SE, SW] corners for MapLibre canvas source coordinates
export const getTileCanvasCoordinates = (args: {
  zoomLevel: number
  xMin: number
  yMin: number
  xMax: number
  yMax: number
}): [[number, number], [number, number], [number, number], [number, number]] => {
  const { zoomLevel, xMin, yMin, xMax, yMax } = args
  return [
    tileLngLat({ zoomLevel, tileX: xMin, tileY: yMin }), // NW
    tileLngLat({ zoomLevel, tileX: xMax + 1, tileY: yMin }), // NE
    tileLngLat({ zoomLevel, tileX: xMax + 1, tileY: yMax + 1 }), // SE
    tileLngLat({ zoomLevel, tileX: xMin, tileY: yMax + 1 }), // SW
  ]
}

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
  const tileSize = 256
  const cols = xMax - xMin + 1
  const rows = yMax - yMin + 1
  const width = cols * tileSize
  const height = rows * tileSize
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
    const colOffset = (tileX - xMin) * tileSize
    const rowOffset = (tileY - yMin) * tileSize
    for (let rowIndex = 0; rowIndex < tileSize; rowIndex++) {
      const srcStart = rowIndex * tileSize
      const dstStart = (rowOffset + rowIndex) * width + colOffset
      data.set(tile.data.subarray(srcStart, srcStart + tileSize), dstStart)
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
