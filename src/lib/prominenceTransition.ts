import type { Peak } from '@/types/app'
import type { IslandResult } from './islandDetector'
import type { ProminenceContext, ProminenceStep } from './prominenceAlgorithm'
import { stitchedPixelToLatLng } from './geoTiles'

export type ProminenceFillResult = {
  island: IslandResult | null
  threshold: number
  tileZ: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  width: number
  height: number
}

export type ProminenceTransition =
  | {
      type: 'lower-threshold'
      nextContext: ProminenceContext
    }
  | {
      type: 'complete'
      step: ProminenceStep
      parentPeak: Peak
    }
  | {
      type: 'expand-viewport'
      step: ProminenceStep
    }
  | {
      type: 'continue'
      step: ProminenceStep
      nextContext: ProminenceContext
    }

export const getNextProminenceTransition = (args: {
  context: ProminenceContext
  fillResult: ProminenceFillResult
  minIslandPixels: number
}): ProminenceTransition => {
  const { context, fillResult, minIslandPixels } = args
  const { island, threshold, tileZ, xMin, yMin, width } = fillResult
  const { peakEle, stepInterval } = context

  if (!island) {
    return {
      type: 'lower-threshold',
      nextContext: { ...context, currentThreshold: threshold - stepInterval },
    }
  }

  if (island.maxEle > peakEle && island.pixels.length >= minIslandPixels) {
    const parentLatLng = stitchedPixelToLatLng({
      pixelIdx: island.maxEleIdx,
      width,
      tileZ,
      xMin,
      yMin,
    })
    const parentPeak = { ...parentLatLng, ele: island.maxEle }
    return {
      type: 'complete',
      parentPeak,
      step: {
        threshold,
        done: true,
        keyColEle: threshold,
        prominence: peakEle - threshold,
        parentPeak,
      },
    }
  }

  const step: ProminenceStep = {
    threshold,
    touchesBoundary: island.touchesBoundary,
    expandedTiles: false,
    depthSoFar: peakEle - threshold,
    done: false,
  }

  if (island.touchesBoundary) {
    return { type: 'expand-viewport', step }
  }

  return {
    type: 'continue',
    step,
    nextContext: { ...context, currentThreshold: threshold - stepInterval },
  }
}
