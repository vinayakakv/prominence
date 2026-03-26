import { LocateFixed, MapPin, Play, X } from 'lucide-react'
import type { Phase } from './Sidebar'
import type { ProminenceStep } from '../lib/prominenceAlgorithm'

interface MobileStatusBarProps {
  phase: Phase
  selectedPeak: { lat: number; lng: number; ele: number } | null
  selectedElevation: number | null
  history: ProminenceStep[]
  onZoomToPeak: () => void
  onClearPeak: () => void
  onClearElevation: () => void
  onToggleSelectPeak: () => void
  onCompute: () => void
}

export const MobileStatusBar = ({
  phase, selectedPeak, selectedElevation, history,
  onZoomToPeak, onClearPeak, onClearElevation, onToggleSelectPeak, onCompute,
}: MobileStatusBarProps) => {
  const lastStep = history[history.length - 1]
  const doneStep = lastStep?.done ? lastStep : null
  const showPeakActions = !!selectedPeak && (phase === 'idle' || phase === 'ready' || phase === 'done')
  const showElevationActions = selectedElevation !== null && !selectedPeak && phase === 'idle'

  let primary: string
  let secondary: string | null = null

  if (doneStep) {
    primary = `✓ ${doneStep.prominence} m prominence`
    secondary = `key col ${doneStep.keyColEle} m`
  } else if (phase === 'running' && lastStep && !lastStep.done) {
    primary = `↓ ${lastStep.threshold} m${lastStep.expandedTiles ? ' ↔ expand' : lastStep.touchesBoundary ? ' · boundary' : ''}`
    secondary = `depth ${lastStep.depthSoFar} m`
  } else if (phase === 'selecting') {
    primary = 'Tap map to place peak…'
  } else if (phase === 'ready' && !selectedPeak) {
    primary = 'Snapping to nearest summit…'
  } else if (selectedPeak) {
    primary = `${selectedPeak.ele.toFixed(0)} m`
    secondary = `${selectedPeak.lat.toFixed(4)}°N  ${selectedPeak.lng.toFixed(4)}°E`
  } else if (selectedElevation !== null) {
    primary = `${selectedElevation} m`
    secondary = 'contour selected'
  } else {
    primary = 'Tap a contour line to begin'
  }

  return (
    <div className="md:hidden absolute bottom-3 left-3 right-3 z-20 pointer-events-none">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md px-4 py-2.5 flex items-center gap-3 text-sm pointer-events-auto">
        <span className={`flex-1 ${doneStep ? 'font-semibold text-green-700' : 'font-medium text-gray-800'}`}>
          {primary}
        </span>
        {secondary && !showPeakActions && !showElevationActions && (
          <span className="text-xs text-gray-500 shrink-0">{secondary}</span>
        )}
        {showElevationActions && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-gray-500 mr-1">{secondary}</span>
            <button
              onClick={onToggleSelectPeak}
              className="p-2 rounded-lg text-gray-600 hover:bg-black/5 active:bg-black/10"
              title="Select peak"
            >
              <MapPin size={16} />
            </button>
            <button
              onClick={onClearElevation}
              className="p-2 rounded-lg text-gray-600 hover:bg-black/5 active:bg-black/10"
              title="Clear contour"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {showPeakActions && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-gray-500 mr-1">{secondary}</span>
            <button
              onClick={onZoomToPeak}
              className="p-2 rounded-lg text-gray-600 hover:bg-black/5 active:bg-black/10"
              title="Zoom to peak"
            >
              <LocateFixed size={16} />
            </button>
            {phase === 'ready' && (
              <button
                onClick={onCompute}
                className="p-2 rounded-lg text-orange-500 hover:bg-orange-50 active:bg-orange-100"
                title="Compute prominence"
              >
                <Play size={16} />
              </button>
            )}
            <button
              onClick={onClearPeak}
              className="p-2 rounded-lg text-gray-600 hover:bg-black/5 active:bg-black/10"
              title="Clear peak"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
