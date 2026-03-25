import maplibregl from 'maplibre-gl'
import { demSource } from './contourSource'

const PROTOCOL = 'elevation-fill'

maplibregl.addProtocol(PROTOCOL, async (requestParameters) => {
  const url = requestParameters.url
  // url looks like: elevation-fill://z/x/y?t=1200
  const withoutProtocol = url.slice(PROTOCOL.length + 3) // strip "elevation-fill://"
  const [pathPart, queryPart] = withoutProtocol.split('?')
  const [z, x, y] = pathPart.split('/').map(Number)
  const threshold = parseFloat(queryPart?.split('t=')[1] ?? '0')

  const tile = await (demSource as any).getDemTile(z, x, y)
  const { width, height, data } = tile as { width: number; height: number; data: Float32Array }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)
  const pixels = imageData.data

  for (let i = 0; i < data.length; i++) {
    const elevation = data[i]
    const idx = i * 4
    if (elevation >= threshold) {
      pixels[idx] = 249      // r  (orange #f97316)
      pixels[idx + 1] = 115  // g
      pixels[idx + 2] = 22   // b
      pixels[idx + 3] = 140  // a (~55% opacity baked in)
    } else {
      pixels[idx + 3] = 0    // transparent
    }
  }

  ctx.putImageData(imageData, 0, 0)

  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return }
      blob.arrayBuffer().then(resolve, reject)
    }, 'image/png')
  })

  return { data: buffer }
})

export const getElevationFillTileUrl = (threshold: number): string =>
  `${PROTOCOL}://{z}/{x}/{y}?t=${threshold}`
