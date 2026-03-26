import { useEffect, useRef, useState } from 'react'
import {
  ChevronUp,
  ChevronDown,
  MapPin,
  Play,
  Pause,
  SkipForward,
  X,
  Menu,
  LocateFixed,
} from 'lucide-react'
import logoUrl from '../assets/logo.svg'
import type { ProminenceStep } from '../lib/prominenceAlgorithm'
import { stepElevation } from '../lib/elevationStep'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

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
  onZoomToPeak: () => void
  onCompute: () => void
  onStep: () => void
  onTogglePause: () => void
  onReset: () => void
}

export const Sidebar = ({
  basemap,
  setBasemap,
  selectedElevation,
  setSelectedElevation,
  stepDelta,
  setStepDelta,
  isLoading,
  phase,
  selectedPeak,
  history,
  paused,
  stepInterval,
  setStepInterval,
  onToggleSelectPeak,
  onZoomToPeak,
  onCompute,
  onStep,
  onTogglePause,
  onReset,
}: SidebarProps) => {
  const [open, setOpen] = useState(true)
  const traceEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ block: 'end' })
  }, [history.length])

  const lastStep = history[history.length - 1]
  const doneStep = lastStep?.done ? lastStep : null

  return (
    <>
      {/* External toggle — only when sidebar is closed */}
      {!open && (
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setOpen(true)}
          className="absolute left-3 top-3 z-20 bg-white/90 backdrop-blur-sm shadow-md"
          title="Open sidebar"
        >
          <Menu size={18} />
        </Button>
      )}

      {/* Sidebar panel */}
      <div
        className={`absolute left-0 top-0 h-full w-72 bg-background shadow-2xl z-10 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center px-3 py-3 border-b shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            className="absolute left-2"
            title="Close sidebar"
          >
            <Menu size={18} />
          </Button>
          <div className="flex flex-col items-center gap-0.5">
            <img src={logoUrl} alt="Mountainology" className="h-8 w-auto" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Prominence
            </span>
          </div>
          {isLoading && (
            <div className="absolute right-3 size-3 rounded-full border border-muted-foreground/30 border-t-foreground animate-spin" />
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-3 space-y-4">
            {/* Basemap */}
            <section>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Basemap
              </h3>
              <div className="flex gap-1">
                {(['hillshade', 'satellite'] as Basemap[]).map((id) => (
                  <Button
                    key={id}
                    variant={basemap === id ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setBasemap(id)}
                  >
                    {id === 'hillshade' ? 'Terrain' : 'Satellite'}
                  </Button>
                ))}
              </div>
            </section>

            <Separator />

            {/* Contour */}
            <section>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Contour
              </h3>
              {selectedElevation !== null ? (
                <div className="space-y-2">
                  <div className="text-sm">
                    Selected: <strong>{selectedElevation} m</strong>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        setSelectedElevation(stepElevation(selectedElevation, stepDelta, 'down'))
                      }
                      title={`−${stepDelta} m`}
                    >
                      <ChevronDown size={14} />
                    </Button>
                    <Input
                      type="number"
                      value={stepDelta}
                      min={1}
                      onChange={(e) => setStepDelta(Math.max(1, Number(e.target.value)))}
                      className="w-16 text-xs text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-muted-foreground">m</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        setSelectedElevation(stepElevation(selectedElevation, stepDelta, 'up'))
                      }
                      title={`+${stepDelta} m`}
                    >
                      <ChevronUp size={14} />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Click a contour line to select</p>
              )}
            </section>

            <Separator />

            {/* Current Peak */}
            <section>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Current Peak
              </h3>

              {(phase === 'idle' || phase === 'selecting' || phase === 'ready') && (
                <Button
                  variant={phase === 'selecting' ? 'default' : 'outline'}
                  size="sm"
                  className="w-full mb-2"
                  onClick={onToggleSelectPeak}
                >
                  <MapPin size={13} />
                  {phase === 'selecting' ? 'Click map to place peak…' : 'Select Peak'}
                </Button>
              )}

              {phase === 'ready' && !selectedPeak && (
                <p className="text-xs text-muted-foreground">Snapping to nearest summit…</p>
              )}
              {selectedPeak && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-xs text-muted-foreground bg-muted rounded-lg p-2 space-y-0.5">
                    <div className="font-medium text-foreground">
                      {selectedPeak.ele.toFixed(0)} m
                    </div>
                    <div>
                      {selectedPeak.lat.toFixed(4)}°N &nbsp;{selectedPeak.lng.toFixed(4)}°E
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onZoomToPeak}
                    title="Zoom to peak"
                  >
                    <LocateFixed size={15} />
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            {/* Prominence */}
            <section>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Prominence
              </h3>

              {(phase === 'idle' || phase === 'ready') && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Step interval</span>
                    <Input
                      type="number"
                      value={stepInterval}
                      min={1}
                      onChange={(e) => setStepInterval(Math.max(1, Number(e.target.value)))}
                      className="w-16 text-xs text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-muted-foreground">m</span>
                  </div>
                  <Button
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    size="sm"
                    onClick={onCompute}
                    disabled={!selectedPeak}
                  >
                    ▶ Compute Prominence
                  </Button>
                </div>
              )}

              {(phase === 'running' || phase === 'done') && (
                <div className="space-y-2">
                  {phase === 'running' && lastStep && !lastStep.done && (
                    <div className="text-xs text-muted-foreground text-center">
                      Depth so far:{' '}
                      <strong className="text-foreground">{lastStep.depthSoFar} m</strong>
                    </div>
                  )}
                  <div className="flex gap-1">
                    {phase === 'running' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={onTogglePause}
                        >
                          {paused ? (
                            <>
                              <Play size={11} /> Resume
                            </>
                          ) : (
                            <>
                              <Pause size={11} /> Pause
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={!paused}
                          onClick={onStep}
                        >
                          <SkipForward size={11} /> Step
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" className="flex-1" onClick={onReset}>
                      <X size={11} /> Reset
                    </Button>
                  </div>
                </div>
              )}

              {doneStep && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                  <div className="text-xs font-semibold text-green-800">Result</div>
                  <div className="text-sm font-bold text-green-900">
                    {doneStep.prominence} m prominence
                  </div>
                  <div className="text-xs text-green-700">Key col: {doneStep.keyColEle} m</div>
                  <div className="text-xs text-green-700">
                    Parent: {doneStep.parentPeak.ele.toFixed(0)} m
                  </div>
                  <div className="text-xs text-green-600">
                    {doneStep.parentPeak.lat.toFixed(4)}°N &nbsp;
                    {doneStep.parentPeak.lng.toFixed(4)}°E
                  </div>
                </div>
              )}
            </section>

            {history.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Trace
                  </h3>
                  <ScrollArea className="h-56">
                    <div className="space-y-0.5 text-xs font-mono pr-3">
                      {history.map((step, i) => (
                        <div
                          key={i}
                          className={cn(
                            'px-2 py-1 rounded',
                            step.done
                              ? 'bg-green-100 text-green-800 font-semibold'
                              : step.expandedTiles
                                ? 'bg-blue-50 text-blue-700'
                                : step.touchesBoundary
                                  ? 'bg-yellow-50 text-yellow-700'
                                  : 'text-muted-foreground',
                          )}
                        >
                          {step.done
                            ? `✓ ${step.keyColEle} m — parent at ${step.parentPeak.ele.toFixed(0)} m`
                            : `↓ ${step.threshold} m${step.expandedTiles ? ' ↔ expand' : step.touchesBoundary ? ' ·boundary' : ''}`}
                        </div>
                      ))}
                      <div ref={traceEndRef} />
                    </div>
                  </ScrollArea>
                </section>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 shrink-0">
          <a
            href="https://github.com/vinayakakv/prominence"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            View source
          </a>
        </div>
      </div>
    </>
  )
}
