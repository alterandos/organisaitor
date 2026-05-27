import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { getChartHistory } from '@/integrations/tickerService';
import type { WatchlistItem } from '@/types/portfolio';
import styles from './WatchlistView.module.css';

const RANGES = [
  { label: '1M', range: '1mo' as const, interval: '1d'  as const },
  { label: '6M', range: '6mo' as const, interval: '1d'  as const },
  { label: '1Y', range: '1y'  as const, interval: '1d'  as const },
  { label: '2Y', range: '2y'  as const, interval: '1wk' as const },
  { label: '5Y', range: '5y'  as const, interval: '1wk' as const },
];

interface Props {
  item:          WatchlistItem;
  price:         number | null;
  change:        number | null;
  changePercent: number | null;
  onClose:       () => void;
}

export function TickerChart({ item, price, change, changePercent, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [rangeIdx, setRangeIdx] = useState(2);
  const [status,   setStatus]   = useState<'loading' | 'error' | 'ok'>('loading');

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const style  = getComputedStyle(document.documentElement);
    const bg     = style.getPropertyValue('--color-surface').trim() || '#ffffff';
    const text   = style.getPropertyValue('--color-text').trim()    || '#111111';
    const border = style.getPropertyValue('--color-border').trim()  || '#e5e7eb';

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: bg }, textColor: text },
      grid:   { vertLines: { color: border }, horzLines: { color: border } },
      timeScale:       { borderColor: border },
      rightPriceScale: { borderColor: border },
    });
    chartRef.current  = chart;
    seriesRef.current = chart.addSeries(CandlestickSeries);

    return () => {
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []);

  // Load / reload data when ticker or range changes
  useEffect(() => {
    if (!item.ticker) { setStatus('error'); return; }
    if (!seriesRef.current || !chartRef.current) return;

    const { range, interval } = RANGES[rangeIdx];
    setStatus('loading');
    let cancelled = false;

    getChartHistory(item.ticker, range, interval).then((bars) => {
      if (cancelled || !seriesRef.current || !chartRef.current) return;
      if (bars.length === 0) { setStatus('error'); return; }
      seriesRef.current.setData(bars);
      chartRef.current.timeScale().fitContent();
      setStatus('ok');
    });

    return () => { cancelled = true; };
  }, [item.ticker, rangeIdx]);

  const isPos = (changePercent ?? 0) >= 0;

  function formatPrice(p: number) {
    return p >= 1
      ? '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '$' + p.toFixed(4);
  }

  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div className={styles.chartMeta}>
          <span className={styles.chartTicker}>{item.ticker ?? item.name}</span>
          <span className={styles.chartName}>{item.name}</span>
          {price != null && <span className={styles.chartPrice}>{formatPrice(price)}</span>}
          {change != null && changePercent != null && (
            <span className={isPos ? styles.changePos : styles.changeNeg}>
              {isPos ? '+' : ''}{change.toFixed(2)} ({isPos ? '+' : ''}{changePercent.toFixed(2)}%)
            </span>
          )}
        </div>
        <div className={styles.chartControls}>
          <div className={styles.rangeBar}>
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                className={`${styles.rangeBtn} ${i === rangeIdx ? styles.rangeBtnActive : ''}`}
                onClick={() => setRangeIdx(i)}
              >{r.label}</button>
            ))}
          </div>
          <button className={styles.chartCloseBtn} onClick={onClose} aria-label="Close chart">✕</button>
        </div>
      </div>

      <div className={styles.chartBody}>
        {status === 'loading' && <div className={styles.chartOverlay}>Loading…</div>}
        {status === 'error'   && <div className={styles.chartOverlay}>No chart data available</div>}
        <div ref={containerRef} className={styles.chartContainer} />
      </div>
    </div>
  );
}
