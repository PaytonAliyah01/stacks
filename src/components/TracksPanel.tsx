import { useEffect, useRef, useState } from 'react';
import type { Book, Track } from '../types';
import { fetchTrackList } from '../lib/lookup';
import { clock, groupTracks, keepFavorites, parseTrackText, totalSeconds, trackText } from '../lib/tracks';

interface Props {
  draft: Book;
  /** Saves straight away (stars and looked-up lists shouldn't wait for the Save button). */
  onSave: (patch: Partial<Book>) => void;
}

/** A record's track list with favorite stars. Not a <form>: it sits inside the drawer's form. */
export function TracksPanel({ draft, onSave }: Readonly<Props>) {
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const tried = useRef(false);
  const tracks = draft.tracks ?? [];

  const lookUp = async (auto = false) => {
    setLoading(true);
    setMsg('');
    try {
      const found = await fetchTrackList(draft);
      if (found?.length) {
        onSave({ tracks: keepFavorites(found, draft.tracks), tracksChecked: true, trackCount: draft.trackCount ?? found.length });
      } else {
        onSave({ tracksChecked: true });
        setMsg(auto ? '' : "Couldn't find a track list. You can type or paste one with Edit.");
      }
    } catch {
      if (!auto) setMsg("Couldn't reach the music databases. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tried.current || tracks.length || draft.tracksChecked || !draft.title) return;
    tried.current = true;
    void lookUp(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  const toggle = (i: number) => onSave({ tracks: tracks.map((t, j) => (j === i ? { ...t, favorite: !t.favorite || undefined } : t)) });
  const groups = groupTracks(tracks);
  const total = totalSeconds(tracks);
  const favs = tracks.filter((t) => t.favorite).length;

  return (
    <section className="panel tracks-panel" aria-label="Tracks">
      <div className="spins-head">
        <div>
          <h3>Tracks</h3>
          <p className="muted small">
            {loading ? 'Looking up the track list…' : null}
            {!loading && tracks.length ? [`${tracks.length} tracks`, total && clock(total), favs && `${favs} favorite${favs === 1 ? '' : 's'}`].filter(Boolean).join(' · ') : null}
            {!loading && !tracks.length ? 'No track list yet.' : null}
          </p>
        </div>
        {editing === null && (
          <div className="tracks-actions">
            <button type="button" className="btn ghost small-btn" onClick={() => setEditing(trackText(tracks))}>{tracks.length ? 'Edit' : 'Type them in'}</button>
            <button type="button" className="btn ghost small-btn" disabled={loading} onClick={() => lookUp()}>{tracks.length ? 'Look up again' : 'Look up'}</button>
          </div>
        )}
      </div>
      {msg && <p className="small muted">{msg}</p>}

      {editing !== null ? (
        <div className="tracks-edit">
          <textarea
            id="f-tracks"
            rows={Math.min(18, Math.max(6, editing.split('\n').length + 1))}
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            placeholder={'One track per line, for example:\nA1 Second Hand News 2:56\nA2 Dreams 4:14\nB1 Go Your Own Way 3:38'}
          />
          <div className="tracks-actions">
            <button
              type="button"
              className="btn primary small-btn"
              onClick={() => {
                const next = keepFavorites(parseTrackText(editing), tracks);
                onSave({ tracks: next, tracksChecked: true, trackCount: next.length || draft.trackCount });
                setEditing(null);
              }}
            >
              Save tracks
            </button>
            <button type="button" className="link small" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        groups.map((g) => (
          <div key={`${g.label}|${g.tracks[0]?.i}`} className="track-group">
            {g.label && (
              <div className="track-side">
                <span>{g.label}</span>
                {g.seconds > 0 && <span className="muted">{clock(g.seconds)}</span>}
              </div>
            )}
            <ol className="track-list">
              {g.tracks.map(({ t, i }) => (
                <TrackRow key={`${t.position ?? ''}|${t.title}`} t={t} onStar={() => toggle(i)} />
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}

function TrackRow({ t, onStar }: Readonly<{ t: Track; onStar: () => void }>) {
  return (
    <li className={t.favorite ? 'is-fav' : ''}>
      <span className="track-pos">{t.position}</span>
      <span className="track-title">
        {t.title}
        {t.artist && <span className="muted small"> · {t.artist}</span>}
      </span>
      <span className="track-time muted">{t.duration}</span>
      <button type="button" className="track-star" onClick={onStar} aria-pressed={!!t.favorite} aria-label={t.favorite ? `Unstar ${t.title}` : `Star ${t.title} as a favorite`} title={t.favorite ? 'Favorite' : 'Mark as favorite'}>
        {t.favorite ? '★' : '☆'}
      </button>
    </li>
  );
}
