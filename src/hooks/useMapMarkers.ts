import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import type { Peak } from '@/types/app'

const createMarkerEl = (color: string) => {
  const markerEl = document.createElement('div')
  markerEl.style.cssText = `width:13px;height:13px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.4);cursor:default`
  return markerEl
}

const useMarker = (args: {
  mapRef: MutableRefObject<MapRef | null>
  mapIsLoaded: boolean
  markerRef: MutableRefObject<maplibregl.Marker | null>
  peak: Peak | null
  color: string
}) => {
  const { mapRef, mapIsLoaded, markerRef, peak, color } = args

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !mapIsLoaded) return
    markerRef.current?.remove()
    markerRef.current = null
    if (!peak) return
    markerRef.current = new maplibregl.Marker({ element: createMarkerEl(color) })
      .setLngLat([peak.lng, peak.lat])
      .addTo(map)
  }, [peak, color, mapIsLoaded, mapRef, markerRef])
}

export const usePeakMarkers = (args: {
  mapRef: MutableRefObject<MapRef | null>
  mapIsLoaded: boolean
  peakMarkerRef: MutableRefObject<maplibregl.Marker | null>
  parentMarkerRef: MutableRefObject<maplibregl.Marker | null>
  selectedPeak: Peak | null
  parentPeak: Peak | null
}) => {
  const { mapRef, mapIsLoaded, peakMarkerRef, parentMarkerRef, selectedPeak, parentPeak } = args

  useMarker({ mapRef, mapIsLoaded, markerRef: peakMarkerRef, peak: selectedPeak, color: '#3b82f6' })
  useMarker({ mapRef, mapIsLoaded, markerRef: parentMarkerRef, peak: parentPeak, color: '#f97316' })
}
