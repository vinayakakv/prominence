import { useEffect, useState } from 'react'
import { DEFAULT_VIEW } from '@/config/map'
import type { Basemap, MapPosition, Peak } from '@/types/app'

export type InitialUrlParams = MapPosition & {
  selectedContour: number | null
  basemap: Basemap
  savedPeak: Peak | null
}

const parseNumberParam = (params: URLSearchParams, key: string) => {
  const value = parseFloat(params.get(key) ?? '')
  return Number.isNaN(value) ? null : value
}

const parseUrlParams = (): InitialUrlParams => {
  const params = new URLSearchParams(window.location.search)
  const parsedLng = parseNumberParam(params, 'lng')
  const parsedLat = parseNumberParam(params, 'lat')
  const parsedZoom = parseNumberParam(params, 'zoom')
  const parsedContour = parseNumberParam(params, 'contour')
  const parsedBasemap = params.get('basemap')
  const parsedPeakLat = parseNumberParam(params, 'peak_lat')
  const parsedPeakLng = parseNumberParam(params, 'peak_lng')
  const parsedPeakEle = parseNumberParam(params, 'peak_ele')

  return {
    longitude: parsedLng ?? DEFAULT_VIEW.longitude,
    latitude: parsedLat ?? DEFAULT_VIEW.latitude,
    zoom: parsedZoom ?? DEFAULT_VIEW.zoom,
    selectedContour: parsedContour,
    basemap: parsedBasemap === 'satellite' ? 'satellite' : 'hillshade',
    savedPeak:
      parsedPeakLat !== null && parsedPeakLng !== null && parsedPeakEle !== null
        ? { lat: parsedPeakLat, lng: parsedPeakLng, ele: parsedPeakEle }
        : null,
  }
}

export const useInitialUrlParams = () => {
  const [initialParams] = useState(parseUrlParams)
  return initialParams
}

export const useSyncUrlParams = (args: {
  mapPosition: MapPosition
  selectedElevation: number | null
  basemap: Basemap
  selectedPeak: Peak | null
}) => {
  const { mapPosition, selectedElevation, basemap, selectedPeak } = args

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('lng', mapPosition.longitude.toFixed(5))
    params.set('lat', mapPosition.latitude.toFixed(5))
    params.set('zoom', mapPosition.zoom.toFixed(2))
    if (selectedElevation !== null) params.set('contour', String(selectedElevation))
    if (basemap !== 'hillshade') params.set('basemap', basemap)
    if (selectedPeak) {
      params.set('peak_lat', selectedPeak.lat.toFixed(5))
      params.set('peak_lng', selectedPeak.lng.toFixed(5))
      params.set('peak_ele', selectedPeak.ele.toFixed(1))
    }
    window.history.replaceState(null, '', `?${params.toString()}`)
  }, [mapPosition, selectedElevation, basemap, selectedPeak])
}
