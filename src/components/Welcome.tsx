interface Props {
  onSignIn: () => void;
  onSignUp: () => void;
  /** Use Stacks on this device only, without an account. */
  onTry: () => void;
  /** You have books on this device already (from before, or kept after signing out). */
  hasLocal: boolean;
}

const FEATURES: { group: string; mark: string; items: [string, string][] }[] = [
  {
    group: 'Your library',
    mark: '▤',
    items: [
      ['Scan to add', 'Point your phone camera or a USB scanner at the barcode. Title, author, cover and page count fill themselves in.'],
      ['Your real bookcases', 'Tell Stacks you have a Billy or a Kallax, and see every spine on the shelf where it actually sits.'],
      ['Series and wishlist', 'Spots the gaps in a series, keeps a shopping list, and tells you in the shop whether you already own it.'],
      ['Bring your history', 'Import from Goodreads, StoryGraph and Discogs in a minute. Back up to a file whenever you like.'],
    ],
  },
  {
    group: 'Reading',
    mark: '❡',
    items: [
      ['Track every read', 'Page progress, a reading timer, daily streaks, half-star ratings and reviews.'],
      ['Goals and badges', 'Set “24 books this year” and see if you’re on track. Earn badges along the way.'],
      ['What to read next', 'An Up next queue, mood and pace filters, and picks based on the books you loved.'],
      ['Your year in books', 'Quotes, notes and a shareable wrap-up of your reading year.'],
    ],
  },
  {
    group: 'Records and CDs',
    mark: '◉',
    items: [
      ['A crate that knows itself', 'Vinyl and CDs by barcode, with track lists, pressing details and Goldmine grades.'],
      ['Log every spin', 'Press ▶ when the needle drops. See your most played, what’s gathering dust, and your year in music.'],
      ['What it’s worth', 'Collection value from Discogs prices, plus a stylus tracker that tells you when to replace it.'],
      ['Find your next record', 'New albums from artists you spin, similar artists, and a wantlist.'],
    ],
  },
  {
    group: 'With friends',
    mark: '❀',
    items: [
      ['A profile that’s yours', 'Your top 4 books and records, what you’re reading and what’s spinning, in your colors.'],
      ['A feed of what friends read', 'See when friends start, finish or rate a book, and like it.'],
      ['Buddy reads', 'Read a book together, see each other’s page, and chat without spoilers.'],
      ['Lend and borrow', 'Browse a friend’s shelves, ask to borrow, and never forget who has your copy.'],
    ],
  },
];

const SPINES = [
  { h: 86, w: 18, c: '#1f5c45' },
  { h: 94, w: 24, c: '#a87a22' },
  { h: 78, w: 16, c: '#7a4a8c' },
  { h: 100, w: 22, c: '#c0583f' },
  { h: 88, w: 14, c: '#2f5d8a' },
  { h: 72, w: 20, c: '#d9b44a' },
  { h: 96, w: 18, c: '#3d3d3d' },
];

function ShelfArt() {
  return (
    <div className="welcome-art" aria-hidden="true">
      <div className="welcome-shelf">
        {SPINES.map((s, i) => (
          <span key={i} className="welcome-spine" style={{ height: s.h, width: s.w, background: s.c }} />
        ))}
        <span className="welcome-spine lean" style={{ height: 90, width: 18, background: '#5b8f6e' }} />
        <span className="welcome-sleeve">
          <span className="welcome-disc" />
        </span>
      </div>
      <div className="welcome-board" />
      <div className="welcome-phone">
        <span className="welcome-phone-frame">
          <span className="welcome-barcode" />
          <span className="welcome-laser" />
        </span>
        <span className="welcome-phone-toast">✓ Added “Piranesi”</span>
      </div>
    </div>
  );
}

export function Welcome({ onSignIn, onSignUp, onTry, hasLocal }: Props) {
  return (
    <div className="welcome">
      <header className="welcome-top">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <span className="brand-name">Stacks</span>
        </span>
        <span className="welcome-top-actions">
          <button className="btn ghost" onClick={onSignIn}>Sign in</button>
          <button className="btn primary" onClick={onSignUp}>Create account</button>
        </span>
      </header>

      <section className="welcome-hero">
        <div className="welcome-hero-text">
          <p className="welcome-eyebrow">For readers and record collectors</p>
          <h1>Every book and record you own, on one shelf.</h1>
          <p className="welcome-lede">
            Scan a barcode and Stacks fills in the rest. Put each book on the shelf where it lives, track what you read, log what you spin, and share it with
            friends. Free, on your computer and your phone.
          </p>
          <div className="welcome-ctas">
            <button className="btn primary welcome-big" onClick={onSignUp}>Create a free account</button>
            <button className="btn welcome-big" onClick={onSignIn}>Sign in</button>
          </div>
          <p className="muted small">
            <button className="link small" onClick={onTry}>{hasLocal ? 'Open the library on this device' : 'Try it without an account'}</button>
            {hasLocal ? ' (not synced)' : ': it stays in this browser only.'}
          </p>
        </div>
        <ShelfArt />
      </section>

      <section className="welcome-strip" aria-label="Works with">
        <span><strong>📷 Phone camera</strong> scan in the shop or at home</span>
        <span><strong>⌨ USB scanner</strong> beep through a whole shelf</span>
        <span><strong>☁ Synced</strong> the same library on every device</span>
      </section>

      <section className="welcome-features" aria-label="What Stacks does">
        {FEATURES.map((g) => (
          <div key={g.group} className="welcome-group">
            <h2>
              <span className="welcome-mark" aria-hidden="true">{g.mark}</span>
              {g.group}
            </h2>
            <ul>
              {g.items.map(([t, d]) => (
                <li key={t}>
                  <strong>{t}</strong>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="welcome-steps" aria-label="How it works">
        <h2>Up and running in three steps</h2>
        <ol>
          <li>
            <span className="welcome-step-n">1</span>
            <strong>Make an account</strong>
            <span>Just an email and a password. Your library syncs between your phone and computer.</span>
          </li>
          <li>
            <span className="welcome-step-n">2</span>
            <strong>Scan your shelves</strong>
            <span>Pick a bookcase and scan book after book. Or import your Goodreads, StoryGraph or Discogs export.</span>
          </li>
          <li>
            <span className="welcome-step-n">3</span>
            <strong>Add your friends</strong>
            <span>Share your profile link, see what they’re reading, and start a buddy read.</span>
          </li>
        </ol>
      </section>

      <section className="welcome-faq" aria-label="Questions">
        <h2>Questions</h2>
        <dl>
          <div>
            <dt>Is it free?</dt>
            <dd>Yes. No ads, nothing to buy.</dd>
          </div>
          <div>
            <dt>Who can see my library?</dt>
            <dd>Only you. Your profile is private until you choose to share it with friends or a link, and friends only see your shelves if you open them for borrowing. Prices and notes always stay private.</dd>
          </div>
          <div>
            <dt>Do I need a barcode scanner?</dt>
            <dd>No. Your phone camera works, or type the ISBN. A USB scanner is just faster for a whole bookcase.</dd>
          </div>
          <div>
            <dt>Is there an app?</dt>
            <dd>Open Stacks in your phone’s browser and choose “Add to Home Screen”. It opens full screen like an app.</dd>
          </div>
          <div>
            <dt>Can I take my data with me?</dt>
            <dd>Any time: download a backup file, or a spreadsheet of your whole library.</dd>
          </div>
        </dl>
      </section>

      <section className="welcome-end">
        <h2>Your shelves are waiting.</h2>
        <div className="welcome-ctas">
          <button className="btn primary welcome-big" onClick={onSignUp}>Create a free account</button>
          <button className="btn welcome-big" onClick={onSignIn}>Sign in</button>
        </div>
      </section>

      <footer className="welcome-foot muted small">
        Stacks · book and cover data from Open Library and Google Books, music from MusicBrainz, Discogs and Deezer.
      </footer>
    </div>
  );
}
