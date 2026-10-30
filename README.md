# Stacks

A personal book library for your PC. Scan the barcode on a book with a USB
barcode scanner and it's added to your library with its cover, author,
publisher and page count filled in.

## Using it

Open `Stacks.html` in Chrome or Edge. Plug in your barcode scanner and scan
a book. You don't need to click anything first; the app listens for the scanner
anywhere on the page.

The app has three tabs: **Books** (with Library, Shelves, Wishlist and Stats pages),
**Music** and **Reading** (with Overview, Reading stats and Achievements pages).

- **Records and CDs** scan the same way. Their barcode is looked up on
  MusicBrainz (artist, label, year, tracks, vinyl or CD, cover art), and they
  stand on the shelves at real size next to your books.
- **This session** (left side) lists everything you just scanned. Use **Undo**
  if a book went in by mistake, **Add a copy** if you scanned a book you
  already own, and **Enter details** when the book databases don't know an ISBN.
- **New scans are / Shelving them on** sets the format and shelf for the next
  books you scan, so you can scan a whole shelf in one go.
- Click any book to edit it: format, copies, date bought, price paid, where
  it lives, tags, notes, and who you lent it to.
- **Shelves** draws your real bookcases (IKEA Billy, Kallax, a wall shelf, or
  your own size) with every book as a spine. Drag books between shelves, or
  open a book and pick its bookcase, shelf and number ("Billy, shelf 2, book 3").
  Pick a shelf under **And go on** before scanning and each new book is put at
  the end of that shelf, so scanning a shelf left to right keeps the order.
- **Stats** shows spending, books bought per month, formats, top authors,
  shelves, subjects, and what's lent out.
- **Backup** downloads your whole library as a `.json` backup or a `.csv`
  spreadsheet, and restores from a backup.

Your library is saved in the browser on this PC. Download a backup now and then;
clearing the browser's site data would erase it.

### Barcode scanner setup

Any USB or Bluetooth scanner in its normal "keyboard" mode works (most come set
up that way). It should send Enter after each code, which is the usual default.
If a scan only fills in the box without adding the book, look in the scanner's
manual for the "add Enter suffix" barcode and scan it once.

Scan the barcode that starts with 978 or 979. If the book also has a small
price barcode next to it, either one read together is fine.

### When a scan isn't found

Lookups ask Open Library and Google Books. Without a key, Google shares one small daily limit between everyone, so a book Google has can still fail to look up. When that happens the scan says "Lookup failed" and offers:

- **Search by title**: search both databases by title or author and pick the right book. It is saved with the ISBN you scanned, so scanning it again finds it.
- **Retry**: try the lookup again later.
- **Your own Google Books key** (Backup menu → Lookup keys): a free key from Google Cloud gives you your own limit of 1,000 lookups a day. It is stored only in your browser.

### Records and CDs

Record and CD barcodes are looked up on MusicBrainz, Deezer and iTunes at the same time, plus Discogs if you add a free personal token (Backup menu → Lookup keys). MusicBrainz and Discogs know whether a barcode is vinyl or a CD. When only Deezer or iTunes find it, Stacks saves it as a CD and says so, so you can switch it.

### Reading

Open any book and pick a status: Want to read, Reading, Read or Didn't finish. While reading, type the page you're on (or a percentage when the page count is unknown) and press Update; reaching the last page marks it Read. Start and finish dates can be changed. "Read it again" starts a new read and keeps the old one under Earlier reads.

**Up next** on the Reading page lists your Want to read books in the order you plan to read them. Drag them, or use the arrows, to reorder; the order is saved and included in backups. **What should I read next?** suggests three books from the list, leaning toward the top of it, and can be narrowed by length, genre or tag, or to books you own. **Start** moves a book to Currently reading.

**Mood, pace and content warnings:** open a book and press **+ Add mood, pace or content warnings**. Pick any of 14 moods (the same ones StoryGraph uses), a pace, and type any content warnings, then Save. Filter your library by mood or pace, narrow the "What should I read next?" picker the same way, and see your moods and pace on Reading stats. StoryGraph imports bring their moods, pace and warnings with them. For every other book, Stacks guesses moods, pace and likely warnings from its genres (asking Open Library when it needs more), in the background. Guesses are marked in the book until you change them, and **Suggest from genres** guesses for one book on request.

**Quotes and notes:** open a book and use **Quotes and notes → + Add** to save a quote (with its page) or your own note. They save right away. Star your favorites, copy a quote, edit or delete it. Reading → **Quotes and notes** collects them all: a favorite quote at the top, plus search and filters by type and book. Goodreads private notes come in as notes when you import, and backups include everything.

**Reading timer:** on the Reading page, press **Start timer** under a book you're reading. The timer stays in the corner on every page, keeps going if you reload, and can be paused. **Stop** asks for the page you reached and saves the session (it also updates your progress). **Log time** records a session you didn't time. Set a daily minutes goal at the top of Currently reading, which also shows your streak (days in a row you read). Reading stats shows time spent, hours per month and pages per hour.

**Series:** Stacks finds each book's series by itself, from Goodreads-style titles like "Leviathan Wakes (The Expanse, #1)" and from Open Library, and shows it under the book. Books → **Series** lists every series in order with what you own, have read and are missing. Click a **Missing** spot to search for that book and add it to your wishlist. Variants of one name ("The Expanse", "Expanse series", "Dune" and "Dune Chronicles" by the same author) are shown as one series, and publisher lines like "Penguin Classics" are ignored. If two series are really one, pick **Same series as…** on one of them to join it to the other. Books whose number isn't known are listed under **Which number is this?** so you can set it, and **+ Add one of your books to this series** adds a book by the same author. Set or fix a series by opening a book and using **+ Part of a series?** or **Edit**; Stacks never changes a series you set yourself. **Edit series** on a series lets you rename it and change every book's number to fix the order, or take a book out with **Not in series**.

**Year in books:** Reading → **Year in books** sums up any year: books, pages, time read, your favorite and top-rated books, moods, books per month, your challenge, records, a quote you kept and more. **Save picture** downloads a 1080×1350 image to share, and **Copy picture** puts it on the clipboard to paste into a chat. In December and January, the Overview page points you to it.

The Reading tab shows what you're reading now (with quick progress updates), your want-to-read list, and the books you finished each year. Reading history is included in backups.

### Challenges and badges

On the Reading tab, press **New challenge** to set a goal in books or pages, for a whole year or dates you choose. Each challenge shows how far along you are, whether you're ahead of or behind an even pace, and what it takes to finish on time. Badges inside each challenge: Off the mark, Quarter way, Halfway there, Home stretch, Goal reached, Overachiever (125%), Ahead of pace, Three-month streak, Page turner (finished within a week of starting) and Doorstopper (500+ pages). Earned badges are kept.

### Importing from Goodreads or StoryGraph

Backup menu → **Import from Goodreads or StoryGraph…**, then choose the .csv export (the dialog shows where to find it in each app). Shelves, read dates, re-reads, ratings, reviews and tags come across. Books already in Stacks are matched by ISBN or title and author. Books you've read but don't own are kept with your reading history but stay off your shelves and out of library counts (tick "Read but not owned" on the Books tab to see them, or tick "I own this" on a book). Importing the same file again skips reads that are already there.

### Wishlist

The Wishlist page (Books → Wishlist) lists books you'd like to buy: ones you add there, plus any "Want to read" book you don't own. Add books with **+ Add by title**, or set **Scans go to → My wishlist** and scan them in a shop. If you already own a book, Stacks says so instead of adding it. **Do I own this?** checks a title, author or ISBN against your library. **Copy shopping list** copies the list to paste into your phone's notes. **Bought it** (or scanning the book with scans going to your library) moves it into your library.

### Reading pages

On the Reading tab, the left column shows what you're reading now (with quick page updates) instead of the scanner. Scanning is paused on this tab. Three pages sit at the top: **Overview** (challenges, want to read, finished), **Reading stats** (per year or all time: books, pages, average rating, days per book, books and pages per month, ratings, authors, genres, longest, shortest and fastest reads) and **Achievements** (21 lifetime achievements with progress toward each, plus every challenge's badges).

## For developers

React + TypeScript + Vite. Needs Node.js 20 or newer.

```
npm install
npm run dev      # local dev server at http://localhost:5173
npm run build    # writes dist/index.html, a single self-contained file
```

Where things live:

- `src/types.ts` is the data model. Reading status, TBR, reading sessions and
  reviews are meant to be new stores keyed by `Book.id`, not new fields on the book.
- `src/lib/storage.ts` holds the `LibraryStore` interface and its browser
  (IndexedDB) version. A cloud version (for example Supabase) can implement the
  same interface later to sync between devices.
- `src/lib/lookup.ts` asks Open Library and Google Books at the same time and
  merges the answers; music barcodes go to MusicBrainz (max one request a second).
- `src/lib/useBarcodeScanner.ts` tells scanner input apart from typing by how
  fast the keys arrive.
- `src/lib/shelving.ts` handles bookcase spots and renumbering books when
  they move.
- `src/lib/isbn.ts` validates ISBN-10/13 and converts between them.

**Spin log (Music → Listening):** press **▶** on a record's card (hover over it), or **Spin it now** in its drawer, when you put it on. Stacks counts plays, shows what's **Now spinning**, and lists records you've **Never played** or that are **Gathering dust** (not played in 6 months). **What should I put on?** picks a record for you, leaning toward ones you haven't played in a while. You also get plays this week and month, a day streak, how much of your collection you've played, most played records, top artists, spins per month and per weekday. Add a play from an earlier day in the record's drawer; sort the collection by **Most played**. Plays are kept in backups.

**Import from Discogs:** Backup → **Import from Discogs…** (or the button on an empty Music page). Type your Discogs username to load a public collection (add your Discogs token under Lookup keys for a private one), or choose the .csv from Discogs' Collection → Export. Vinyl and CDs come in with label, catalog number, media and sleeve condition and your Discogs notes; cassettes and files are skipped; records you already have are linked, not added twice. Afterwards Stacks fetches each release's barcode, track count and cover in the background.

**Collection value (Music → Value):** press **Update prices** and Stacks asks the Discogs marketplace what each linked record sells for (one every couple of seconds). Without a Discogs token it uses the lowest price on sale; with a token it uses Discogs' suggested price for the record's condition (Very Good Plus if none is set) and links scanned records to Discogs by barcode. You see the total value, what you paid, the gain or loss, and your most valuable records. Type your own estimate under **Worth** in a record's panel to override Discogs. Prices are checked again after 30 days.

**Pressing and condition:** a record's panel has a **Pressing and condition** section: vinyl color, edition (limited, 180 gram, RSD…), catalog number, country, matrix/runout, and Goldmine grades for the record and the sleeve (Mint to Poor, with a short explanation). Colored vinyl shows as a colored disc peeking out of the sleeve on its card, and the grades show as e.g. "VG+/NM". **Find my pressing** lets you pick the exact Discogs release (search by barcode or title with a Discogs token, or paste a release link without one) and fills everything in. Records linked to Discogs get these details filled in automatically. Search also finds catalog numbers, colors, editions and matrix text.

**Tracks and favorites:** each record's panel shows its track list, split into sides (A, B…) or discs, with lengths. Stacks looks it up from Discogs, MusicBrainz or Deezer (in the background for your whole collection, one record every few seconds), or you can type or paste one with **Edit** ("A1 Dreams 4:14", one per line). Press ☆ to mark favorite songs; they're collected under Music → Listening → Favorite tracks. Searching the Music tab for a song title shows which record it's on (♪ B2 Songbird).

**Music wantlist (Music → Wantlist):** records and CDs you'd like to buy, separate from the book wishlist. Add one by hand, switch scans to the wantlist and scan a record in a shop, or press **Import Discogs wantlist** (by username or from Discogs' wantlist CSV). Records you already own are left off and listed. **Do I own this?** checks an album, artist or barcode against your collection. Wanted records linked to Discogs show the lowest price on sale after **Update prices**, and **Bought it** moves a record into your collection. Importing your Discogs collection also moves wanted records you've since bought into your collection.

**Stylus tracker (Music → Listening → Stylus):** tell Stacks which stylus is on your turntable, its tip shape (sets how many hours it lasts: conical ~500, elliptical ~800, fine line ~1000) and when you put it on. Every vinyl spin adds the record's length (from its track list, or a typical length for its size); CDs don't count. You see hours used, % worn and roughly how long it has left at your pace, with a warning from 85%. **I replaced it** starts a new one and keeps the old in a history. Styluses are saved in this browser and in backups.

**Year in music (Music → Year in music):** your spins, hours of music, different records and days with music for the year, your most played records ("On repeat"), top artists, spins month by month, new records added and what you spent, your longest streak, and records you played for the first time. **Save picture** / **Copy picture** make a 1080×1350 image to share. In December and January the Listening page points you to it.

## Phones, camera scanning and accounts

- **Online:** Stacks is published at https://paytonaliyah01.github.io/stacks/ on every push to `main` (`.github/workflows/pages.yml`). Phones need this https link: the camera only works on https.
- **Camera scanning:** "Scan with camera" opens the back camera and keeps scanning until you press Done. It uses the browser's own barcode reader where there is one (Chrome on Android), otherwise ZXing (iPhone, Firefox).
- **Accounts (Supabase):** sign in from the Account button. Your library stays in the browser first, so Stacks works offline; when signed in, every change is sent to the `items` table (one row per book, bookcase, reading, note, play or setting) and changes from your other devices come back on focus, every minute, or with Sync now. Row level security means each person only sees their own rows. Signing out can remove the library from a shared device.

## Profiles

Account → Set up your profile: an @username, name, picture (uploaded to the `avatars` bucket, or initials in a color), bio, profile color, top 4 books and top 4 records, and who can see it (only me, friends, anyone with the link). The profile shows a snapshot (`profiles.showcase`) of what you're reading and spinning and a few totals, refreshed a few seconds after your library changes; your full library stays private. Profiles open at `#@username`. The SQL for Supabase is in `supabase/`.

## Friends

The Friends tab (signed in, `#friends`): find someone by their exact username, send a request, accept or decline requests, and remove friends. Profiles set to "Friends" are visible to accepted friends. Uses the `friendships` table and the `find_user` / `my_friends` functions in `supabase/03-friends.sql`.

## Feed

Friends → Feed shows what you and your friends started, finished (with rating and a short review), put down, or put on the turntable, and stacks of new additions (grouped, one post per scanning session). Likes, and you can delete your own posts. Turn sharing off in Edit profile. Uses `supabase/04-feed.sql`.

## Home

Stacks opens on Home (also the logo): a greeting, your totals, currently reading with quick progress and the timer, your running reading goal, the top of your Up next queue, what's spinning or a record to put on, recently added, and the newest posts from your friends. The scanner stays on the left on a computer; on a phone only the scan button stays above the dashboard.

## Buddy reads

Reading → Buddy reads: start one from a book in your library and invite friends. Everyone's page shows side by side, updated automatically when you update the book in your own library (joining adds the book if you don't have it). Chat messages carry the page they're about and stay hidden behind a spoiler note for anyone who hasn't reached it. When everyone finishes, the finish line shows who finished when and their ratings. Uses `supabase/05-buddy-reads.sql`.

## Recommendations

Reading → For you (and "Picked for you" on Home). Stacks works out your taste from the books you finished: the authors, genres and moods of the ones you rated 4 stars and up count most, and books you put down count against. It suggests unread books from your own shelves first (never book 3 of a series while book 2 waits), then new books from Open Library by the authors you love and like your favorite books, then books your friends rated 4 stars or more. Each pick says why it's there. "Want to read" puts it on your to-read list (a book you don't own also lands on your wishlist), "Wishlist" only adds it to the wishlist, and ✕ hides it on this device. New books are cached for three days or until your ratings change; "Find new ones" looks again. No new SQL needed.

## Lending

Friends → Lending. Switch on "Let friends browse my shelves and ask to borrow" and your friends see a "Their shelves" section on your profile: titles, authors and covers of what you own (never prices, notes or where it sits), with "Ask to borrow". You answer each request with a due date ("Lend it") or "Not now", lend something straight to a friend, change due dates and press "Got it back". Your book's "Lent to" fills in and clears by itself, and clearing it in the book marks the loan returned. Borrowed books show their due date (red when overdue) and "Start reading". Requests and anything overdue or due within a week show on Home, with a badge on Friends. Uses `supabase/06-lending.sql`.
