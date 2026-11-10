import { useState } from 'react';
import type { Book } from '../types';
import { COLOR_SUGGESTIONS, GRADE_HELP, MEDIA_GRADES, SLEEVE_GRADES, discBackground } from '../lib/pressing';
import { discogsIdFrom, fetchDiscogsRelease, getDiscogsToken, searchPressings, type PressingHit } from '../lib/lookup';
import { discogsReleaseUrl } from '../lib/value';

interface Props {
  draft: Book;
  onChange: (patch: Partial<Book>) => void;
}

/** Which pressing you own and what state it's in. Not a <form>: it sits inside the drawer's form. */
export function PressingPanel({ draft, onChange }: Readonly<Props>) {
  const vinyl = draft.kind === 'vinyl';
  const [finding, setFinding] = useState(false);
  const [hits, setHits] = useState<PressingHit[] | null>(null);
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const token = !!getDiscogsToken();
  const disc = vinyl ? discBackground(draft.vinylColor) : undefined;

  const pick = async (id: number) => {
    setBusy(true);
    setMsg('');
    try {
      const r = await fetchDiscogsRelease(id);
      // You chose this pressing, so its details replace what was guessed before.
      onChange({
        discogsId: id,
        kind: r.kind ?? draft.kind,
        vinylSize: r.kind === 'vinyl' ? r.vinylSize ?? draft.vinylSize ?? 12 : r.kind === 'cd' ? undefined : draft.vinylSize,
        discCount: r.discCount ?? draft.discCount,
        vinylColor: r.vinylColor,
        edition: r.edition,
        pressingCountry: r.pressingCountry,
        matrix: r.matrix,
        catalogNumber: r.catalogNumber,
        publisher: r.publisher ?? draft.publisher,
        publishedDate: r.publishedDate ?? draft.publishedDate,
        trackCount: r.trackCount ?? draft.trackCount,
        coverUrl: draft.coverUrl ?? r.coverUrl,
        barcode: draft.barcode ?? r.barcode,
        market: undefined,
        pressingChecked: true,
        discogsChecked: true,
      });
      setHits(null);
      setFinding(false);
      setLink('');
      setMsg('Pressing details filled in from Discogs. Press Save to keep them.');
    } catch {
      setMsg("Couldn't load that release from Discogs. Check the link, or try again later.");
    } finally {
      setBusy(false);
    }
  };

  const search = async (by: 'barcode' | 'title') => {
    setBusy(true);
    setMsg('');
    try {
      const found = await searchPressings(by === 'barcode' ? { barcode: draft.barcode } : { artist: draft.authors[0], title: draft.title });
      setHits(found);
      if (!found.length) setMsg(by === 'barcode' ? 'Discogs has no release with this barcode. Try searching by title.' : 'Nothing found on Discogs.');
    } catch {
      setMsg("Couldn't reach Discogs.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel pressing-panel" aria-label="Pressing and condition">
      <div className="spins-head">
        <div>
          <h3>Pressing and condition</h3>
          <p className="muted small">
            {draft.discogsId ? (
              <>
                Discogs release {draft.discogsId} ·{' '}
                <a href={discogsReleaseUrl(draft.discogsId)} target="_blank" rel="noreferrer">Open on Discogs</a>
              </>
            ) : (
              'Not linked to a Discogs release yet.'
            )}
          </p>
        </div>
        {disc && <span className="pressing-disc" style={{ background: disc }} aria-hidden="true" />}
        <button type="button" className="btn ghost small-btn" onClick={() => setFinding(!finding)}>
          {draft.discogsId ? 'Change pressing' : 'Find my pressing'}
        </button>
      </div>

      {finding && (
        <div className="pressing-find">
          {token ? (
            <div className="pressing-find-buttons">
              {draft.barcode && (
                <button type="button" className="btn ghost small-btn" disabled={busy} onClick={() => search('barcode')}>Search by barcode</button>
              )}
              <button type="button" className="btn ghost small-btn" disabled={busy || !draft.title} onClick={() => search('title')}>Search by artist and title</button>
            </div>
          ) : (
            <p className="muted small">Add your Discogs token under More → Lookup keys to search Discogs from here, or paste the link of the release page:</p>
          )}
          <div className="pressing-link">
            <input
              id="f-discogs-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.discogs.com/release/1873013-…"
              aria-label="Discogs release link"
            />
            <button type="button" className="btn ghost small-btn" disabled={busy || !discogsIdFrom(link)} onClick={() => pick(discogsIdFrom(link)!)}>Use this release</button>
          </div>
          {hits && hits.length > 0 && (
            <ul className="pressing-hits">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="pressing-hit" disabled={busy} onClick={() => pick(h.id)}>
                    {h.thumb ? <img src={h.thumb} alt="" /> : <span className="pressing-hit-blank" />}
                    <span>
                      <strong>{h.title}</strong>
                      <span className="muted small">{[h.format, h.country, h.year, h.label, h.catno].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {msg && <p className="small muted">{msg}</p>}

      <div className="grid-2">
        {vinyl && (
          <label className="field">
            <span>Vinyl color</span>
            <input id="f-color" list="vinyl-colors" value={draft.vinylColor ?? ''} placeholder="Black" onChange={(e) => onChange({ vinylColor: e.target.value || undefined })} />
            <datalist id="vinyl-colors">{COLOR_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        )}
        <label className="field">
          <span>Edition</span>
          <input id="f-edition" value={draft.edition ?? ''} placeholder="Limited, 180 gram, Record Store Day" onChange={(e) => onChange({ edition: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>Catalog number</span>
          <input id="f-catno" value={draft.catalogNumber ?? ''} onChange={(e) => onChange({ catalogNumber: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>Country</span>
          <input id="f-country" value={draft.pressingCountry ?? ''} placeholder="UK, US, Europe…" onChange={(e) => onChange({ pressingCountry: e.target.value || undefined })} />
        </label>
        {vinyl && (
          <label className="field span-2">
            <span>Matrix / runout</span>
            <input id="f-matrix" value={draft.matrix ?? ''} placeholder="What's etched in the run-out groove" onChange={(e) => onChange({ matrix: e.target.value || undefined })} />
          </label>
        )}
        <label className="field">
          <span>{vinyl ? 'Record' : 'Disc'} condition</span>
          <select id="f-media-grade" value={draft.mediaCondition ?? ''} onChange={(e) => onChange({ mediaCondition: e.target.value || undefined, market: draft.market && { ...draft.market, checkedAt: new Date(0).toISOString() } })}>
            <option value="">Not graded</option>
            {MEDIA_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            {draft.mediaCondition && !MEDIA_GRADES.includes(draft.mediaCondition) && <option value={draft.mediaCondition}>{draft.mediaCondition}</option>}
          </select>
          {draft.mediaCondition && GRADE_HELP[draft.mediaCondition] && <small className="muted">{GRADE_HELP[draft.mediaCondition]}</small>}
        </label>
        <label className="field">
          <span>{vinyl ? 'Sleeve' : 'Case and booklet'} condition</span>
          <select id="f-sleeve-grade" value={draft.sleeveCondition ?? ''} onChange={(e) => onChange({ sleeveCondition: e.target.value || undefined })}>
            <option value="">Not graded</option>
            {SLEEVE_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            {draft.sleeveCondition && !SLEEVE_GRADES.includes(draft.sleeveCondition) && <option value={draft.sleeveCondition}>{draft.sleeveCondition}</option>}
          </select>
        </label>
      </div>
    </section>
  );
}
