import styles from './SettingsPane.module.css';

// The switch and row every Settings section uses.
export function Toggle({
  on, onToggle, label,
}: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <span className={styles.toggleThumb} />
    </button>
  );
}

export function SettingRow({
  name, desc, children,
}: { name: string; desc: string; children: React.ReactNode }) {
  return (
    <div className={styles.setting}>
      <div className={styles.settingInfo}>
        <span className={styles.settingName}>{name}</span>
        <span className={styles.settingDesc}>{desc}</span>
      </div>
      {children}
    </div>
  );
}
