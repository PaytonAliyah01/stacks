import { useState } from 'react';
import type { BookNote } from '../types';
import { newId } from '../lib/storage';
import { formatDay } from '../lib/reading';

interface Props {
  bookId: string;
  pageCount?: number;
  /** This book's quotes and notes. */
  notes: BookNote[];
  onSave: (n: BookNote) => void;
  onRemove: (id: string) => void;
}

/** Writing or editing one quote or note. Not a <form>: it sits inside the book drawer's form. */
export function NoteEditor({ initial, bookId, pageCount, onSave, onCancel }: Readonly<{ initial?: BookNote; bookId: string; pageCount?: number; onSave: (n: BookNote) => void; onCancel?: () => void }>) {
  const [kind, setKind] = useState<BookNote['kind']>(initial?.kind ?? 'quote');
  const [text, setText] = useState(initial?.text ?? '');
  const [page, setPage] = useState(initial?.page ? String(initial.page) : '');
  const save = () => {
    if (!text.trim()) return;
    const now = new Date().toISOString();
    const p = Math.round(Number(page));
    onSave({
      id: initial?.id ?? newId(),
      bookId,
      kind,
      text: text.trim(),
      page: page.trim() && p > 0 ? p : undefined,
      favorite: initial?.favorite,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
    if (!initial) {
      setText('');
      setPage('');
    }
  };
  return (
    <div className="note-editor">
      <div className="status-pick" role="group" aria-label="Quote or note">
        {(['quote', 'note'] as const).map((k) => (
          <button key={k} type="button" className={`status-option mood-chip${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'quote' ? 'Quote' : 'My note'}
          </button>
        ))}
      </div>
      <textarea
        className="note-text"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          }
        }}
        placeholder={kind === 'quote' ? 'Type or paste a line you loved' : 'What you thought, a theme, a character to remember…'}
        aria-label={kind === 'quote' ? 'Quote' : 'Note'}
      />
      <div className="note-editor-foot">
        <input
          className="note-page"
          type="number"
          min={1}
          max={pageCount}
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="Page"
          aria-label="Page"
        />
        <button type="button" className="btn primary small-btn" onClick={save} disabled={!text.trim()}>
          {initial ? 'Save' : null}
          {!initial && (kind === 'quote') ? 'Save quote' : null}
          {!initial && !(kind === 'quote') ? 'Save note' : null}
        </button>
        {onCancel && <button type="button" className="btn ghost small-btn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

export function NoteCard({ note, onSave, onRemove, onEdit, children }: Readonly<{ note: BookNote; onSave: (n: BookNote) => void; onRemove: (id: string) => void; onEdit: () => void; children?: React.ReactNode }>) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <li className={`note-card ${note.kind}`}>
      {note.kind === 'quote' ? <blockquote>{note.text}</blockquote> : <p className="note-body">{note.text}</p>}
      <div className="note-meta">
        <span className="muted small">
          {note.kind === 'quote' ? 'Quote' : 'Note'}
          {note.page ? ` · p. ${note.page}` : ''} · {formatDay(note.createdAt.slice(0, 10))}
        </span>
        {children}
        <span className="note-tools">
          <button
            type="button"
            className={`icon-btn fav${note.favorite ? ' on' : ''}`}
            aria-pressed={!!note.favorite}
            aria-label={note.favorite ? 'Remove from favorites' : 'Add to favorites'}
            title="Favorite"
            onClick={() => onSave({ ...note, favorite: !note.favorite || undefined, updatedAt: new Date().toISOString() })}
          >
            {note.favorite ? '★' : '☆'}
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              navigator.clipboard
                ?.writeText(note.page ? `${note.text} (p. ${note.page})` : note.text)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
                .catch(() => undefined);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="link" onClick={onEdit}>Edit</button>
          {confirming ? (
            <>
              <button type="button" className="link danger-text" onClick={() => onRemove(note.id)}>Delete</button>
              <button type="button" className="link" onClick={() => setConfirming(false)}>Keep</button>
            </>
          ) : (
            <button type="button" className="link muted-link" onClick={() => setConfirming(true)}>Delete</button>
          )}
        </span>
      </div>
    </li>
  );
}

/** Quotes and notes for one book, in the book drawer. Saved right away. */
export function NotesPanel({ bookId, pageCount, notes, onSave, onRemove }: Readonly<Props>) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const sorted = [...notes].sort((a, b) => (a.page ?? 1e9) - (b.page ?? 1e9) || a.createdAt.localeCompare(b.createdAt));
  return (
    <div className="notes-panel">
      <div className="finished-head">
        <div className="mood-label">Quotes and notes{notes.length ? ` · ${notes.length}` : ''}</div>
        {!adding && <button type="button" className="btn ghost small-btn" onClick={() => setAdding(true)}>+ Add</button>}
      </div>
      {adding && <NoteEditor bookId={bookId} pageCount={pageCount} onSave={onSave} onCancel={() => setAdding(false)} />}
      {notes.length === 0 && !adding && <p className="muted small">Save lines you love and your own thoughts as you read.</p>}
      {sorted.length > 0 && (
        <ul className="note-list">
          {sorted.map((n) =>
            editing === n.id ? (
              <li key={n.id}>
                <NoteEditor
                  initial={n}
                  bookId={bookId}
                  pageCount={pageCount}
                  onSave={(x) => {
                    onSave(x);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <NoteCard key={n.id} note={n} onSave={onSave} onRemove={onRemove} onEdit={() => setEditing(n.id)} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}
