import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Circle, X } from 'lucide-react'
import logoUrl from '../assets/logo.svg'
import type { ProminenceStep } from '../lib/prominenceAlgorithm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export type Basemap = 'hillshade' | 'satellite'
export type Phase = 'idle' | 'selecting' | 'ready' | 'running' | 'done'
export type Mode = 'contour' | 'prominence'

type InfoPanelProps = {
  open: boolean
  onClose: () => void
  basemap: Basemap
  setBasemap: (basemap: Basemap) => void
  stepDelta: number
  setStepDelta: (delta: number) => void
  stepInterval: number
  setStepInterval: (interval: number) => void
  selectedElevation: number | null
  history: ProminenceStep[]
  isLoading: boolean
  onSelectElevation: (elevation: number) => void
}

export const InfoPanel = ({
  open,
  onClose,
  basemap,
  setBasemap,
  stepDelta,
  setStepDelta,
  stepInterval,
  setStepInterval,
  selectedElevation,
  history,
  isLoading,
  onSelectElevation,
}: InfoPanelProps) => {
  const traceEndRef = useRef<HTMLDivElement>(null)
  const scrollToSelected = () => {
    if (selectedElevation === null) return
    const button = document.querySelector(`[data-trace-threshold="${selectedElevation}"]`)
    button?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom when history grows
  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ block: 'end' })
  }, [history])

  const lastStep = history[history.length - 1]
  const doneStep = lastStep?.done ? lastStep : null

  const traceSteps = history.filter((step) => !step.done)
  const selectedTraceIdx = traceSteps.findIndex((step) => step.threshold === selectedElevation)
  const canStepUp = selectedTraceIdx > 0
  const canStepDown = selectedTraceIdx !== -1 && selectedTraceIdx < traceSteps.length - 1

  // Auto-scroll to selected trace step
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on selection change
  useEffect(() => {
    scrollToSelected()
  }, [selectedElevation])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (traceSteps.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' && canStepUp) {
        event.preventDefault()
        onSelectElevation(traceSteps[selectedTraceIdx - 1].threshold)
      } else if (event.key === 'ArrowDown' && canStepDown) {
        event.preventDefault()
        onSelectElevation(traceSteps[selectedTraceIdx + 1].threshold)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedTraceIdx, canStepUp, canStepDown, traceSteps])

  if (!open) return null

  return (
    <>
      {/* Mobile backdrop */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
      <div
        className="md:hidden absolute inset-0 z-20 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute top-3 right-3 w-64 bg-background rounded-xl shadow-2xl flex flex-col z-30 md:z-10 bottom-[4.5rem]">
        {/* Header */}
        <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <img src={logoUrl} alt="Mountainology" className="h-7 w-auto" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Prominence
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isLoading && (
              <div className="size-3 rounded-full border border-muted-foreground/30 border-t-foreground animate-spin" />
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close">
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-3 space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Visualise topographic prominence by computing the key col for any summit.
              </p>
              <a
                href="https://github.com/vinayakakv/prominence"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                View source on GitHub ↗
              </a>
            </div>

            <Separator />

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

            {/* Settings */}
            <section>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Settings
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex-1">Contour step</span>
                  <Input
                    type="number"
                    value={stepDelta}
                    min={1}
                    onChange={(e) => setStepDelta(Math.max(1, Number(e.target.value)))}
                    className="w-16 text-xs text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex-1">Prominence step</span>
                  <Input
                    type="number"
                    value={stepInterval}
                    min={1}
                    onChange={(e) => setStepInterval(Math.max(1, Number(e.target.value)))}
                    className="w-16 text-xs text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
              </div>
            </section>

            {history.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Trace
                  </h3>
                  {doneStep && (
                    <div className="mb-2 bg-green-50 border border-green-200 rounded-lg p-2 space-y-0.5">
                      <div className="text-xs font-bold text-green-900">
                        {doneStep.prominence} m prominence
                      </div>
                      <div className="text-xs text-green-700">Key col: {doneStep.keyColEle} m</div>
                    </div>
                  )}
                  <ScrollArea className="h-40">
                    <div className="space-y-0.5 text-xs font-mono pr-2">
                      {history.map((step) =>
                        step.done ? (
                          <div
                            key="done"
                            className="px-2 py-1 rounded bg-green-100 text-green-800 font-semibold"
                          >
                            {`✓ ${step.keyColEle} m — parent at ${step.parentPeak.ele.toFixed(0)} m`}
                          </div>
                        ) : (
                          <button
                            key={step.threshold}
                            type="button"
                            data-trace-threshold={step.threshold}
                            className={cn(
                              'w-full text-left px-2 py-1 rounded',
                              step.threshold === selectedElevation
                                ? 'bg-muted font-medium'
                                : '',
                              step.expandedTiles
                                ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                : step.touchesBoundary
                                  ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                                  : 'text-muted-foreground hover:bg-muted',
                            )}
                            onClick={() => onSelectElevation(step.threshold)}
                          >
                            {`↓ ${step.threshold} m${step.expandedTiles ? ' ↔' : step.touchesBoundary ? ' ·boundary' : ''}`}
                          </button>
                        ),
                      )}
                      <div ref={traceEndRef} />
                    </div>
                  </ScrollArea>
                  {selectedTraceIdx !== -1 && (
                    <div className="flex gap-1 mt-2">
                      <button
                        type="button"
                        disabled={!canStepUp}
                        onClick={() => onSelectElevation(traceSteps[selectedTraceIdx - 1].threshold)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Previous step (↑)"
                      >
                        <ChevronUp size={14} /> Up
                      </button>
                      <button
                        type="button"
                        onClick={scrollToSelected}
                        className="px-2 py-1.5 rounded-lg border text-muted-foreground hover:bg-muted"
                        title="Scroll to selected"
                      >
                        <Circle size={8} fill="currentColor" />
                      </button>
                      <button
                        type="button"
                        disabled={!canStepDown}
                        onClick={() => onSelectElevation(traceSteps[selectedTraceIdx + 1].threshold)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Next step (↓)"
                      >
                        <ChevronDown size={14} /> Down
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
