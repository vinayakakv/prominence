type RGBA = [number, number, number, number]

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

export const islandColor = (idx: number): RGBA => {
  const hue = (idx * 137.5) % 360
  const [r, g, b] = hslToRgb(hue, 0.75, 0.55)
  return [r, g, b, 160]
}

// Persistent registry: quantized peak location → color index
// Survives pan/zoom so the same geographic island keeps its color
const colorRegistry = new Map<string, number>()
let nextColorIdx = 0

const peakKey = (lat: number, lng: number) =>
  `${lat.toFixed(1)},${lng.toFixed(1)}`  // ~11 km grid

const stitchedPixelToLatLng = (
  pixelIdx: number,
  width: number,
  tileZ: number,
  xMin: number,
  yMin: number,
  tileSize: number,
): { lat: number; lng: number } => {
  const px = pixelIdx % width
  const py = (pixelIdx / width) | 0
  const n = Math.pow(2, tileZ)
  const tileX = xMin + px / tileSize
  const tileY = yMin + py / tileSize
  const lng = tileX / n * 360 - 180
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / n))) * 180 / Math.PI
  return { lat, lng }
}

export const detectAndRenderIslands = (
  canvas: HTMLCanvasElement,
  data: Float32Array,
  width: number,
  height: number,
  threshold: number,
  tileZ: number,
  xMin: number,
  yMin: number,
  tileSize = 256,
): void => {
  // labels: -2 = below threshold, -1 = above/unvisited, >=0 = component id
  const labels = new Int32Array(width * height)
  for (let i = 0; i < data.length; i++) {
    labels[i] = data[i] > threshold ? -1 : -2
  }

  const islandSizes: number[] = []
  const islandPeakIdx: number[] = []  // pixel index of highest point per island
  const bfsQueue = new Int32Array(width * height)

  for (let startIdx = 0; startIdx < labels.length; startIdx++) {
    if (labels[startIdx] !== -1) continue

    const componentId = islandSizes.length
    let size = 0
    let peakIdx = startIdx
    let peakEle = data[startIdx]
    let head = 0, tail = 0

    bfsQueue[tail++] = startIdx
    labels[startIdx] = componentId

    while (head < tail) {
      const idx = bfsQueue[head++]
      size++
      if (data[idx] > peakEle) { peakEle = data[idx]; peakIdx = idx }

      const row = (idx / width) | 0
      const col = idx % width
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue
          const nr = row + dy
          const nc = col + dx
          if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue
          const ni = nr * width + nc
          if (labels[ni] === -1) {
            labels[ni] = componentId
            bfsQueue[tail++] = ni
          }
        }
      }
    }

    islandSizes.push(size)
    islandPeakIdx.push(peakIdx)
  }

  // Assign stable color per island via peak-location registry
  const colorAssignment = new Int32Array(islandSizes.length)
  for (let i = 0; i < islandSizes.length; i++) {
    const { lat, lng } = stitchedPixelToLatLng(islandPeakIdx[i], width, tileZ, xMin, yMin, tileSize)
    const key = peakKey(lat, lng)
    if (!colorRegistry.has(key)) {
      colorRegistry.set(key, nextColorIdx++)
    }
    colorAssignment[i] = colorRegistry.get(key)!
  }

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)
  const pixels = imageData.data

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]
    if (label < 0) continue
    const [r, g, b, a] = islandColor(colorAssignment[label])
    const p = i * 4
    pixels[p] = r; pixels[p + 1] = g; pixels[p + 2] = b; pixels[p + 3] = a
  }

  ctx.putImageData(imageData, 0, 0)
}
