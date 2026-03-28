import type React from 'react'
import { ChevronDown, ChevronUp, Layers, LocateFixed, MapPin, Mountain, Pause, Play, Settings, SkipForward, X } from 'lucide-react'
import type { Phase, Mode } from './Sidebar'
import type { ProminenceStep } from '../lib/prominenceAlgorithm'

type BottomBarProps = {
  mode: Mode
  onSetMode: (mode: Mode) => void
  phase: Phase
  selectedElevation: number | null
  onStepElevation: (direction: 'up' | 'down') => void
  contourIslandMax: { lat: number; lng: number; ele: number } | null
  onZoomToContourMax: () => void
  onClearElevation: () => void
  selectedPeak: { lat: number; lng: number; ele: number } | null
  history: ProminenceStep[]
  paused: boolean
  infoOpen: boolean
  onToggleInfo: () => void
  onCompute: () => void
  onTogglePause: () => void
  onStep: () => void
  onZoomToPeak: () => void
  onStop: () => void
  onSelectParent: (peak: { lat: number; lng: number; ele: number }) => void
  isLoading: boolean
}

const iconBtn = 'p-1.5 rounded-lg text-gray-600 hover:bg-black/5 active:bg-black/10'

export const BottomBar = ({
  mode,
  onSetMode,
  phase,
  selectedElevation,
  onStepElevation,
  contourIslandMax,
  onZoomToContourMax,
  onClearElevation,
  selectedPeak,
  history,
  paused,
  infoOpen,
  onToggleInfo,
  onCompute,
  onTogglePause,
  onStep,
  onZoomToPeak,
  onStop,
  onSelectParent,
  isLoading,
}: BottomBarProps) => {
  const lastStep = history[history.length - 1]
  const doneStep = lastStep?.done ? lastStep : null

  const row = (left: React.ReactNode, right?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">{left}</div>
      {right && <div className="flex items-center gap-1 shrink-0">{right}</div>}
    </div>
  )

  const contourContent = () => {
    if (selectedElevation === null) {
      return row(<span className="text-gray-500 text-sm">Select a contour to begin</span>)
    }
    return (
      <div className="space-y-1">
        {row(
          <>
            <button type="button" onClick={() => onStepElevation('down')} className={iconBtn} title="Step down">
              <ChevronDown size={15} />
            </button>
            <span className="font-semibold tabular-nums text-sm">{selectedElevation.toFixed(2)} m</span>
            <button type="button" onClick={() => onStepElevation('up')} className={iconBtn} title="Step up">
              <ChevronUp size={15} />
            </button>
          </>,
          <button type="button" onClick={onClearElevation} className={iconBtn} title="Clear contour">
            <X size={15} />
          </button>,
        )}
        {contourIslandMax && row(
          <span className="text-xs text-gray-500">Max: {contourIslandMax.ele.toFixed(2)} m</span>,
          <button type="button" onClick={onZoomToContourMax} className={iconBtn} title="Navigate to max elevation">
            <LocateFixed size={15} />
          </button>,
        )}
      </div>
    )
  }

  const prominenceContent = () => {
    const peakRow = selectedPeak
      ? row(
          <span className="text-xs text-gray-500">
            Selected: <span className="font-semibold tabular-nums text-gray-800">{selectedPeak.ele.toFixed(2)} m</span>
          </span>,
          <button type="button" onClick={onZoomToPeak} className={iconBtn} title="Zoom to peak">
            <LocateFixed size={15} />
          </button>,
        )
      : null

    if (doneStep) {
      return (
        <div className="space-y-1">
          {peakRow}
          {row(
            <>
              <span className="font-semibold text-sm text-green-700">✓ {doneStep.prominence.toFixed(2)} m</span>
              <span className="text-xs text-gray-400">col {doneStep.keyColEle.toFixed(2)} m</span>
            </>,
            <button type="button" onClick={onStop} className={iconBtn} title="Clear result">
              <X size={15} />
            </button>,
          )}
          {row(
            <span className="text-xs text-gray-500">Parent: {doneStep.parentPeak.ele.toFixed(2)} m</span>,
            <button type="button" onClick={() => onSelectParent(doneStep.parentPeak)} className={iconBtn} title="Select parent peak">
              <MapPin size={15} />
            </button>,
          )}
        </div>
      )
    }

    if (phase === 'running') {
      return (
        <div className="space-y-1">
          {peakRow}
          {lastStep && !lastStep.done && row(
            <span className="font-medium tabular-nums text-xs text-gray-500">
              {`↓ ${lastStep.threshold.toFixed(2)} m${lastStep.expandedTiles ? ' ↔' : lastStep.touchesBoundary ? ' · boundary' : ''}`}
            </span>,
            <>
              <span className="text-xs text-gray-400">{lastStep.depthSoFar.toFixed(2)} m</span>
              <button type="button" onClick={onTogglePause} className={iconBtn} title={paused ? 'Resume' : 'Pause'}>
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
              {paused && (
                <button type="button" onClick={onStep} className={iconBtn} title="Step">
                  <SkipForward size={15} />
                </button>
              )}
              <button type="button" onClick={onStop} className={iconBtn} title="Stop">
                <X size={15} />
              </button>
            </>,
          )}
        </div>
      )
    }

    if (phase === 'ready' && !selectedPeak) {
      return row(<span className="text-gray-500 text-sm">Snapping to summit…</span>)
    }

    if (selectedPeak) {
      return (
        <div className="space-y-1">
          {row(
            <span className="text-xs text-gray-500">
              Selected: <span className="font-semibold tabular-nums text-gray-800">{selectedPeak.ele.toFixed(2)} m</span>
            </span>,
            <>
              <button type="button" onClick={onZoomToPeak} className={iconBtn} title="Zoom to peak">
                <LocateFixed size={15} />
              </button>
              {phase === 'ready' && (
                <button
                  type="button"
                  onClick={onCompute}
                  className="p-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 active:bg-gray-800"
                  title="Compute prominence"
                >
                  <Play size={15} />
                </button>
              )}
            </>,
          )}
        </div>
      )
    }

    return row(<span className="text-gray-500 text-sm">Tap map to select a peak</span>)
  }

  return (
    <>
      {/* Centered pill */}
      <div className="absolute bottom-20 left-3 right-3 z-20 flex justify-center pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md pointer-events-auto w-fit min-w-56">
          {/* Row 1: mode toggle */}
          <div className="flex bg-gray-100 rounded-t-xl overflow-hidden">
            <button
              type="button"
              onClick={() => onSetMode('contour')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors flex-1 justify-center ${
                mode === 'contour'
                  ? 'bg-white text-gray-900 shadow-sm rounded-tl-xl'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Layers size={13} />
              Contour
            </button>
            <button
              type="button"
              onClick={() => onSetMode('prominence')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors flex-1 justify-center ${
                mode === 'prominence'
                  ? 'bg-white text-gray-900 shadow-sm rounded-tr-xl'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Mountain size={13} />
              Prominence
            </button>
          </div>

          {/* Row 2: status + inline actions */}
          <div className="px-3 py-2.5">
            {mode === 'contour' ? contourContent() : prominenceContent()}
          </div>

          {/* Row 3: loading / idle */}
          <div className="px-3 py-1.5 border-t border-gray-100 flex items-center justify-center gap-1.5">
            {isLoading
              ? <><div className="size-2.5 rounded-full border border-gray-400/40 border-t-gray-500 animate-spin shrink-0" /><span className="text-[10px] text-gray-600">Loading tiles…</span></>
              : <span className="text-[10px] text-gray-600">Idle</span>
            }
          </div>
        </div>
      </div>

      {/* Info button — outside pill, bottom right */}
      <button
        type="button"
        onClick={onToggleInfo}
        className={`absolute top-3 right-3 z-20 p-2 rounded-xl shadow-md backdrop-blur-sm transition-colors ${
          infoOpen
            ? 'bg-gray-900 text-white'
            : 'bg-white/90 text-gray-500 hover:bg-white hover:text-gray-700'
        }`}
        title="Toggle info panel"
      >
        <Settings size={16} />
      </button>
    </>
  )
}
