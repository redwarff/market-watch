'use client';

import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { CandleBar } from '@/lib/types';

export function PriceChart({ bars, range }: { bars: CandleBar[]; range: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const chart: IChartApi = createChart(element, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#93a0b0',
        fontFamily: 'IBM Plex Sans, Segoe UI, sans-serif',
      },
      grid: {
        vertLines: { color: '#222833' },
        horzLines: { color: '#222833' },
      },
      rightPriceScale: { borderColor: '#2c3440' },
      timeScale: {
        borderColor: '#2c3440',
        timeVisible: range === '1d' || range === '5d',
        secondsVisible: false,
      },
      crosshair: { vertLine: { color: '#4b5666' }, horzLine: { color: '#4b5666' } },
    });
    const candles: ISeriesApi<'Candlestick'> = chart.addCandlestickSeries({
      upColor: '#3ecf8e',
      downColor: '#ff6b6b',
      borderUpColor: '#3ecf8e',
      borderDownColor: '#ff6b6b',
      wickUpColor: '#3ecf8e',
      wickDownColor: '#ff6b6b',
    });
    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });

    const unique = new Map<number, CandleBar>();
    for (const bar of [...bars].sort((a, b) => a.time - b.time)) unique.set(bar.time, bar);
    const data = [...unique.values()];
    candles.setData(
      data.map((bar) => ({
        time: bar.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );
    volume.setData(
      data.map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.volume,
        color: bar.close >= bar.open ? 'rgba(62, 207, 142, 0.4)' : 'rgba(255, 107, 107, 0.4)',
      })),
    );
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars, range]);

  return <div ref={ref} className="chart-box" />;
}
