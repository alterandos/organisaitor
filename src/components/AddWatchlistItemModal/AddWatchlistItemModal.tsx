import { useState, useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useUIStore } from '@/store/uiStore';
import { todayIso } from '@/utils/date';
import type { AssetClass, WatchlistStatus, InvestmentPurposeId, PortfolioTagId, WatchlistItemId } from '@/types/portfolio';
import { useTickerLookup } from '@/integrations/useTickerLookup';
import type { TickerMatch } from '@/integrations/types';
import styles from './AddWatchlistItemModal.module.css';

export function AddWatchlistItemModal() {
  const editingWatchlistItemId = useUIStore((s) => s.editingWatchlistItemId);
  const watchlistItems         = usePortfolioStore((s) => s.watchlistItems);
  const editItem = editingWatchlistItemId
    ? watchlistItems[editingWatchlistItemId as WatchlistItemId]
    : null;

  const [ticker,         setTicker]         = useState(editItem?.ticker ?? '');
  const [name,           setName]           = useState(editItem?.name ?? '');
  const [assetClass,     setAssetClass]     = useState<AssetClass | null>(editItem?.assetClass ?? null);
  const [sector,         setSector]         = useState<string | null>(editItem?.sector ?? null);
  const [exchange,       setExchange]       = useState<string | null>(editItem?.exchange ?? null);
  const [marketCapValue, setMarketCapValue] = useState<number | null>(editItem?.marketCapValue ?? null);
  const [status,         setStatus]         = useState<WatchlistStatus>(editItem?.status ?? 'watching');
  const [heldAt,         setHeldAt]         = useState(editItem?.heldAt ?? '');
  const [dateAdded,      setDateAdded]      = useState(editItem?.dateAdded ?? todayIso());
  const [notes,          setNotes]          = useState(editItem?.notes ?? '');
  const [purposeIds,     setPurposeIds]     = useState<InvestmentPurposeId[]>(editItem?.investmentPurposeIds ?? []);
  const [tagIds,         setTagIds]         = useState<PortfolioTagId[]>(editItem?.tagIds ?? []);
  const [links,          setLinks]          = useState<string[]>(editItem?.links ?? []);
  const [linkInput,      setLinkInput]      = useState('');

  const addWatchlistItem    = usePortfolioStore((s) => s.addWatchlistItem);
  const updateWatchlistItem = usePortfolioStore((s) => s.updateWatchlistItem);
  const investmentPurposes  = usePortfolioStore((s) => s.investmentPurposes);
  const portfolioTags       = usePortfolioStore((s) => s.portfolioTags);
  const closeModal          = useUIStore((s) => s.closeModal);

  const { status: lookupStatus, candidates, autoFill, onTickerBlur, selectCandidate, clearLookup } = useTickerLookup();
  const nameAutoFilledRef = useRef(false);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  useEffect(() => {
    if (!autoFill) return;
    if (!name || nameAutoFilledRef.current) {
      setName(autoFill.name);
      nameAutoFilledRef.current = true;
    }
    if (autoFill.marketCapValue !== null) setMarketCapValue(autoFill.marketCapValue);
    if (autoFill.assetClass)             setAssetClass(autoFill.assetClass);
    if (autoFill.sector)                 setSector(autoFill.sector);
    if (autoFill.exchange)               setExchange(autoFill.exchange);
  }, [autoFill]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTickerChange = (val: string) => {
    setTicker(val);
    clearLookup();
    nameAutoFilledRef.current = false;
    setMarketCapValue(null);
    setAssetClass(null);
    setSector(null);
    setExchange(null);
  };

  const handleCandidateSelect = (match: TickerMatch) => {
    setTicker(match.ticker);
    selectCandidate(match);
  };

  const addLink = () => {
    const url = linkInput.trim();
    if (!url || links.includes(url)) return;
    setLinks((prev) => [...prev, url]);
    setLinkInput('');
  };

  const handleLinkKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addLink(); }
  };

  const removeLink = (url: string) =>
    setLinks((prev) => prev.filter((l) => l !== url));

  const togglePurpose = (id: InvestmentPurposeId) =>
    setPurposeIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);

  const toggleTag = (id: PortfolioTagId) =>
    setTagIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      ticker:               ticker.trim() || null,
      name:                 name.trim(),
      assetClass,
      sector,
      exchange,
      marketCapValue,
      status,
      heldAt:               status === 'holding' ? (heldAt.trim() || null) : null,
      investmentPurposeIds: purposeIds,
      tagIds,
      links,
      notes:                notes.trim() || null,
      dateAdded,
    };
    if (editItem) {
      updateWatchlistItem(editItem.id, payload);
    } else {
      addWatchlistItem(payload);
    }
    closeModal();
  };

  const handleOverlay = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const purposes = Object.values(investmentPurposes);
  const tags     = Object.values(portfolioTags);
  const isEdit   = !!editItem;

  return (
    <div className={styles.overlay} onClick={handleOverlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>{isEdit ? 'Edit Ticker' : 'Add Ticker'}</span>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field} style={{ flex: '0 0 110px', position: 'relative' }}>
              <label className={styles.fieldLabel} htmlFor="wl-ticker">Ticker</label>
              <input
                id="wl-ticker"
                className={`${styles.input} ${styles.inputMono} ${lookupStatus === 'error' ? styles.inputError : ''}`}
                placeholder="AAPL"
                value={ticker}
                onChange={(e) => handleTickerChange(e.target.value.toUpperCase())}
                onBlur={(e) => onTickerBlur(e.target.value)}
                maxLength={12}
                autoFocus
              />
              {lookupStatus === 'loading' && (
                <span className={styles.tickerLoading}>⋯</span>
              )}
              {lookupStatus === 'results' && candidates.length > 0 && (
                <div className={styles.candidateDropdown} role="listbox">
                  {candidates.map((c) => (
                    <button
                      key={`${c.ticker}-${c.exchange}`}
                      type="button"
                      className={styles.candidateBtn}
                      onMouseDown={(e) => { e.preventDefault(); handleCandidateSelect(c); }}
                      role="option"
                    >
                      <span className={styles.candidateTicker}>{c.ticker}</span>
                      <span className={styles.candidateName}>{c.name}</span>
                      <span className={styles.candidateExchange}>{c.exchange}</span>
                    </button>
                  ))}
                </div>
              )}
              {lookupStatus === 'error' && ticker && (
                <span className={styles.tickerError}>Not found</span>
              )}
            </div>
            <div className={`${styles.field} ${styles.fieldGrow}`}>
              <label className={styles.fieldLabel} htmlFor="wl-name">
                Company / Asset Name <span className={styles.required}>*</span>
              </label>
              <input
                id="wl-name"
                className={styles.input}
                placeholder="Apple Inc."
                value={name}
                onChange={(e) => { setName(e.target.value); nameAutoFilledRef.current = false; }}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Portfolio Status</label>
            <div className={styles.statusToggle}>
              <button
                type="button"
                className={`${styles.statusBtn} ${status === 'watching' ? styles.statusBtnActive : ''}`}
                onClick={() => setStatus('watching')}
              >Watching</button>
              <button
                type="button"
                className={`${styles.statusBtn} ${status === 'holding' ? styles.statusBtnActive : ''}`}
                onClick={() => setStatus('holding')}
              >Holding</button>
            </div>
            {status === 'holding' && (
              <input
                className={`${styles.input} ${styles.heldAtInput}`}
                placeholder="Broker / exchange (e.g. Fidelity, CHESS, Coinbase)"
                value={heldAt}
                onChange={(e) => setHeldAt(e.target.value)}
              />
            )}
          </div>

          {purposes.length > 0 && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Investment Purpose</label>
              <div className={styles.pillRow}>
                {purposes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.selPill} ${purposeIds.includes(p.id) ? styles.selPillActive : ''}`}
                    style={
                      purposeIds.includes(p.id) && p.color
                        ? { background: p.color, borderColor: p.color, color: '#fff' }
                        : p.color
                          ? { borderColor: p.color + '88', color: p.color }
                          : undefined
                    }
                    onClick={() => togglePurpose(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Tags</label>
            {tags.length === 0
              ? <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>No tags yet — create tags in the sidebar.</span>
              : <div className={styles.pillRow}>
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`${styles.selPill} ${tagIds.includes(tag.id) ? styles.selPillActive : ''}`}
                      style={
                        tagIds.includes(tag.id) && tag.color
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
                </div>}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Links</label>
            <div className={styles.linkInputRow}>
              <input
                className={styles.input}
                placeholder="https://…"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={handleLinkKeyDown}
              />
              <button
                type="button"
                className={styles.addLinkBtn}
                onClick={addLink}
                disabled={!linkInput.trim()}
              >
                Add
              </button>
            </div>
            {links.length > 0 && (
              <ul className={styles.linkList}>
                {links.map((url) => (
                  <li key={url} className={styles.linkItem}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.linkUrl}
                    >
                      {url}
                    </a>
                    <button
                      type="button"
                      className={styles.linkRemoveBtn}
                      onClick={() => removeLink(url)}
                      aria-label="Remove link"
                    >✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.row}>
            <div className={`${styles.field} ${styles.fieldGrow}`}>
              <label className={styles.fieldLabel} htmlFor="wl-date">Date Added</label>
              <input
                id="wl-date"
                type="date"
                className={styles.input}
                value={dateAdded}
                onChange={(e) => setDateAdded(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="wl-notes">Notes</label>
            <textarea
              id="wl-notes"
              className={styles.textarea}
              placeholder="Investment thesis, research notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={!name.trim()}>
              {isEdit ? 'Save Changes' : 'Add Ticker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
