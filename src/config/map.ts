export const TILE_SIZE = 256
export const MAX_DEM_ZOOM = 13

export const BASE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
export const TERRARIUM_TILE_URL =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
export const TERRARIUM_TILES = [TERRARIUM_TILE_URL]
export const SATELLITE_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
]

export const DEFAULT_VIEW = { longitude: 75.35236, latitude: 13.23472, zoom: 12 }

export const CONTOUR_SOURCE_ID = 'contour'
export const CONTOUR_LAYER_ID = 'contour-lines'
export const CONTOUR_SELECTED_LAYER_ID = 'contour-selected'
export const CONTOUR_HIT_LAYER_ID = 'contour-hit'
export const CONTOUR_SOURCE_LAYER = 'contours'

export const SATELLITE_SOURCE_ID = 'satellite'
export const SATELLITE_LAYER_ID = 'satellite-layer'
export const TERRAIN_DEM_SOURCE_ID = 'terrain-dem'
export const TERRAIN_HILLSHADE_LAYER_ID = 'terrain-hillshade'
export const ISLAND_FILL_SOURCE_ID = 'island-fill'
export const ISLAND_FILL_LAYER_ID = 'island-fill-layer'
