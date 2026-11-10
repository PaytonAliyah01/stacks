import { useMemo, useRef, useState } from 'react';
import { KIND_LABELS, formatMoney, isMusic, kindOf, type Book, type Reading } from '../types';
import { discogsSellUrl } from '../lib/value';
import { formatIsbn13 } from '../lib/isbn';
import { currentReading } from '../lib/reading';
import { findMatches, wishlistOf } from '../lib/wishlist';
import { Cover } from './Cover';

interface Props {
  books: Book[]; // everything, owned or not
  readings: Reading[];
  placeOf: (b: Book) => string;
  onOpen: (b: Book) => void;
  onBought: (b: Book) => void;
  onRemove: (b: Book) => void;
  onAddByTitle: () => void;
  onScanToWishlist: () => void;
  scanningToWishlist: boolean;
  /** The records-and-CDs wantlist instead of the book wishlist. */
  music?: boolean;
  onImportDiscogs?: () => void;
}

export function WishlistView({ books, readings, placeOf, onOpen, onBought, onRemove, onAddByTitle, onScanToWishlist, scanningToWishlist, music = false, onImportDiscogs }: Readonly<Props>) {
  const mine = useMemo(() => books.filter((b) => isMusic(b) === music), [books, music]);
  const list = useMemo(
    () => wishlistOf(mine, readings).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
    [mine, readings],
  );
  const [check, setCheck] = useState('');
  const matches = useMemo(() => findMatches(mine, check).slice(0, 6), [mine, check]);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'select'>('idle');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const listText = list
    .map((b) =>
      music
        ? [b.authors.join(', '), b.title, [KIND_LABELS[kindOf(b)].one, b.vinylColor, b.catalogNumber].filter(Boolean).join(', ')].filter(Boolean).join(' — ')
        : [b.title, b.authors.join(', '), b.isbn13 && `ISBN ${formatIsbn13(b.isbn13)}`].filter(Boolean).join(' — '),
    )
    .join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listText);
      setCopied('ok');
    } catch {
      // Some browsers block the clipboard on local files: show the text to copy by hand.
      setCopied('select');
      setTimeout(() => textRef.current?.select(), 0);
    }
  };

  return (
    <div className="reading-view">
      <section className="panel">
        <h3>Do I own this?</h3>
        <input
          id="own-check"
          data-scan-input
          type="search"
          value={check}
          onChange={(e) => setCheck(e.target.value)}
          placeholder={music ? 'Type an album, artist or barcode (or scan it)' : 'Type a title, author or ISBN'}
          aria-label={music ? 'Album, artist or barcode to check' : 'Title, author or ISBN to check'}
        />
        {check.trim().length >= 2 &&
          (matches.length === 0 ? (
            <p className="own-answer none">Not in Stacks. You don't own it.</p>
          ) : (
            <ul className="own-results">
              {matches.map((b) => {
                const owned = b.owned !== false;
                const onList = !owned && wishlistOf([b], readings).length > 0;
                const read = currentReading(readings, b.id);
                return (
                  <li key={b.id}>
                    <button className="finished-item" onClick={() => onOpen(b)}>
                      <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" square={b.kind === 'vinyl' || b.kind === 'cd'} />
                      <span className="finished-text">
                        <strong>{b.title}</strong>
                        <span className="muted small">{b.authors.join(', ')}</span>
                      </span>
                      <span className={`own-answer ${owned ? 'yes' : 'no'}`}>
                        {owned
                          ? `You own this${music ? ` on ${KIND_LABELS[kindOf(b)].one}` : ''}${b.copies > 1 ? ` (${b.copies} copies)` : ''}${placeOf(b) ? ` · ${placeOf(b)}` : ''}`
                          : onList
                            ? music ? 'On your wantlist' : 'On your wishlist'
                            : read?.status === 'read'
                              ? "Read, but you don't own it"
                              : "You don't own this"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
      </section>

      <section className="panel">
        <div className="finished-head">
          <h3>{music ? 'Wantlist' : 'Wishlist'} · {list.length}</h3>
          <div className="wish-tools">
            <button className="btn ghost small-btn" onClick={onAddByTitle}>{music ? '+ Add a record' : '+ Add by title'}</button>
            {onImportDiscogs && <button className="btn ghost small-btn" onClick={onImportDiscogs}>Import Discogs wantlist</button>}
            <button className={`btn ghost small-btn ${scanningToWishlist ? 'on' : ''}`} onClick={onScanToWishlist}>
              {scanningToWishlist ? `Scans go to your ${music ? 'wantlist' : 'wishlist'}` : `Scan to ${music ? 'wantlist' : 'wishlist'}`}
            </button>
            {list.length > 0 && <button className="btn ghost small-btn" onClick={copy}>{copied === 'ok' ? 'Copied' : 'Copy shopping list'}</button>}
          </div>
        </div>
        {copied === 'select' && (
          <textarea ref={textRef} className="copy-box" readOnly rows={Math.min(8, list.length + 1)} value={listText} aria-label="Shopping list to copy" />
        )}
        {list.length === 0 && music ? (
          <p className="muted">
            Nothing here yet. Add a record, switch scans to your wantlist and scan one in a shop, or import your Discogs wantlist. Records you already own
            can't be added, so you won't buy them twice.
          </p>
        ) : list.length === 0 ? (
          <p className="muted">
            Nothing here yet. Add books by title, switch scans to your wishlist, or mark a book you don't own as “Want to read”. Books already in your
            library can't be added, so you won't buy them twice.
          </p>
        ) : (
          <ul className="wish-list">
            {list.map((b) => (
              <li key={b.id}>
                <button className="now-cover" onClick={() => onOpen(b)} aria-label={`Open ${b.title}`}>
                  <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" square={music} />
                </button>
                <div className="finished-text">
                  <button className="link now-title" onClick={() => onOpen(b)}>{b.title}</button>
                  <span className="muted small">{b.authors.join(', ')}</span>
                  <span className="muted small">
                    {music
                      ? [KIND_LABELS[kindOf(b)].one, b.vinylColor, b.catalogNumber, b.publishedDate?.slice(0, 4)].filter(Boolean).join(' · ')
                      : [b.isbn13 && formatIsbn13(b.isbn13), b.pricePaid !== undefined && `about ${formatMoney(b.pricePaid, b.currency)}`].filter(Boolean).join(' · ')}
                  </span>
                  {music && b.discogsId && b.market && (
                    <a className="small wish-price" href={discogsSellUrl(b.discogsId)} target="_blank" rel="noreferrer">
                      {b.market.lowest !== undefined ? `From ${formatMoney(b.market.lowest, b.market.currency)} on Discogs · ${b.market.forSale ?? 0} for sale` : 'None for sale on Discogs right now'}
                    </a>
                  )}
                </div>
                <div className="wish-actions">
                  <button className="btn primary small-btn" onClick={() => onBought(b)}>Bought it</button>
                  <button className="link muted-link" onClick={() => onRemove(b)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
