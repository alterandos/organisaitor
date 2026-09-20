import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LABELS } from '@/config/labels';
import { downloadBackup } from '@/utils/backupExport';
import styles from './ErrorBoundary.module.css';

interface Props {
  // 'app' wraps the whole tree (full-page fallback with Reload + Export backup);
  // 'section' wraps one section so a crash there leaves the nav and other sections working.
  scope:     'app' | 'section';
  section?:  string;
  children:  ReactNode;
}

interface State {
  error:          Error | null;
  componentStack: string;
  backupFailed:   boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '', backupFailed: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const componentStack = info.componentStack ?? '';
    this.setState({ componentStack });
    console.error(`[ErrorBoundary:${this.props.scope}] ${error.message}`, error, componentStack);
  }

  private exportBackup = () => {
    try {
      downloadBackup();
      this.setState({ backupFailed: false });
    } catch (err) {
      console.error('[ErrorBoundary] backup export failed:', err);
      this.setState({ backupFailed: true });
    }
  };

  private reset = () => this.setState({ error: null, componentStack: '', backupFailed: false });

  render() {
    const { error, componentStack, backupFailed } = this.state;
    if (!error) return this.props.children;

    const isApp = this.props.scope === 'app';
    const L = LABELS.errorBoundary;

    return (
      <div className={isApp ? styles.appFallback : styles.sectionFallback} role="alert">
        <div className={styles.card}>
          <h2 className={styles.title}>{isApp ? L.appTitle : L.sectionTitle(this.props.section ?? '')}</h2>
          <p className={styles.message}>{isApp ? L.appMessage : L.sectionMessage}</p>
          <div className={styles.actions}>
            {isApp ? (
              <button className={styles.primaryBtn} onClick={() => window.location.reload()}>{L.reload}</button>
            ) : (
              <button className={styles.primaryBtn} onClick={this.reset}>{L.reloadSection}</button>
            )}
            {isApp && <button className={styles.secondaryBtn} onClick={this.exportBackup}>{L.exportBackup}</button>}
          </div>
          {backupFailed && <p className={styles.error}>{L.backupFailed}</p>}
          <details className={styles.details}>
            <summary>{L.details}</summary>
            <pre className={styles.pre}>{error.message}{componentStack}</pre>
          </details>
        </div>
      </div>
    );
  }
}
