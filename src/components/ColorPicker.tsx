/**
 * ColorPicker.tsx — Universal Figma/Canva-style color picker.
 *
 * Fully theme-aware via CSS variables — works in dark and light mode.
 * Renders into a React portal so panel overflow cannot clip it.
 *
 * Trigger variants (controlled by props):
 *   default  — swatch + hex label  (standard panel rows)
 *   compact  — swatch only          (replaces small w-7 h-7 native inputs)
 *   spectrum — rainbow swatch + label (toolbar "Custom color" buttons)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ── Color math ─────────────────────────────────────────────────────────────────

function clamp(n: number, lo = 0, hi = 255): number {
  return Math.max(lo, Math.min(hi, n))
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padEnd(6, '0')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r,g,b].map(v => clamp(Math.round(v)).toString(16).padStart(2,'0')).join('')
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min
  let h = 0
  if (d > 0) {
    if (max === r)      h = ((g - b) / d % 6 + 6) % 6 * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else                h = ((r - g) / d + 4) * 60
  }
  return [Math.round(h), Math.round(max > 0 ? (d / max) * 100 : 0), Math.round(max * 100)]
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100; v /= 100
  const f = (n: number): number => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return [Math.round(f(5)*255), Math.round(f(3)*255), Math.round(f(1)*255)]
}

const hsvToHex = (h: number, s: number, v: number): string => rgbToHex(...hsvToRgb(h, s, v))
const hexToHsv = (hex: string): [number, number, number] => rgbToHsv(...hexToRgb(hex))
const isValidHex = (s: string): boolean => /^#?[0-9a-fA-F]{6}$/.test(s)

// ── Recent colors ──────────────────────────────────────────────────────────────

const RECENT_KEY = 'elite_recent_colors'

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[] }
  catch { return [] }
}
function pushRecent(hex: string): void {
  const n = hex.toLowerCase()
  localStorage.setItem(RECENT_KEY, JSON.stringify(
    [n, ...getRecent().filter(c => c !== n)].slice(0, 16)
  ))
}

// ── Inline style tokens (all CSS variables — dark & light auto-adapt) ─────────

const T = {
  popover: {
    background:   'var(--surface-2)',
    border:       '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    boxShadow:    'var(--picker-shadow)',
    width:        224,
    overflow:     'hidden' as const,
  },
  canvas: {
    display: 'block' as const,
    width: '100%',
    height: '100%',
    cursor: 'crosshair',
  },
  input: {
    background:   'var(--surface-3)',
    border:       '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color:        'var(--text-primary)',
    fontFamily:   'var(--font-mono)',
    fontSize:     10,
    padding:      '4px 8px',
    outline:      'none',
  },
  label: { color: 'var(--text-secondary)', fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 600 },
  divider: { height: 1, background: 'var(--border-subtle)', margin: '0 -12px' },
}

// ── SV gradient canvas ────────────────────────────────────────────────────────

function SvCanvas({ h, s, v, onChange, onCommit }: {
  h: number; s: number; v: number
  onChange: (s: number, v: number) => void
  onCommit: () => void
}): JSX.Element {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dragging     = useRef(false)
  const cbRef        = useRef({ onChange, onCommit })
  cbRef.current      = { onChange, onCommit }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { width: w, height: ht } = canvas

    ctx.fillStyle = `hsl(${h},100%,50%)`
    ctx.fillRect(0, 0, w, ht)

    const wg = ctx.createLinearGradient(0, 0, w, 0)
    wg.addColorStop(0, 'rgba(255,255,255,1)')
    wg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = wg; ctx.fillRect(0, 0, w, ht)

    const bg = ctx.createLinearGradient(0, 0, 0, ht)
    bg.addColorStop(0, 'rgba(0,0,0,0)')
    bg.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, ht)
  }, [h])

  const readPos = useCallback((cx: number, cy: number): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return [
      clamp(Math.round(((cx - rect.left) / rect.width) * 100), 0, 100),
      clamp(Math.round((1 - (cy - rect.top) / rect.height) * 100), 0, 100),
    ]
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      const [ns, nv] = readPos(e.clientX, e.clientY)
      cbRef.current.onChange(ns, nv)
    }
    const onUp = (): void => {
      if (dragging.current) { dragging.current = false; cbRef.current.onCommit() }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [readPos])

  const handleBorder = v > 60 && s < 25 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.9)'

  return (
    <div style={{ position: 'relative', height: 152, flexShrink: 0 }}>
      <canvas
        ref={canvasRef} width={224} height={152}
        style={T.canvas}
        onMouseDown={e => {
          e.preventDefault(); dragging.current = true
          const [ns, nv] = readPos(e.clientX, e.clientY)
          cbRef.current.onChange(ns, nv)
        }}
      />
      <div style={{
        position: 'absolute',
        left: `${s}%`, top: `${100 - v}%`,
        transform: 'translate(-50%, -50%)',
        width: 13, height: 13, borderRadius: '50%',
        border: `2px solid ${handleBorder}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
      }}/>
    </div>
  )
}

// ── Hue slider ────────────────────────────────────────────────────────────────

function HueSlider({ h, onChange, onCommit }: {
  h: number; onChange: (h: number) => void; onCommit: () => void
}): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const cbRef    = useRef({ onChange, onCommit })
  cbRef.current  = { onChange, onCommit }

  const readH = useCallback((cx: number): number => {
    const rect = trackRef.current!.getBoundingClientRect()
    return Math.round(clamp(((cx - rect.left) / rect.width) * 360, 0, 360))
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => { if (dragging.current) cbRef.current.onChange(readH(e.clientX)) }
    const onUp   = (): void => { if (dragging.current) { dragging.current = false; cbRef.current.onCommit() } }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [readH])

  return (
    <div
      ref={trackRef}
      style={{
        position: 'relative', height: 12, borderRadius: 6, cursor: 'crosshair',
        background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
        userSelect: 'none',
      }}
      onMouseDown={e => { e.preventDefault(); dragging.current = true; cbRef.current.onChange(readH(e.clientX)) }}
    >
      <div style={{
        position: 'absolute',
        left: `calc(${(h / 360) * 100}% - 7px)`,
        top: '50%', transform: 'translateY(-50%)',
        width: 14, height: 14, borderRadius: '50%',
        border: '2.5px solid white',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.4)',
        background: `hsl(${h},100%,50%)`,
        pointerEvents: 'none',
      }}/>
    </div>
  )
}

// ── Popover ───────────────────────────────────────────────────────────────────

type InputMode = 'hex' | 'rgb'

function Popover({ value, onChange }: {
  value: string; onChange: (hex: string) => void
}): JSX.Element {
  const [[h, s, v], setHsv] = useState<[number,number,number]>(() => hexToHsv(value))
  const [mode, setMode]     = useState<InputMode>('hex')
  const [hexRaw, setHexRaw] = useState(value.replace('#','').toUpperCase())
  const [recent, setRecent] = useState<string[]>(getRecent)
  const currentHex          = hsvToHex(h, s, v)
  const [r, g, b]           = hsvToRgb(h, s, v)

  const update = useCallback((nh: number, ns: number, nv: number): void => {
    setHsv([nh, ns, nv])
    const hex = hsvToHex(nh, ns, nv)
    setHexRaw(hex.replace('#','').toUpperCase())
    onChange(hex)
  }, [onChange])

  const commit = useCallback((): void => {
    pushRecent(hsvToHex(h, s, v)); setRecent(getRecent())
  }, [h, s, v])

  const handleHexInput = (raw: string): void => {
    const cleaned = raw.toUpperCase().replace(/[^0-9A-F]/gi, '').slice(0, 6)
    setHexRaw(cleaned)
    const candidate = '#' + cleaned
    if (isValidHex(candidate)) {
      const [nh, ns, nv] = hexToHsv(candidate.toLowerCase())
      setHsv([nh, ns, nv]); onChange(candidate.toLowerCase())
    }
  }

  const handleRgbChange = (ch: 0|1|2, val: number): void => {
    const rgb: [number,number,number] = [r, g, b]
    rgb[ch] = clamp(val, 0, 255)
    const [nh, ns, nv] = rgbToHsv(...rgb)
    setHsv([nh, ns, nv])
    const hex = rgbToHex(...rgb)
    setHexRaw(hex.replace('#','').toUpperCase()); onChange(hex)
  }

  const modeActive   = { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '2px 6px', fontSize: 9, fontFamily: 'var(--font-mono)', cursor: 'pointer' }
  const modeInactive = { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent', borderRadius: 4, padding: '2px 6px', fontSize: 9, fontFamily: 'var(--font-mono)', cursor: 'pointer' }

  return (
    <div style={T.popover} onMouseDown={e => e.stopPropagation()}>
      {/* SV canvas */}
      <SvCanvas h={h} s={s} v={v} onChange={(ns,nv) => update(h, ns, nv)} onCommit={commit} />

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Hue slider */}
        <HueSlider h={h} onChange={nh => update(nh, s, v)} onCommit={commit} />

        {/* Preview + mode toggle + input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Live swatch */}
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--radius-sm)',
            background: currentHex,
            border: '1px solid var(--border-default)',
            flexShrink: 0,
          }}/>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-3)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
            {(['hex', 'rgb'] as InputMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={mode === m ? modeActive : modeInactive}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          {/* HEX input */}
          {mode === 'hex' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
              <span style={{ ...T.label, fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>#</span>
              <input
                value={hexRaw} maxLength={6} spellCheck={false}
                onChange={e => handleHexInput(e.target.value)}
                onBlur={commit}
                style={{ ...T.input, flex: 1, minWidth: 0, textTransform: 'uppercase' }}
              />
            </div>
          )}
        </div>

        {/* RGB inputs */}
        {mode === 'rgb' && (
          <div style={{ display: 'flex', gap: 6 }}>
            {(['R','G','B'] as const).map((lbl, i) => (
              <div key={lbl} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <input
                  type="number" min={0} max={255} value={[r,g,b][i]}
                  onChange={e => handleRgbChange(i as 0|1|2, parseInt(e.target.value) || 0)}
                  onBlur={commit}
                  style={{ ...T.input, width: '100%', textAlign: 'center',
                    MozAppearance: 'textfield' as 'textfield',
                  }}
                />
                <span style={{ ...T.label, display: 'block', textAlign: 'center' }}>{lbl}</span>
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        {recent.length > 0 && <div style={T.divider}/>}

        {/* Recent colors */}
        {recent.length > 0 && (
          <div>
            <div style={{ ...T.label, marginBottom: 6 }}>Recent</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {recent.map(c => (
                <button
                  key={c} title={c}
                  onClick={() => {
                    const [nh,ns,nv] = hexToHsv(c)
                    setHsv([nh,ns,nv])
                    setHexRaw(c.replace('#','').toUpperCase())
                    onChange(c); pushRecent(c); setRecent(getRecent())
                  }}
                  style={{
                    width: 18, height: 18, borderRadius: 4,
                    background: c, cursor: 'pointer',
                    border: c === currentHex
                      ? '2px solid var(--accent)'
                      : '1px solid var(--border-default)',
                    outline: 'none', transition: 'transform .1s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export interface ColorPickerProps {
  value:    string
  onChange: (hex: string) => void
  /**
   * compact  — shows only the color swatch (replaces small w-7 h-7 native inputs)
   * spectrum — shows a rainbow swatch + label (for toolbar "Custom" buttons)
   * default  — shows swatch + hex value
   */
  compact?:  boolean
  spectrum?: boolean
  label?:    string
  className?: string
  style?:     React.CSSProperties
}

export function ColorPicker({
  value, onChange, compact = false, spectrum = false, label, className, style,
}: ColorPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState({ top: 0, left: 0 })
  const triggerRef      = useRef<HTMLButtonElement>(null)
  const popoverRef      = useRef<HTMLDivElement>(null)

  const safeHex = isValidHex(value) ? value.toLowerCase() : '#ffffff'

  const openPicker = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect(); if (!rect) return
    const PW = 228, PH = 380
    let left = rect.left - PW - 10
    if (left < 8) left = rect.right + 10
    if (left + PW > window.innerWidth - 8) left = window.innerWidth - PW - 8
    let top = rect.top
    if (top + PH > window.innerHeight - 8) top = window.innerHeight - PH - 8
    if (top < 8) top = 8
    setPos({ top, left }); setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent): void => {
      if (!popoverRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node))
        setOpen(false)
    }
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  // ── Trigger rendering ─────────────────────────────────────────────────────

  const baseBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    cursor: 'pointer', background: 'none', border: 'none', padding: 0,
    ...style,
  }

  let trigger: React.ReactNode

  if (compact) {
    // Just the color swatch — same footprint as the old w-7 h-7 input
    trigger = (
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: safeHex,
        border: '1.5px solid var(--border-strong)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
        cursor: 'pointer', flexShrink: 0,
      }}/>
    )
  } else if (spectrum) {
    // Rainbow swatch + label — for toolbar "Custom color" buttons
    trigger = (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '5px 8px', borderRadius: 7,
        background: 'var(--surface-3)', border: '1px solid var(--border-subtle)',
        cursor: 'pointer',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
          border: '1px solid var(--border-subtle)',
        }}/>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
          {label ?? 'Custom'}
        </span>
      </div>
    )
  } else {
    // Default: swatch + hex value
    trigger = (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '4px 7px', borderRadius: 6,
        background: 'var(--surface-3)', border: '1px solid var(--border-subtle)',
        cursor: 'pointer', transition: 'border-color .15s',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)' }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: safeHex, border: '1px solid var(--border-default)',
        }}/>
        <span style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
          {safeHex.toUpperCase()}
        </span>
        {label && <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 2 }}>{label}</span>}
      </div>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openPicker()}
        className={className}
        style={baseBtn}
        type="button"
      >
        {trigger}
      </button>

      {open && createPortal(
        <div ref={popoverRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}>
          <Popover value={safeHex} onChange={onChange} />
        </div>,
        document.body
      )}
    </>
  )
}
