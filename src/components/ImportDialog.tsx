import { useEffect, useState } from 'react';
import type { Book, BookFormat, BookNote, Reading } from '../types';
import { parseHistory, planImport, type ImportPlan, type ImportSource } from '../lib/importHistory';

interface Props {
  books: Book[];
  readings: Reading[];
  notes?: BookNote[];
  defaultFormat: BookFormat;
  onImport: (plan: ImportPlan) => Promise<void>;
  onClose: () => void;
}

const APP_NAME: Record<ImportSource, string> = { goodreads: 'Goodreads', storygraph: 'The StoryGraph' };

export function ImportDialog({ books, readings, notes = [], defaultFormat, onImport, onClose }: Readonly<Props>) {
  const [plan, setPlan] = useState<{ source: ImportSource; plan: ImportPlan; rows: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const read = async (file: File) => {
    setError('');
    setPlan(null);
    try {
      const { source, rows } = parseHistory(await file.text());
      setPlan({ source, rows: rows.length, plan: planImport(rows, source, books, readings, defaultFormat, notes) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  const p = plan?.plan;
  const count = (s: Reading['status']) => p?.readings.filter((r) => r.status === s).length ?? 0;
  const notOwned = p?.newBooks.filter((b) => b.owned === false).length ?? 0;

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer narrow" role="dialog" aria-modal="true" aria-label="Import reading history">
        <div className="drawer-form">
          <header className="drawer-head">
            <h2 className="drawer-heading">Import reading history</h2>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
          </header>
          <p className="hint">Bring in your shelves, read dates, ratings and reviews from another app. Books you already have in Stacks are matched, not added twice.</p>

          <h3 className="section-label">1. Get your export</h3>
          <div className="import-apps">
            <div>
              <strong>Goodreads</strong>
              <p>
                On the website, go to <b>My Books</b>, then <b>Import and export</b> in the left column, and press <b>Export Library</b>.
                When the link appears, download the .csv file.{' '}
                <a href="https://www.goodreads.com/review/import" target="_blank" rel="noreferrer">Open the export page</a>
              </p>
            </div>
            <div>
              <strong>The StoryGraph</strong>
              <p>
                Open your profile menu, choose <b>Manage Account</b>, scroll to <b>Manage Your Data</b> and press <b>Export StoryGraph Library</b>.
                Download the .csv when it's ready.{' '}
                <a href="https://app.thestorygraph.com/user-export" target="_blank" rel="noreferrer">Open the export page</a>
              </p>
            </div>
            <p className="muted small">
              Other apps, like Fable or Bookly, can often export in the Goodreads format, or move your books to Goodreads or StoryGraph first.
            </p>
          </div>

          <h3 className="section-label">2. Choose the file</h3>
          <input id="import-history-file" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
          {error && <p className="form-error">{error}</p>}

          {plan && p && (
            <div className="import-summary">
              <p>
                Found <b>{plan.rows.toLocaleString()}</b> books from {APP_NAME[plan.source]}.
              </p>
              <ul>
                <li><b>{p.newBooks.length}</b> new to Stacks{notOwned > 0 && <>, of which {notOwned} you don't own (kept with your reading, off your shelves)</>}</li>
                <li><b>{p.matched}</b> already in Stacks, so their history is added to them</li>
                <li><b>{count('read')}</b> reads finished, <b>{count('reading')}</b> in progress, <b>{count('want')}</b> want to read, <b>{count('dnf')}</b> not finished</li>
                {p.notes.length > 0 && <li><b>{p.notes.length}</b> private note{p.notes.length === 1 ? '' : 's'}, saved under Quotes and notes</li>}
                {p.removedReadings.length > 0 && <li><b>{p.removedReadings.length}</b> book{p.removedReadings.length === 1 ? '' : 's'} you'd marked “Want to read” in Stacks will show as read (or reading)</li>}
                {p.merges.length > 0 && <li><b>{p.merges.length}</b> book{p.merges.length === 1 ? '' : 's'} added by an earlier import will be joined with the copy you own under another edition's title</li>}
                {p.skippedReads > 0 && <li>{p.skippedReads} reads skipped because they're already logged</li>}
              </ul>
            </div>
          )}

          <footer className="drawer-foot">
            <button
              className="btn primary"
              type="button"
              disabled={!p || busy || (p.newBooks.length + p.readings.length + p.updatedBooks.length + p.notes.length + p.removedReadings.length + p.merges.length === 0)}
              onClick={async () => {
                if (!p) return;
                setBusy(true);
                await onImport(p);
                setBusy(false);
              }}
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
            <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          </footer>
        </div>
      </aside>
    </div>
  );
}
