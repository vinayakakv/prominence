import { useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, MapPin, Play, Pause, SkipForward, X, Menu } from 'lucide-react'
import type { ProminenceStep } from '../lib/prominenceAlgorithm'
import { stepElevation } from '../lib/elevationStep'

type Basemap = 'hillshade' | 'satellite'
export type Phase = 'idle' | 'selecting' | 'ready' | 'running' | 'done'

interface SidebarProps {
  basemap: Basemap
  setBasemap: (b: Basemap) => void
  selectedElevation: number | null
  setSelectedElevation: (e: number | null) => void
  stepDelta: number
  setStepDelta: (d: number) => void
  isLoading: boolean
  phase: Phase
  selectedPeak: { lat: number; lng: number; ele: number } | null
  history: ProminenceStep[]
  paused: boolean
  stepInterval: number
  setStepInterval: (n: number) => void
  onToggleSelectPeak: () => void
  onCompute: () => void
  onStep: () => void
  onTogglePause: () => void
  onReset: () => void
}

export const Sidebar = ({
  basemap, setBasemap,
  selectedElevation, setSelectedElevation,
  stepDelta, setStepDelta,
  isLoading,
  phase, selectedPeak, history, paused,
  stepInterval, setStepInterval,
  onToggleSelectPeak, onCompute, onStep, onTogglePause, onReset,
}: SidebarProps) => {
  const [open, setOpen] = useState(true)
  const traceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (traceRef.current) {
      traceRef.current.scrollTop = traceRef.current.scrollHeight
    }
  }, [history.length])

  const lastStep = history[history.length - 1]
  const doneStep = lastStep?.done ? lastStep : null

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="absolute left-3 top-3 z-20 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-2 text-gray-700 hover:bg-white transition-colors"
        title={open ? 'Close sidebar' : 'Open sidebar'}
      >
        <Menu size={18} />
      </button>

      {/* Sidebar panel */}
      <div className={`absolute left-0 top-0 h-full w-72 bg-white shadow-2xl z-10 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-800">Prominence</span>
            {isLoading && (
              <div className="size-3 rounded-full border border-gray-300 border-t-gray-500 animate-spin shrink-0" />
            )}
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-5">

            {/* Basemap */}
            <section>
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Basemap</h3>
              <div className="flex gap-1">
                {(['hillshade', 'satellite'] as Basemap[]).map(id => (
                  <button
                    key={id}
                    onClick={() => setBasemap(id)}
                    className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                      basemap === id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {id === 'hillshade' ? 'Terrain' : 'Satellite'}
                  </button>
                ))}
              </div>
            </section>

            {/* Contour */}
            <section>
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Contour</h3>
              {selectedElevation !== null ? (
                <div className="space-y-2">
                  <div className="text-sm text-gray-700">
                    Selected: <strong>{selectedElevation} m</strong>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedElevation(stepElevation(selectedElevation, stepDelta, 'down'))}
                      className="p-1 rounded hover:bg-gray-100 cursor-pointer"
                      title={`−${stepDelta} m`}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <input
                      type="number"
                      value={stepDelta}
                      min={1}
                      onChange={e => setStepDelta(Math.max(1, Number(e.target.value)))}
                      className="w-16 text-xs text-center border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-gray-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-gray-400">m</span>
                    <button
                      onClick={() => setSelectedElevation(stepElevation(selectedElevation, stepDelta, 'up'))}
                      className="p-1 rounded hover:bg-gray-100 cursor-pointer"
                      title={`+${stepDelta} m`}
                    >
                      <ChevronUp size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Click a contour line to select</p>
              )}
            </section>

            {/* Prominence */}
            <section>
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Prominence</h3>

              {/* Select peak button */}
              {(phase === 'idle' || phase === 'selecting' || phase === 'ready') && (
                <button
                  onClick={onToggleSelectPeak}
                  className={`w-full py-2 text-xs rounded-lg flex items-center gap-2 justify-center mb-2 font-medium transition-colors cursor-pointer ${
                    phase === 'selecting'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <MapPin size={13} />
                  {phase === 'selecting' ? 'Click map to place peak…' : 'Select Peak'}
                </button>
              )}

              {/* Peak info */}
              {phase === 'ready' && !selectedPeak && (
                <p className="text-xs text-gray-400 mb-2">Snapping to nearest summit…</p>
              )}
              {selectedPeak && (
                <div className="text-xs text-gray-600 mb-3 bg-gray-50 rounded-lg p-2 space-y-0.5">
                  <div className="font-medium text-gray-800">{selectedPeak.ele.toFixed(0)} m</div>
                  <div className="text-gray-400">
                    {selectedPeak.lat.toFixed(4)}°N &nbsp;{selectedPeak.lng.toFixed(4)}°E
                  </div>
                </div>
              )}

              {/* Step interval + compute */}
              {(phase === 'idle' || phase === 'ready') && selectedPeak && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Step interval</span>
                    <input
                      type="number"
                      value={stepInterval}
                      min={1}
                      onChange={e => setStepInterval(Math.max(1, Number(e.target.value)))}
                      className="w-16 text-xs text-center border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-gray-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-gray-400">m</span>
                  </div>
                  <button
                    onClick={onCompute}
                    disabled={!selectedPeak}
                    className="w-full py-2 text-xs rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors cursor-pointer"
                  >
                    ▶ Compute Prominence
                  </button>
                </div>
              )}

              {/* Run controls */}
              {(phase === 'running' || phase === 'done') && (
                <div className="space-y-2">
                  {/* Live depth during run */}
                  {phase === 'running' && lastStep && !lastStep.done && (
                    <div className="text-xs text-gray-500 text-center">
                      Depth so far: <strong className="text-gray-700">{lastStep.depthSoFar} m</strong>
                    </div>
                  )}
                  <div className="flex gap-1">
                    {phase === 'running' && (
                      <>
                        <button
                          onClick={onTogglePause}
                          className="flex-1 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center gap-1 cursor-pointer"
                        >
                          {paused ? <><Play size={11} /> Resume</> : <><Pause size={11} /> Pause</>}
                        </button>
                        <button
                          onClick={onStep}
                          disabled={!paused}
                          className="flex-1 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <SkipForward size={11} /> Step
                        </button>
                      </>
                    )}
                    <button
                      onClick={onReset}
                      className="flex-1 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <X size={11} /> Reset
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Result summary */}
            {doneStep && (
              <section className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                <div className="text-xs font-semibold text-green-800">Result</div>
                <div className="text-sm font-bold text-green-900">{doneStep.prominence} m prominence</div>
                <div className="text-xs text-green-700">Key col: {doneStep.keyColEle} m</div>
                <div className="text-xs text-green-700">
                  Parent: {doneStep.parentPeak.ele.toFixed(0)} m
                </div>
                <div className="text-xs text-green-600">
                  {doneStep.parentPeak.lat.toFixed(4)}°N &nbsp;{doneStep.parentPeak.lng.toFixed(4)}°E
                </div>
              </section>
            )}

            {/* Trace */}
            {history.length > 0 && (
              <section>
                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Trace</h3>
                <div
                  ref={traceRef}
                  className="max-h-56 overflow-y-auto space-y-0.5 text-xs font-mono"
                >
                  {history.map((step, i) => (
                    <div
                      key={i}
                      className={`px-2 py-1 rounded ${
                        step.done
                          ? 'bg-green-100 text-green-800 font-semibold'
                          : step.expandedTiles
                          ? 'bg-blue-50 text-blue-700'
                          : step.touchesBoundary
                          ? 'bg-yellow-50 text-yellow-700'
                          : 'text-gray-500'
                      }`}
                    >
                      {step.done ? (
                        `✓ ${step.keyColEle} m — parent at ${step.parentPeak.ele.toFixed(0)} m`
                      ) : (
                        `↓ ${step.threshold} m${step.expandedTiles ? ' ↔ expand' : step.touchesBoundary ? ' ·boundary' : ''}`
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        </div>

      </div>
    </>
  )
}
