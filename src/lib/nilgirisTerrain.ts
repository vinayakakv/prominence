import maplibregl from 'maplibre-gl'
import { demSource } from './contourSource'

// Shared by the raster renderer and the legend. Heights are metres above sea level.
export const elevationStops = [
  { height: 0, color: [76, 119, 100] },
  { height: 600, color: [132, 161, 115] },
  { height: 1200, color: [191, 193, 132] },
  { height: 1800, color: [212, 179, 128] },
  { height: 2000, color: [201, 151, 94] },
  { height: 2400, color: [181, 106, 55] },
  { height: 2800, color: [135, 58, 38] },
]

export function elevationColor(height: number, startElevation = 0): number[] {
  const start = Math.max(0, Math.min(2700, startElevation))
  const mappedHeight = ((height - start) / (2800 - start)) * 2800
  const value = Math.max(0, Math.min(2800, mappedHeight))
  const upper = elevationStops.findIndex((stop) => stop.height >= value)
  if (upper <= 0) return elevationStops[0].color
  const low = elevationStops[upper - 1]
  const high = elevationStops[upper]
  const t = (value - low.height) / (high.height - low.height)
  return low.color.map((channel, i) => Math.round(channel + t * (high.color[i] - channel)))
}

let registered = false
const colorLookup = Array.from({ length: 2801 }, (_, height) => [...elevationColor(height), 255])
const stretchLookups = new Map<number, number[][]>()
function getColorLookup(start: number) {
  if (start === 0) return colorLookup
  const cached = stretchLookups.get(start)
  if (cached) return cached
  const lookup = Array.from({ length: 2801 }, (_, height) => [
    ...elevationColor(height, start),
    255,
  ])
  // Bound memory while readers experiment with the slider.
  if (stretchLookups.size >= 8) {
    const oldest = stretchLookups.keys().next().value
    if (oldest !== undefined) stretchLookups.delete(oldest)
  }
  stretchLookups.set(start, lookup)
  return lookup
}
export function registerElevationColors() {
  if (registered) return
  registered = true
  maplibregl.addProtocol('nilgiris-elevation', async (request, controller) => {
    const match = request.url.match(/(\d+)\/(\d+)\/(\d+)$/)
    if (!match) throw new Error('Invalid elevation tile URL')
    const [, z, x, y] = match.map(Number)
    const stretch = request.url.match(/:\/\/plateau\/(\d+)\//)
    const start = stretch ? Math.max(0, Math.min(2700, Number(stretch[1]))) : 0
    const lookup = getColorLookup(start)
    const tile = await demSource.getDemTile(z, x, y, controller)
    controller.signal.throwIfAborted()
    const canvas = document.createElement('canvas')
    canvas.width = tile.width
    canvas.height = tile.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Cannot render elevation colors')
    const pixels = ctx.createImageData(tile.width, tile.height)
    for (let i = 0; i < tile.data.length; i++) {
      if (!Number.isFinite(tile.data[i])) continue
      pixels.data.set(lookup[Math.max(0, Math.min(2800, Math.round(tile.data[i])))], i * 4)
    }
    ctx.putImageData(pixels, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) =>
        result ? resolve(result) : reject(new Error('Cannot encode elevation tile')),
      )
    })
    controller.signal.throwIfAborted()
    return { data: await blob.arrayBuffer() }
  })
}

export async function sampleElevation(lng: number, lat: number, controller: AbortController) {
  const z = 13
  const size = 2 ** z
  const x = ((lng + 180) / 360) * size
  const radians = (lat * Math.PI) / 180
  const y = ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * size
  const tile = await demSource.getDemTile(z, Math.floor(x), Math.floor(y), controller)
  controller.signal.throwIfAborted()
  const col = Math.min(tile.width - 1, Math.floor((x % 1) * tile.width))
  const row = Math.min(tile.height - 1, Math.floor((y % 1) * tile.height))
  const height = tile.data[row * tile.width + col]
  if (!Number.isFinite(height)) throw new Error('Elevation unavailable')
  return Math.round(height)
}
