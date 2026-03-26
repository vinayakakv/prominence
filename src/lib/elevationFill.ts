import { demSource } from './contourSource'
import { detectAndRenderIslands } from './islandDetector'

export const lngLatToTile = (lng: number, lat: number, z: number): { x: number; y: number } => {
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return { x, y }
}

const tileLngLat = (z: number, tx: number, ty: number): [number, number] => {
  const n = 2 ** z
  const lng = (tx / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI
  return [lng, lat]
}

// Returns [NW, NE, SE, SW] corners for MapLibre canvas source coordinates
export const getTileCanvasCoordinates = (
  z: number,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
): [[number, number], [number, number], [number, number], [number, number]] => [
  tileLngLat(z, xMin, yMin), // NW
  tileLngLat(z, xMax + 1, yMin), // NE
  tileLngLat(z, xMax + 1, yMax + 1), // SE
  tileLngLat(z, xMin, yMax + 1), // SW
]

type TileFetch = {
  tx: number
  ty: number
  tile: { width: number; height: number; data: Float32Array }
}

export const fetchAndStitchTiles = async ({
  tileZ,
  xMin,
  xMax,
  yMin,
  yMax,
}: {
  tileZ: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}): Promise<{ data: Float32Array; width: number; height: number }> => {
  const tileSize = 256
  const cols = xMax - xMin + 1
  const rows = yMax - yMin + 1
  const width = cols * tileSize
  const height = rows * tileSize
  const data = new Float32Array(width * height)

  const fetches: Promise<TileFetch>[] = []
  for (let ty = yMin; ty <= yMax; ty++) {
    for (let tx = xMin; tx <= xMax; tx++) {
      fetches.push(
        demSource.getDemTile(tileZ, tx, ty).then((tile: TileFetch['tile']) => ({ tx, ty, tile })),
      )
    }
  }
  const tiles = await Promise.all(fetches)

  for (const { tx, ty, tile } of tiles) {
    const colOffset = (tx - xMin) * tileSize
    const rowOffset = (ty - yMin) * tileSize
    for (let row = 0; row < tileSize; row++) {
      const srcStart = row * tileSize
      const dstStart = (rowOffset + row) * width + colOffset
      data.set(tile.data.subarray(srcStart, srcStart + tileSize), dstStart)
    }
  }

  return { data, width, height }
}

export const renderElevationFill = async ({
  canvas,
  tileZ,
  xMin,
  xMax,
  yMin,
  yMax,
  threshold,
}: {
  canvas: HTMLCanvasElement
  tileZ: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  threshold: number
}): Promise<{ data: Float32Array; width: number; height: number }> => {
  const { data, width, height } = await fetchAndStitchTiles({ tileZ, xMin, xMax, yMin, yMax })
  detectAndRenderIslands(canvas, data, width, height, threshold, tileZ, xMin, yMin)
  return { data, width, height }
}
