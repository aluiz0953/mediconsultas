import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowRightIcon, CheckCircleIcon } from './icons'

const KNOB = 44 // px
const PAD = 4 // px between knob and track edge
const RELEASE_AT = 0.6 // letting go past this point finishes the slide
const TAKE_OVER_AT = 0.8 // dragging past this point finishes it without waiting for the release

type Phase = 'idle' | 'busy' | 'done'

interface Props {
  label: string
  busyLabel?: string
  doneLabel?: string
  disabled?: boolean
  // Returning false (or throwing) means the action failed and the slider resets.
  onConfirm: () => Promise<boolean | undefined> | boolean | undefined
  className?: string
}

// A handle you push across a track: it follows the pointer, and past the mark it takes
// over and finishes the journey itself; letting go earlier springs it back. Pressing
// Enter/Space on the handle confirms directly, so it stays usable without a pointer.
export function SlideConfirm({ label, busyLabel = 'Confirmando…', doneLabel = 'Confirmado', disabled = false, onConfirm, className = '' }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLButtonElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const drag = useRef<{ startX: number; max: number; x: number; pointerId: number } | null>(null)
  const alive = useRef(true)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(resetTimer.current)
    }
  }, [])

  const travel = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - KNOB - PAD * 2)

  // Moves the handle straight through the DOM: no React re-render on every pointer move.
  function paint(x: number, animate: boolean) {
    const knob = knobRef.current
    const fill = fillRef.current
    const text = labelRef.current
    if (!knob || !fill) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const transition = animate && !reduce ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
    const max = travel()
    knob.style.transition = transition
    knob.style.transform = `translateX(${x}px)`
    fill.style.transition = animate && !reduce ? 'width 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
    fill.style.width = x > 0 ? `${x + KNOB + PAD}px` : '0px'
    if (text) text.style.opacity = String(Math.max(0, 1 - (max > 0 ? x / max : 0) * 1.4))
  }

  async function complete() {
    if (phase !== 'idle') return
    setPhase('busy')
    paint(travel(), true)
    let ok = true
    try {
      ok = (await onConfirm()) !== false
    } catch {
      ok = false
    }
    if (!alive.current) return
    if (ok) {
      setPhase('done')
      resetTimer.current = setTimeout(() => {
        setPhase('idle')
        paint(0, true)
      }, 1800)
    } else {
      setPhase('idle')
      paint(0, true)
    }
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || phase !== 'idle') return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, max: travel(), x: 0, pointerId: event.pointerId }
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current) return
    current.x = Math.min(Math.max(event.clientX - current.startX, 0), current.max)
    paint(current.x, false)
    if (current.max > 0 && current.x >= current.max * TAKE_OVER_AT) {
      drag.current = null
      void complete()
    }
  }

  function onPointerEnd() {
    const current = drag.current
    if (!current) return
    drag.current = null
    if (current.max > 0 && current.x >= current.max * RELEASE_AT) void complete()
    else paint(0, true)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!disabled) void complete()
    }
  }

  const finished = phase === 'done'

  return (
    <div
      ref={trackRef}
      className={`relative h-[52px] w-full max-w-[320px] select-none overflow-hidden rounded-full bg-neutral-900 dark:bg-neutral-800 ${
        disabled ? 'opacity-50' : ''
      } ${className}`}
    >
      <div
        ref={fillRef}
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 rounded-full transition-colors duration-300 ${finished ? 'bg-emerald-600' : 'bg-emerald-500/30'}`}
        style={{ width: 0 }}
      />

      {phase === 'idle' ? (
        <span
          key="idle"
          ref={labelRef}
          className="pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-sm font-medium text-neutral-400"
        >
          {label}
        </span>
      ) : (
        <span
          key="status"
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium text-white"
        >
          {finished && <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />}
          {finished ? doneLabel : busyLabel}
        </span>
      )}

      <button
        ref={knobRef}
        type="button"
        aria-label={label}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        className="absolute top-1 grid h-11 w-11 touch-none place-items-center rounded-full bg-white text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 enabled:cursor-grab enabled:active:cursor-grabbing"
        style={{ left: PAD }}
      >
        <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}
