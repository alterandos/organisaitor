import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useNoteStore } from '@/store/noteStore';
import { NOTE_TAG_PRESETS } from '@/config/noteTagPresets';
import type { NoteTag } from '@/types/notes';
import styles from './NoteTagPresetModal.module.css';

export function NoteTagPresetModal() {
  const closeModal   = useUIStore((s) => s.closeModal);
  const noteTags     = useNoteStore((s) => s.noteTags);
  const addNoteTag   = useNoteStore((s) => s.addNoteTag);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  const installedPresetKeys = new Set(
    Object.values(noteTags as Record<string, NoteTag>)
      .filter((t) => t.presetKey)
      .map((t) => t.presetKey as string)
  );

  const handleInstall = (presetKey: string) => {
    const preset = NOTE_TAG_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    for (const tag of preset.tags) {
      addNoteTag({
        name: tag.name,
        kind: 'tag',
        icon: tag.icon,
        color: tag.color,
        fieldSchema: tag.fieldSchema,
        presetKey,
      });
    }
  };

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Tag Presets</span>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">×</button>
        </div>

        <p className={styles.subtitle}>
          Install curated annotation tag packs. Tags are added to your annotation tags and can be edited after installation.
        </p>

        <div className={styles.presetList}>
          {NOTE_TAG_PRESETS.map((preset) => {
            const installed = installedPresetKeys.has(preset.key);
            return (
              <div key={preset.key} className={styles.presetCard}>
                <div className={styles.presetCardTop}>
                  <div className={styles.presetMeta}>
                    <span className={styles.presetName}>{preset.name}</span>
                    <span className={styles.presetDesc}>{preset.description}</span>
                  </div>
                  <button
                    className={`${styles.installBtn} ${installed ? styles.installBtnDone : ''}`}
                    onClick={() => !installed && handleInstall(preset.key)}
                    disabled={installed}
                  >
                    {installed ? '✓ Installed' : 'Install'}
                  </button>
                </div>
                <div className={styles.tagChips}>
                  {preset.tags.map((tag) => (
                    <span
                      key={tag.name}
                      className={styles.tagChip}
                      style={{ borderColor: tag.color, color: tag.color }}
                      title={tag.fieldSchema.length > 0
                        ? `Fields: ${tag.fieldSchema.map((f) => f.name).join(', ')}`
                        : undefined}
                    >
                      {tag.icon} {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
