type RGBA = [number, number, number, number]

const hslToRgb = (args: { hue: number; saturation: number; lightness: number }): [number, number, number] => {
  const { hue, saturation, lightness } = args
  const chroma = saturation * Math.min(lightness, 1 - lightness)
  const channelValue = (hueAngle: number) => {
    const hueSector = (hueAngle + hue / 30) % 12
    return lightness - chroma * Math.max(-1, Math.min(hueSector - 3, 9 - hueSector, 1))
  }
  return [Math.round(channelValue(0) * 255), Math.round(channelValue(8) * 255), Math.round(channelValue(4) * 255)]
}

export const islandColor = (idx: number): RGBA => {
  const hue = (idx * 137.5) % 360
  const [red, green, blue] = hslToRgb({ hue, saturation: 0.75, lightness: 0.55 })
  return [red, green, blue, 160]
}

// Persistent registry: quantized peak location → color index
const colorRegistry = new Map<string, number>()
let nextColorIdx = 0

const peakKey = (lat: number, lng: number) => `${lat.toFixed(1)},${lng.toFixed(1)}` // ~11 km grid

export const stitchedPixelToLatLng = (args: {
  pixelIdx: number
  width: number
  tileZ: number
  xMin: number
  yMin: number
  tileSize?: number
}) => {
  const { pixelIdx, width, tileZ, xMin, yMin, tileSize = 256 } = args
  const pixelX = pixelIdx % width
  const pixelY = (pixelIdx / width) | 0
  const tileCount = 2 ** tileZ
  const tileX = xMin + pixelX / tileSize
  const tileY = yMin + pixelY / tileSize
  const lng = (tileX / tileCount) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / tileCount))) * 180) / Math.PI
  return { lat, lng }
}

export const detectAndRenderIslands = (args: {
  canvas: HTMLCanvasElement
  data: Float32Array
  width: number
  height: number
  threshold: number
  tileZ: number
  xMin: number
  yMin: number
  tileSize?: number
}) => {
  const { canvas, data, width, height, threshold, tileZ, xMin, yMin, tileSize = 256 } = args
  const labels = new Int32Array(width * height)
  for (let pixelIndex = 0; pixelIndex < data.length; pixelIndex++) {
    labels[pixelIndex] = data[pixelIndex] > threshold ? -1 : -2
  }

  const islandSizes: number[] = []
  const islandPeakIdx: number[] = []
  const bfsQueue = new Int32Array(width * height)

  for (let startIdx = 0; startIdx < labels.length; startIdx++) {
    if (labels[startIdx] !== -1) continue

    const componentId = islandSizes.length
    let size = 0
    let peakIdx = startIdx
    let peakEle = data[startIdx]
    let head = 0,
      tail = 0

    bfsQueue[tail++] = startIdx
    labels[startIdx] = componentId

    while (head < tail) {
      const idx = bfsQueue[head++]
      size++
      if (data[idx] > peakEle) {
        peakEle = data[idx]
        peakIdx = idx
      }

      const row = (idx / width) | 0
      const col = idx % width
      for (let rowDelta = -1; rowDelta <= 1; rowDelta++) {
        for (let colDelta = -1; colDelta <= 1; colDelta++) {
          if (rowDelta === 0 && colDelta === 0) continue
          const neighborRow = row + rowDelta
          const neighborCol = col + colDelta
          if (neighborRow < 0 || neighborRow >= height || neighborCol < 0 || neighborCol >= width) continue
          const neighborIndex = neighborRow * width + neighborCol
          if (labels[neighborIndex] === -1) {
            labels[neighborIndex] = componentId
            bfsQueue[tail++] = neighborIndex
          }
        }
      }
    }

    islandSizes.push(size)
    islandPeakIdx.push(peakIdx)
  }

  const colorAssignment = new Int32Array(islandSizes.length)
  for (let islandIndex = 0; islandIndex < islandSizes.length; islandIndex++) {
    const { lat, lng } = stitchedPixelToLatLng({ pixelIdx: islandPeakIdx[islandIndex], width, tileZ, xMin, yMin, tileSize })
    const key = peakKey(lat, lng)
    if (!colorRegistry.has(key)) {
      colorRegistry.set(key, nextColorIdx++)
    }
    const color = colorRegistry.get(key)
    if (color !== undefined) colorAssignment[islandIndex] = color
  }

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const imageData = ctx.createImageData(width, height)
  const pixels = imageData.data

  for (let pixelIndex = 0; pixelIndex < labels.length; pixelIndex++) {
    const label = labels[pixelIndex]
    if (label < 0) continue
    const [red, green, blue, alpha] = islandColor(colorAssignment[label])
    const pixelOffset = pixelIndex * 4
    pixels[pixelOffset] = red
    pixels[pixelOffset + 1] = green
    pixels[pixelOffset + 2] = blue
    pixels[pixelOffset + 3] = alpha
  }

  ctx.putImageData(imageData, 0, 0)
}

export const detectIslandContaining = (args: {
  data: Float32Array
  width: number
  height: number
  threshold: number
  seedIdx: number
}) => {
  const { data, width, height, threshold, seedIdx } = args
  if (seedIdx < 0 || seedIdx >= data.length || data[seedIdx] <= threshold) return null

  const visited = new Uint8Array(data.length)
  const pixelsArr: number[] = []
  const borderArr: number[] = []
  let maxEle = data[seedIdx]
  let maxEleIdx = seedIdx
  let touchesBoundary = false

  const queue = new Int32Array(data.length)
  let head = 0,
    tail = 0
  queue[tail++] = seedIdx
  visited[seedIdx] = 1

  while (head < tail) {
    const idx = queue[head++]
    pixelsArr.push(idx)
    if (data[idx] > maxEle) {
      maxEle = data[idx]
      maxEleIdx = idx
    }

    const row = (idx / width) | 0
    const col = idx % width
    let isBorder = false

    for (let rowDelta = -1; rowDelta <= 1; rowDelta++) {
      for (let colDelta = -1; colDelta <= 1; colDelta++) {
        if (rowDelta === 0 && colDelta === 0) continue
        const neighborRow = row + rowDelta
        const neighborCol = col + colDelta
        if (neighborRow < 0 || neighborRow >= height || neighborCol < 0 || neighborCol >= width) {
          isBorder = true
          touchesBoundary = true
          continue
        }
        const neighborIndex = neighborRow * width + neighborCol
        if (data[neighborIndex] <= threshold) {
          isBorder = true
          continue
        }
        if (!visited[neighborIndex]) {
          visited[neighborIndex] = 1
          queue[tail++] = neighborIndex
        }
      }
    }

    if (isBorder) borderArr.push(idx)
  }

  return {
    pixels: new Int32Array(pixelsArr),
    maxEle,
    maxEleIdx,
    touchesBoundary,
    borderPixels: new Int32Array(borderArr),
  }
}

export const renderBorderToCanvas = (args: {
  canvas: HTMLCanvasElement
  borderPixels: Int32Array
  width: number
  height: number
  color?: RGBA
}) => {
  const { canvas, borderPixels, width, height, color = [255, 255, 255, 230] as RGBA } = args
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const imageData = ctx.createImageData(width, height)
  const pixels = imageData.data
  const [red, green, blue, alpha] = color
  for (let pixelIndex = 0; pixelIndex < borderPixels.length; pixelIndex++) {
    const pixelOffset = borderPixels[pixelIndex] * 4
    pixels[pixelOffset] = red
    pixels[pixelOffset + 1] = green
    pixels[pixelOffset + 2] = blue
    pixels[pixelOffset + 3] = alpha
  }
  ctx.putImageData(imageData, 0, 0)
}
