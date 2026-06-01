import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import type maplibregl from 'maplibre-gl'
import { ISLAND_FILL_LAYER_ID, ISLAND_FILL_SOURCE_ID, MAX_DEM_ZOOM } from '@/config/map'
import type { LatLng, MapPosition, Mode, Peak, Phase } from '@/types/app'
import { renderElevationFill } from '@/lib/elevationFill'
import type { ProminenceContext } from '@/lib/prominenceAlgorithm'
import type { ProminenceFillResult } from '@/lib/prominenceTransition'
import { detectIslandContaining } from '@/lib/islandDetector'
import {
  getTileCanvasCoordinates,
  lngLatToPixelIndex,
  lngLatToTile,
  stitchedPixelToLatLng,
} from '@/lib/geoTiles'

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
    const southwestTile = lngLatToTile({
      lng: bounds.getWest(),
      lat: bounds.getSouth(),
      zoomLevel: tileZ,
    })
    const northeastTile = lngLatToTile({
      lng: bounds.getEast(),
      lat: bounds.getNorth(),
      zoomLevel: tileZ,
    })
    const xMin = Math.max(0, Math.min(southwestTile.tileX, northeastTile.tileX))
    const xMax = Math.min(maxTile, Math.max(southwestTile.tileX, northeastTile.tileX))
    const yMin = Math.max(0, Math.min(southwestTile.tileY, northeastTile.tileY))
    const yMax = Math.min(maxTile, Math.max(southwestTile.tileY, northeastTile.tileY))

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

        const prominenceContext = prominenceCtxRef.current
        if (prominenceContext && phase === 'running') {
          const seedPixelIndex = lngLatToPixelIndex({
            lat: prominenceContext.peakLat,
            lng: prominenceContext.peakLng,
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
            threshold: prominenceContext.currentThreshold,
            seedPixelIndex,
          })
          setFillResult({
            island,
            threshold: prominenceContext.currentThreshold,
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
          const seedPixelIndex = lngLatToPixelIndex({
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
            seedPixelIndex,
          })
          if (island) {
            const maxLatLng = stitchedPixelToLatLng({
              pixelIndex: island.maxElevationPixelIndex,
              width,
              tileZ,
              xMin,
              yMin,
            })
            setContourIslandMax({ ...maxLatLng, elevation: island.maxElevation })
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
