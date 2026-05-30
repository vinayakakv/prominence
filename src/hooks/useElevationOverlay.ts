import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import type maplibregl from 'maplibre-gl'
import { ISLAND_FILL_LAYER_ID, ISLAND_FILL_SOURCE_ID, MAX_DEM_ZOOM } from '@/config/map'
import type { LatLng, MapPosition, Mode, Peak, Phase } from '@/types/app'
import { renderElevationFill } from '@/lib/elevationFill'
import { lngLatToPixelIdx } from '@/lib/prominenceAlgorithm'
import type { ProminenceContext } from '@/lib/prominenceAlgorithm'
import type { ProminenceFillResult } from '@/lib/prominenceTransition'
import { detectIslandContaining } from '@/lib/islandDetector'
import { getTileCanvasCoordinates, lngLatToTile, stitchedPixelToLatLng } from '@/lib/geoTiles'

export const useElevationOverlay = (args: {
  mapRef: MutableRefObject<MapRef | null>
  islandCanvasRef: MutableRefObject<HTMLCanvasElement | null>
  prominenceCtxRef: MutableRefObject<ProminenceContext | null>
  mapPosition: MapPosition
  selectedElevation: number | null
  mapIsLoaded: boolean
  phase: Phase
  mode: Mode
  contourClickPoint: LatLng | null
  setFillResult: Dispatch<SetStateAction<ProminenceFillResult | null>>
  setContourIslandMax: Dispatch<SetStateAction<Peak | null>>
}) => {
  const {
    mapRef,
    islandCanvasRef,
    prominenceCtxRef,
    mapPosition,
    selectedElevation,
    mapIsLoaded,
    phase,
    mode,
    contourClickPoint,
    setFillResult,
    setContourIslandMax,
  } = args

  useEffect(() => {
    if (!mapIsLoaded) return

    const map = mapRef.current?.getMap()
    const canvas = islandCanvasRef.current
    if (!map || !canvas) return

    if (selectedElevation === null) {
      map.setLayoutProperty(ISLAND_FILL_LAYER_ID, 'visibility', 'none')
      return
    }

    const tileZ = Math.min(Math.floor(mapPosition.zoom), MAX_DEM_ZOOM)
    const bounds = map.getBounds()
    const maxTile = 2 ** tileZ - 1
    const sw = lngLatToTile({ lng: bounds.getWest(), lat: bounds.getSouth(), zoomLevel: tileZ })
    const ne = lngLatToTile({ lng: bounds.getEast(), lat: bounds.getNorth(), zoomLevel: tileZ })
    const xMin = Math.max(0, Math.min(sw.x, ne.x))
    const xMax = Math.min(maxTile, Math.max(sw.x, ne.x))
    const yMin = Math.max(0, Math.min(sw.y, ne.y))
    const yMax = Math.min(maxTile, Math.max(sw.y, ne.y))

    let cancelled = false
    renderElevationFill({ canvas, tileZ, xMin, xMax, yMin, yMax, threshold: selectedElevation })
      .then(({ data, width, height }) => {
        if (cancelled) return
        const source = map.getSource(ISLAND_FILL_SOURCE_ID) as maplibregl.CanvasSource
        source.setCoordinates(
          getTileCanvasCoordinates({ zoomLevel: tileZ, xMin, yMin, xMax, yMax }),
        )
        source.play()
        requestAnimationFrame(() => {
          if (!cancelled) source.pause()
        })
        map.setLayoutProperty(ISLAND_FILL_LAYER_ID, 'visibility', 'visible')

        const ctx = prominenceCtxRef.current
        if (ctx && phase === 'running') {
          const seedIdx = lngLatToPixelIdx({
            lat: ctx.peakLat,
            lng: ctx.peakLng,
            tileZ,
            xMin,
            yMin,
            width,
            height,
          })
          const island = detectIslandContaining({
            data,
            width,
            height,
            threshold: ctx.currentThreshold,
            seedIdx,
          })
          setFillResult({
            island,
            threshold: ctx.currentThreshold,
            tileZ,
            xMin,
            xMax,
            yMin,
            yMax,
            width,
            height,
          })
        }

        if (mode === 'contour' && contourClickPoint && selectedElevation !== null) {
          const seedIdx = lngLatToPixelIdx({
            lat: contourClickPoint.lat,
            lng: contourClickPoint.lng,
            tileZ,
            xMin,
            yMin,
            width,
            height,
          })
          const island = detectIslandContaining({
            data,
            width,
            height,
            threshold: selectedElevation,
            seedIdx,
          })
          if (island) {
            const maxLatLng = stitchedPixelToLatLng({
              pixelIdx: island.maxEleIdx,
              width,
              tileZ,
              xMin,
              yMin,
            })
            setContourIslandMax({ ...maxLatLng, ele: island.maxEle })
          } else {
            setContourIslandMax(null)
          }
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [
    selectedElevation,
    mapPosition,
    mapIsLoaded,
    phase,
    mode,
    contourClickPoint,
    mapRef,
    islandCanvasRef,
    prominenceCtxRef,
    setFillResult,
    setContourIslandMax,
  ])
}
