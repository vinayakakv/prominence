export type Basemap = 'hillshade' | 'satellite'
export type Phase = 'idle' | 'selecting' | 'ready' | 'running' | 'done'
export type Mode = 'contour' | 'prominence'

export type LatLng = { lat: number; lng: number }
export type Peak = LatLng & { elevation: number }
export type MapPosition = { longitude: number; latitude: number; zoom: number }
