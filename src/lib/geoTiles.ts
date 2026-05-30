import { TILE_SIZE } from '@/config/map'

export const lngLatToTile = (args: { lng: number; lat: number; zoomLevel: number }) => {
  const { lng, lat, zoomLevel } = args
  const tileCount = 2 ** zoomLevel
  const x = Math.floor(((lng + 180) / 360) * tileCount)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCount,
  )
  return { x, y }
}

export const tileToLngLat = (args: {
  zoomLevel: number
  tileX: number
  tileY: number
}): [number, number] => {
  const { zoomLevel, tileX, tileY } = args
  const tileCount = 2 ** zoomLevel
  const lng = (tileX / tileCount) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / tileCount))) * 180) / Math.PI
  return [lng, lat]
}

export const getTileCanvasCoordinates = (args: {
  zoomLevel: number
  xMin: number
  yMin: number
  xMax: number
  yMax: number
}): [[number, number], [number, number], [number, number], [number, number]] => {
  const { zoomLevel, xMin, yMin, xMax, yMax } = args
  return [
    tileToLngLat({ zoomLevel, tileX: xMin, tileY: yMin }),
    tileToLngLat({ zoomLevel, tileX: xMax + 1, tileY: yMin }),
    tileToLngLat({ zoomLevel, tileX: xMax + 1, tileY: yMax + 1 }),
    tileToLngLat({ zoomLevel, tileX: xMin, tileY: yMax + 1 }),
  ]
}

export const lngLatToPixelIdx = (args: {
  lat: number
  lng: number
  tileZ: number
  xMin: number
  yMin: number
  width: number
  height: number
  tileSize?: number
}) => {
  const { lat, lng, tileZ, xMin, yMin, width, height, tileSize = TILE_SIZE } = args
  const tileCount = 2 ** tileZ
  const tileX = ((lng + 180) / 360) * tileCount
  const latRad = (lat * Math.PI) / 180
  const tileY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCount
  const pixelX = Math.floor((tileX - xMin) * tileSize)
  const pixelY = Math.floor((tileY - yMin) * tileSize)
  return Math.max(0, Math.min(pixelY * width + pixelX, width * height - 1))
}

export const stitchedPixelToLatLng = (args: {
  pixelIdx: number
  width: number
  tileZ: number
  xMin: number
  yMin: number
  tileSize?: number
}) => {
  const { pixelIdx, width, tileZ, xMin, yMin, tileSize = TILE_SIZE } = args
  const pixelX = pixelIdx % width
  const pixelY = (pixelIdx / width) | 0
  const tileCount = 2 ** tileZ
  const tileX = xMin + pixelX / tileSize
  const tileY = yMin + pixelY / tileSize
  const lng = (tileX / tileCount) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / tileCount))) * 180) / Math.PI
  return { lat, lng }
}
