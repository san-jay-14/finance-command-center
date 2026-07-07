import { CandlestickSeries, ColorType, createChart, type IChartApi } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { VizProps } from '../lib/types'

type CandleRow = {
  candle_date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

// lightweight-charts (TradingView's library) renders real OHLC candles on
// canvas — proper wicks and up/down coloring out of the box, unlike composing
// one from recharts primitives which has no native candlestick semantics.
export function CandlestickChart({ data }: VizProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const symbol = typeof data.symbol === 'string' ? data.symbol : ''
  const candles = (Array.isArray(data.candles) ? data.candles : []) as CandleRow[]

  useEffect(() => {
    const container = containerRef.current
    if (!container || candles.length === 0) return

    // container.clientWidth can read 0 here — the flex layout isn't always
    // settled the instant this effect runs (the same class of bug as
    // recharts' ResponsiveContainer needing a moment to measure). A
    // ResizeObserver catches the real size once layout actually completes,
    // where a window-resize listener alone would miss it entirely.
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: '#1c1a26' }, textColor: '#a9a6bc' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
      width: container.clientWidth || 600,
      height: 320,
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
    })
    chartRef.current = chart

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#f87171',
      borderVisible: false,
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
    })
    series.setData(
      [...candles]
        .sort((a, b) => a.candle_date.localeCompare(b.candle_date))
        .map((c) => ({ time: c.candle_date, open: c.open, high: c.high, low: c.low, close: c.close })),
    )
    chart.timeScale().fitContent()

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      // resize() is the library's documented API for this (not
      // applyOptions({width}), which only updates layout options).
      if (width) chart.resize(width, 320, true)
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [candles])

  if (candles.length === 0) {
    return <div className="p-6 text-sm text-ink-faint">No price history to show.</div>
  }

  const first = candles[0]
  const last = candles[candles.length - 1]
  const pctChange = ((last.close - first.close) / first.close) * 100
  const isUp = pctChange >= 0

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-ink">{symbol}</div>
        <div className={`text-sm font-semibold ${isUp ? 'gain-text' : 'loss-text'}`}>
          {isUp ? '+' : ''}
          {pctChange.toFixed(1)}%
        </div>
      </div>
      <div ref={containerRef} className="h-80 w-full" />
    </div>
  )
}
