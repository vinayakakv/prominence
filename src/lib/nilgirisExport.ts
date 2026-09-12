import maplibregl from 'maplibre-gl'
import { elevationStops } from './nilgirisTerrain'

type ExportOptions = {
  longEdge: number
  colors: boolean
  stretched: boolean
  stretchStart: number
  summitColor: string
  placeColor: string
  signal: AbortSignal
}

// Render at the same CSS size to preserve framing and label sizes, with a denser
// drawing buffer. An independent map lets the reader continue exploring.
export async function exportNilgirisView(source: maplibregl.Map, options: ExportOptions) {
  const width = source.getContainer().clientWidth
  const height = source.getContainer().clientHeight
  if (!width || !height || !source.getStyle()) {
    throw new Error('Wait for the map to finish loading, then try again.')
  }
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host)
  let map: maplibregl.Map | undefined
  try {
    options.signal.throwIfAborted()
    map = new maplibregl.Map({
      container: host,
      style: source.getStyle(),
      center: source.getCenter(),
      zoom: source.getZoom(),
      bearing: source.getBearing(),
      pitch: source.getPitch(),
      roll: source.getRoll(),
      maxPitch: 70,
      interactive: false,
      attributionControl: false,
      pixelRatio: options.longEdge / Math.max(width, height),
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      fadeDuration: 0,
    })
    map.setPadding(source.getPadding())
    await waitForExport(map, options.signal)
    const canvas = composeFigure(map, options)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value)
        else reject(new Error('The browser could not encode the image. Try the smaller size.'))
      }, 'image/png')
    })
    options.signal.throwIfAborted()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `nilgiris-${canvas.width}x${canvas.height}.png`
    document.body.append(link)
    link.click()
    link.remove()
    // Give the browser time to consume the download before releasing the blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { width: canvas.width, height: canvas.height }
  } finally {
    map?.remove()
    host.remove()
  }
}

function waitForExport(map: maplibregl.Map, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      map.off('idle', onIdle)
      map.off('error', onError)
      signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    const onIdle = () => finish()
    const onError = () =>
      finish(new Error('Some map data could not load. Please retry the export.'))
    const onAbort = () => finish(new Error('Export cancelled.'))
    const timer = window.setTimeout(
      () => finish(new Error('The export timed out loading map data. Please try again.')),
      45_000,
    )
    map.on('idle', onIdle)
    map.on('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    else map.triggerRepaint()
  })
}

function composeFigure(map: maplibregl.Map, options: ExportOptions) {
  const rendered = map.getCanvas()
  const canvas = document.createElement('canvas')
  const scale = rendered.width / 1000
  canvas.width = rendered.width
  canvas.height = rendered.height + Math.ceil(180 * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('The browser could not create the image. Try the smaller size.')
  ctx.fillStyle = '#faf8ee'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(rendered, 0, 0)
  ctx.translate(0, rendered.height)
  ctx.scale(scale, scale)
  ctx.fillStyle = '#304532'
  ctx.font = '24px Georgia, serif'
  ctx.fillText('The Nilgiris', 24, 34)
  ctx.font = '11px sans-serif'
  const terrain = map.getTerrain()
  ctx.fillText(
    terrain ? `3D relief · ${terrain.exaggeration ?? 1}× vertical exaggeration` : 'Topographic map',
    24,
    55,
  )
  ctx.fillStyle = options.summitColor
  ctx.fillText('● Mountains', 24, 79)
  ctx.fillStyle = options.placeColor
  ctx.fillText('● Other places', 125, 79)
  ctx.fillStyle = '#304532'
  const center = map.getCenter()
  ctx.fillText(
    `Center ${center.lat.toFixed(4)}° N, ${center.lng.toFixed(4)}° E · bearing ${map.getBearing().toFixed(0)}°`,
    24,
    102,
  )

  if (options.colors) {
    const x = 530
    const legendWidth = 440
    const start = options.stretched ? options.stretchStart : 0
    ctx.fillText(options.stretched ? 'HIGH PLATEAU · elevation (m)' : 'ELEVATION (m)', x, 29)
    const gradient = ctx.createLinearGradient(x, 0, x + legendWidth, 0)
    for (const stop of elevationStops) {
      gradient.addColorStop(stop.height / 2800, `rgb(${stop.color.join(',')})`)
    }
    ctx.fillStyle = gradient
    ctx.fillRect(x, 41, legendWidth, 12)
    ctx.fillStyle = '#304532'
    for (let i = 0; i <= 4; i++) {
      ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center'
      const value = (start + ((2800 - start) * i) / 4).toLocaleString('en-IN')
      ctx.fillText(
        `${i === 0 && options.stretched ? '≤' : ''}${value}${i === 4 ? '+' : ''}`,
        x + (legendWidth * i) / 4,
        72,
      )
    }
    ctx.textAlign = 'left'
  }
  // A single scale bar is meaningful for the flat map only; perspective varies in 3D.
  if (!terrain && map.getPitch() === 0) {
    const w = map.getContainer().clientWidth
    const h = map.getContainer().clientHeight
    const metersPerPixel = map
      .unproject([w / 2, h / 2])
      .distanceTo(map.unproject([w / 2 + 1, h / 2]))
    const target = metersPerPixel * w * 0.15
    const power = 10 ** Math.floor(Math.log10(target))
    const distance = [5, 2, 1].map((n) => n * power).find((n) => n <= target) ?? power
    const length = (distance / metersPerPixel / w) * 1000
    ctx.strokeStyle = '#304532'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(530, 91)
    ctx.lineTo(530, 98)
    ctx.lineTo(530 + length, 98)
    ctx.lineTo(530 + length, 91)
    ctx.stroke()
    ctx.fillText(distance >= 1000 ? `${distance / 1000} km` : `${distance} m`, 540 + length, 101)
  }
  ctx.font = '10px sans-serif'
  ctx.fillText('MOUNTAINOLOGY · Approximate DEM elevations; editorial place coordinates.', 24, 128)
  ctx.fillText(
    '© OpenStreetMap contributors · openstreetmap.org/copyright · OpenFreeMap · © OpenMapTiles · Natural Earth',
    24,
    147,
  )
  ctx.fillText(
    'Terrain: Mapzen · SRTM / GMTED2010: USGS · ETOPO1: NOAA · registry.opendata.aws/terrain-tiles',
    24,
    164,
  )
  return canvas
}
