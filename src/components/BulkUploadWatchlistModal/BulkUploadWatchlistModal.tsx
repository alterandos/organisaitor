import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent, DragEvent, MouseEvent } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useUIStore } from '@/store/uiStore';
import { getBatchQuotes, fetchSector } from '@/integrations/tickerService';
import { todayIso } from '@/utils/date';
import type { PortfolioTagId, WatchlistStatus } from '@/types/portfolio';
import styles from './BulkUploadWatchlistModal.module.css';

// Map common exchange prefixes to Yahoo Finance ticker suffixes.
const EXCHANGE_SUFFIX: Record<string, string> = {
  ASX:    '.AX',  // Australian Securities Exchange
  LON:    '.L',   // London Stock Exchange
  LSE:    '.L',
  TSX:    '.TO',  // Toronto Stock Exchange
  TSE:    '.TO',
  TSXV:   '.V',   // TSX Venture Exchange
  CVE:    '.V',
  HKG:    '.HK',  // Hong Kong
  HKEX:   '.HK',
  FRA:    '.F',   // Frankfurt
  XETRA:  '.DE',
  TYO:    '.T',   // Tokyo
  SWX:    '.SW',  // Swiss Exchange
  BIT:    '.MI',  // Milan
  EPA:    '.PA',  // Paris
  AMS:    '.AS',  // Amsterdam
  MCE:    '.MC',  // Madrid
  OSL:    '.OL',  // Oslo
  STO:    '.ST',  // Stockholm
  CPH:    '.CO',  // Copenhagen
  HEL:    '.HE',  // Helsinki
  JSE:    '.JO',  // Johannesburg
  BSE:    '.BO',  // Bombay
  NSE:    '.NS',  // National Stock Exchange India
  SGX:    '.SI',  // Singapore
  NZX:    '.NZ',  // New Zealand
  WSE:    '.WA',  // Warsaw
  BVMF:   '.SA',  // Brazil (B3)
  SZSE:   '.SZ',  // Shenzhen
  SSE:    '.SS',  // Shanghai
  KRX:    '.KS',  // Korea Exchange
  KOSDAQ: '.KQ',
};

function parseLine(line: string): string | null {
  const t = line.trim().toUpperCase();
  if (!t || t.startsWith('#')) return null;
  const colon = t.indexOf(':');
  if (colon > 0) {
    const exchange = t.slice(0, colon);
    const symbol   = t.slice(colon + 1).trim();
    if (!symbol) return null;
    const suffix = EXCHANGE_SUFFIX[exchange] ?? '';
    return suffix ? `${symbol}${suffix}` : symbol;
  }
  return t;
}

export function BulkUploadWatchlistModal() {
  const closeModal       = useUIStore((s) => s.closeModal);
  const addWatchlistItem = usePortfolioStore((s) => s.addWatchlistItem);
  const watchlistItems   = usePortfolioStore((s) => s.watchlistItems);
  const portfolioTags    = usePortfolioStore((s) => s.portfolioTags);

  const [rawText,        setRawText]        = useState('');
  const [dragging,       setDragging]       = useState(false);
  const [phase,          setPhase]          = useState<'input' | 'loading' | 'done'>('input');
  const [result,         setResult]         = useState<{ added: number; skipped: number } | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<PortfolioTagId[]>([]);
  const [bulkStatus,     setBulkStatus]     = useState<WatchlistStatus>('watching');
  const [bulkHeldAt,     setBulkHeldAt]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const tags = Object.values(portfolioTags);
  const toggleTag = (id: PortfolioTagId) =>
    setSelectedTagIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  const existingTickers = new Set(
    Object.values(watchlistItems).map((i) => i.ticker?.toUpperCase()).filter(Boolean) as string[],
  );

  const parsed  = [...new Set(rawText.split('\n').map(parseLine).filter((s): s is string => !!s))];
  const newOnes = parsed.filter((t) => !existingTickers.has(t));
  const already = parsed.length - newOnes.length;

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setRawText((e.target?.result as string) ?? '');
    reader.readAsText(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const handleOverlay = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const handleSubmit = async () => {
    if (newOnes.length === 0) return;
    setPhase('loading');

    const [quotes, sectors] = await Promise.all([
      getBatchQuotes(newOnes),
      Promise.all(newOnes.map((t) => fetchSector(t))),
    ]);
    const quoteMap  = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));
    const today     = todayIso();

    for (let i = 0; i < newOnes.length; i++) {
      const ticker = newOnes[i];
      const q      = quoteMap.get(ticker.toUpperCase());
      addWatchlistItem({
        ticker,
        name:           q?.name           || ticker,
        assetClass:     q?.assetClass     ?? null,
        marketCapValue: q?.marketCapValue ?? null,
        exchange:       q?.exchange       || null,
        sector:         sectors[i]        ?? null,
        status:         bulkStatus,
        heldAt:         bulkStatus === 'holding' ? (bulkHeldAt.trim() || null) : null,
        tagIds:         selectedTagIds,
        dateAdded:      today,
      });
    }

    setResult({ added: newOnes.length, skipped: already });
    setPhase('done');
  };

  return (
    <div className={styles.overlay} onClick={handleOverlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Bulk Import Tickers</span>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        {phase !== 'done' ? (
          <>
            <p className={styles.hint}>
              One ticker per line. Prefix with exchange code for non-US stocks
              (e.g. <code>ASX:BHP</code>, <code>TSE:NEO</code>, <code>LON:SHEL</code>).
            </p>

            <div
              className={`${styles.dropZone} ${dragging ? styles.dropZoneDragging : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <span className={styles.dropIcon}>📄</span>
              <span className={styles.dropText}>Drop a .txt file here or click to browse</span>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,text/plain"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>

            <div className={styles.divider}><span>or paste below</span></div>

            <textarea
              className={styles.textarea}
              placeholder={'AAPL\nMSFT\nASX:BHP\nTSE:NEO'}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={8}
              autoFocus={!rawText}
            />

            {parsed.length > 0 && (
              <div className={styles.preview}>
                <span className={styles.previewCount}>
                  {parsed.length} ticker{parsed.length !== 1 ? 's' : ''} parsed
                  {already > 0 && <span className={styles.previewSkip}> · {already} already in watchlist</span>}
                </span>
                <div className={styles.previewList}>
                  {parsed.map((t) => (
                    <span
                      key={t}
                      className={`${styles.previewChip} ${existingTickers.has(t) ? styles.previewChipDupe : ''}`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.tagSection}>
              <span className={styles.tagLabel}>Portfolio status</span>
              <div className={styles.statusToggle}>
                <button
                  type="button"
                  className={`${styles.statusBtn} ${bulkStatus === 'watching' ? styles.statusBtnActive : ''}`}
                  onClick={() => setBulkStatus('watching')}
                >Watching</button>
                <button
                  type="button"
                  className={`${styles.statusBtn} ${bulkStatus === 'holding' ? styles.statusBtnActive : ''}`}
                  onClick={() => setBulkStatus('holding')}
                >Holding</button>
              </div>
              {bulkStatus === 'holding' && (
                <input
                  className={styles.heldAtInput}
                  placeholder="Broker / exchange (e.g. Fidelity, CHESS, Coinbase)"
                  value={bulkHeldAt}
                  onChange={(e) => setBulkHeldAt(e.target.value)}
                />
              )}
            </div>

            {tags.length > 0 && (
              <div className={styles.tagSection}>
                <span className={styles.tagLabel}>Apply tags to all imported tickers</span>
                <div className={styles.tagPillRow}>
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`${styles.tagPill} ${selectedTagIds.includes(tag.id) ? styles.tagPillActive : ''}`}
                      style={
                        selectedTagIds.includes(tag.id) && tag.color
                          ? { background: tag.color, borderColor: tag.color, color: '#fff' }
                          : tag.color
                            ? { borderColor: tag.color + '88', color: tag.color }
                            : undefined
                      }
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
              <button
                className={styles.submitBtn}
                disabled={newOnes.length === 0 || phase === 'loading'}
                onClick={handleSubmit}
              >
                {phase === 'loading' ? 'Adding…' : `Add ${newOnes.length} Ticker${newOnes.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.doneState}>
            <span className={styles.doneIcon}>✓</span>
            <p className={styles.doneTitle}>
              Added {result?.added} ticker{result?.added !== 1 ? 's' : ''}
            </p>
            {(result?.skipped ?? 0) > 0 && (
              <p className={styles.doneHint}>
                {result?.skipped} skipped (already in watchlist)
              </p>
            )}
            <p className={styles.doneHint}>
              Prices and names will load automatically.
            </p>
            <div className={styles.actions}>
              <button className={styles.submitBtn} onClick={closeModal}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
