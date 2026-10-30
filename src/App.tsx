import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FORMAT_LABELS, KIND_LABELS, STATUS_LABELS, guessCurrency, type BookNote, type Spin, type BookSeries, type Challenge, type ReadStatus, type Reading, isMusic, kindOf, type ItemKind, type Book, type BookFormat, type BookMetadata, type Bookcase } from './types';
import { formatIsbn13, parseScan } from './lib/isbn';
import { fetchDiscogsRelease, fetchSeries, fetchSubjects, findAlbumCover, fetchTrackList, getDiscogsToken, fetchMarketPrices, discogsIdForBarcode, lookupBarcode, lookupIsbn, type SearchHit } from './lib/lookup';
import { downloadFile, makeBackup, newId, parseBackup, store, toCsv } from './lib/storage';
import { digitOf, useBarcodeScanner } from './lib/useBarcodeScanner';
import { AccountDialog, syncLabel } from './components/AccountDialog';
import { onRemote, prefChanged, startSync, supabase, syncState, watchSync, type SyncState } from './lib/cloud';
import type { User } from '@supabase/supabase-js';
import { ProfileEditor, Avatar } from './components/ProfileEditor';
import { ProfileView } from './components/ProfileView';
import { FriendsView } from './components/FriendsView';
import { listFriends, type Friend } from './lib/friends';
import { buildShowcase, loadMyProfile, saveShowcase, usernameFromHash, type Profile } from './lib/profile';
import { CameraScanner, cameraNeedsHttps, cameraSupported } from './components/CameraScanner';
import { Cover } from './components/Cover';
import { BookDrawer } from './components/BookDrawer';
import { Stats } from './components/Stats';
import { ShelvesView } from './components/ShelvesView';
import { BookcaseEditor } from './components/BookcaseEditor';
import { SearchDialog } from './components/SearchDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { NowReading, ReadingView } from './components/ReadingView';
import { VibeSelect } from './components/VibeSelect';
import { NotesView } from './components/NotesView';
import { SeriesView } from './components/SeriesView';
import { ListeningView } from './components/ListeningView';
import { MusicWrap } from './components/MusicWrap';
import { DiscogsImport } from './components/DiscogsImport';
import { ValueView, type PriceRun } from './components/ValueView';
import { isStale, marketCurrency } from './lib/value';
import { discBackground, gradeShort } from './lib/pressing';
import { loadStyluses, saveStyluses, type Stylus } from './lib/stylus';
import type { DiscogsPlan } from './lib/discogs';
import { playsByRecord } from './lib/spins';
import { YearWrap } from './components/YearWrap';
import { SERIES_FINDER_VERSION, isPublisherSeries, parseSeries, seriesFromTitle, seriesKey, seriesLabel } from './lib/series';
import { TimerBar } from './components/ReadingTimer';
import { loadActive, saveActive, startSession, type ActiveSession } from './lib/sessions';
import { guessVibe, matchesVibe } from './lib/moods';
import { ReadingStats } from './components/ReadingStats';
import { AchievementsView } from './components/AchievementsView';
import { ChallengesPanel } from './components/ChallengesPanel';
import { WishlistView } from './components/WishlistView';
import { sameBook } from './lib/wishlist';
import { ImportDialog } from './components/ImportDialog';
import type { ImportPlan } from './lib/importHistory';
import { awardBadges, progressOf } from './lib/challenges';
import { currentReading, progressPct, readingsOf, todayIso as todayIsoDate } from './lib/reading';
import { allSpotsOf, moveBook, newBookcase, nextPosition, placeLabel, sameSpot, spotName, type Spot } from './lib/shelving';

type ScanState = 'looking' | 'added' | 'duplicate' | 'not-found' | 'error' | 'invalid' | 'undone';

interface ScanItem {
  key: string;
  raw: string;
  /** The book as it was before this scan changed it (e.g. moved off the wishlist), so Undo can put it back. */
  before?: Book;
  isbn13?: string;
  isbn10?: string;
  barcode?: string;
  kind?: ItemKind;
  state: ScanState;
  bookId?: string;
  title?: string;
  author?: string;
  coverUrl?: string;
  message?: string;
}

type SortKey = 'added' | 'title' | 'author' | 'published' | 'played';
type View = 'library' | 'music' | 'reading' | 'wishlist' | 'shelves' | 'series' | 'stats';
type BooksPage = 'library' | 'shelves' | 'series' | 'wishlist' | 'stats';
/** The pages inside the Books tab. */
const BOOK_PAGES: readonly (readonly [BooksPage, string])[] = [
  ['library', 'Library'],
  ['shelves', 'Shelves'],
  ['series', 'Series'],
  ['wishlist', 'Wishlist'],
  ['stats', 'Stats'],
];

const STATE_LABEL: Record<ScanState, string> = {
  looking: 'Looking up…',
  added: 'Added',
  duplicate: 'Already owned',
  'not-found': 'Not found',
  error: 'Lookup failed',
  invalid: 'Not an ISBN',
  undone: 'Undone',
};

const PREF_FORMAT = 'stacks.defaultFormat';
const PREF_SPOT = 'stacks.defaultSpot';
const PREF_CURRENCY = 'stacks.currency';
const PREF_LAST_BACKUP = 'stacks.lastBackup';
const PREF_SCAN_TARGET = 'stacks.scanTarget';
const PREF_BACKUP_SNOOZE = 'stacks.backupSnoozedUntil';

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preference only */
  }
}

function readSpot(): Spot | null {
  try {
    return JSON.parse(readPref(PREF_SPOT, 'null')) as Spot | null;
  } catch {
    return null;
  }
}

/**
 * Older versions filled in the purchase date with the day a book was scanned.
 * Once, clear the dates that match the scan day exactly, so stats only count
 * real purchase dates.
 */
const PREF_DATES_FIXED = 'stacks.purchaseDatesFixed';
async function clearAutoPurchaseDates() {
  if (readPref(PREF_DATES_FIXED, '')) return;
  const all = await store.list();
  const auto = all.filter((b) => b.acquiredOn && b.acquiredOn === b.addedAt.slice(0, 10));
  if (auto.length) await store.putMany(auto.map((b) => ({ ...b, acquiredOn: undefined })));
  writePref(PREF_DATES_FIXED, '1');
}

function newBook(meta: BookMetadata, format: BookFormat): Book {
  const now = new Date().toISOString();
  return {
    ...meta,
    id: newId(),
    format,
    copies: 1,
    tags: [],
    addedAt: now,
    updatedAt: now,
  };
}

const blankMeta = (ids: { isbn13?: string; isbn10?: string; barcode?: string } = {}): BookMetadata => ({
  title: '',
  authors: [],
  subjects: [],
  sources: ['manual'],
  ...ids,
  // A barcode that isn't an ISBN is almost always music.
  kind: ids.barcode ? 'vinyl' : 'book',
});

const surname = (b: Book) => (b.authors[0] ?? '').split(' ').pop()?.toLowerCase() ?? '';
const year = (b: Book) => b.publishedDate?.match(/\d{4}/)?.[0] ?? '';

export default function App() {
  const [allBooks, setBooks] = useState<Book[]>([]);
  // The library is what you own; books you've only read (e.g. imported) live in Reading.
  const books = useMemo(() => allBooks.filter((b) => b.owned !== false), [allBooks]);
  const [includeUnowned, setIncludeUnowned] = useState(false);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [spins, setSpins] = useState<Spin[]>([]);
  const plays = useMemo(() => playsByRecord(spins), [spins]);
  const [musicTab, setMusicTab] = useState<'collection' | 'listening' | 'value' | 'wantlist' | 'wrap'>('collection');
  const [discogsWants, setDiscogsWants] = useState(false);
  const [styluses, setStylusList] = useState<Stylus[]>(loadStyluses);
  const setStyluses = (list: Stylus[]) => {
    saveStyluses(list);
    prefChanged('styluses');
    setStylusList(list);
  };
  const [priceRun, setPriceRun] = useState<PriceRun | null>(null);
  const stopPrices = useRef(false);
  const [activeSession, setActive] = useState<ActiveSession | null>(loadActive);
  const setActiveSession = (a: ActiveSession | null) => {
    saveActive(a);
    setActive(a);
  };
  const [loaded, setLoaded] = useState(false);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [entry, setEntry] = useState('');
  const [defaultFormat, setDefaultFormat] = useState<BookFormat>(() => readPref(PREF_FORMAT, 'paperback') as BookFormat);
  // Where scans go: your library, or the wishlist of books to buy.
  const [scanTarget, setScanTarget] = useState<'library' | 'wishlist'>(() => (readPref(PREF_SCAN_TARGET, 'library') === 'wishlist' ? 'wishlist' : 'library'));
  useEffect(() => writePref(PREF_SCAN_TARGET, scanTarget), [scanTarget]);
  // false when closed; otherwise what to search for ('' for nothing yet).
  const [wishSearch, setWishSearch] = useState<string | false>(false);
  const wishSeries = useRef<BookSeries | undefined>(undefined);
  const [defaultSpot, setDefaultSpot] = useState<Spot | null>(readSpot);
  const [bookcases, setBookcases] = useState<Bookcase[]>([]);
  const [currency, setCurrency] = useState(() => readPref(PREF_CURRENCY, '') || guessCurrency());
  const [editingCase, setEditingCase] = useState<{ bc: Bookcase; isNew: boolean } | null>(null);
  const [searchFor, setSearchFor] = useState<ScanItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [discogsOpen, setDiscogsOpen] = useState(false);
  const [readingTab, setReadingTab] = useState<'overview' | 'stats' | 'notes' | 'wrap' | 'achievements'>('overview');
  const [highlightId, setHighlightId] = useState<string>();
  const [view, setView] = useState<View>('library');
  // Coming back to Books opens the page you were last on.
  const [lastBooksPage, setLastBooksPage] = useState<BooksPage>('library');
  useEffect(() => {
    if (BOOK_PAGES.some(([k]) => k === view)) setLastBooksPage(view as BooksPage);
  }, [view]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('added');
  const [formatFilter, setFormatFilter] = useState<BookFormat | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<ItemKind | 'all'>('all');
  const [shelfFilter, setShelfFilter] = useState<string>('all');
  const [lentOnly, setLentOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReadStatus | 'none' | 'all'>('all');
  const [vibeFilter, setVibeFilter] = useState('any');
  const [open, setOpen] = useState<{ book: Book; isNew?: boolean; scanKey?: string } | null>(null);
  const [flash, setFlash] = useState(false);
  // A scanner types into whichever window has the keyboard, so say when that isn't us.
  const [pageFocused, setPageFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const check = () => setPageFocused(document.hasFocus());
    window.addEventListener('focus', check);
    window.addEventListener('blur', check);
    const t = setInterval(check, 1000);
    return () => {
      window.removeEventListener('focus', check);
      window.removeEventListener('blur', check);
      clearInterval(t);
    };
  }, []);
  const [toast, setToast] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const scanFieldRef = useRef<HTMLInputElement>(null);
  // Invisible box that catches scanner input, so scans save without the digits showing.
  const sinkRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [sync, setSync] = useState<SyncState>(syncState);
  const [accountOpen, setAccountOpen] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileName, setProfileName] = useState(usernameFromHash);
  const [friendsOpen, setFriendsOpen] = useState(() => location.hash === '#friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsError, setFriendsError] = useState<string>();

  const reload = useCallback(async () => {
    await clearAutoPurchaseDates();
    const [b, c, r, ch, n, sp] = await Promise.all([store.list(), store.listBookcases(), store.listReadings(), store.listChallenges(), store.listNotes(), store.listSpins()]);
    setSpins(sp);
    setBooks(b);
    setBookcases(c);
    setReadings(r);
    setChallenges(ch);
    setNotes(n);
  }, []);

  // Accounts: follow sign-ins, and reload the screens when changes arrive from your other devices.
  useEffect(() => {
    onRemote(() => {
      void reload();
      setStylusList(loadStyluses());
    });
    const unwatch = watchSync(setSync);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
        setAccountOpen(true);
      }
    });
    startSync();
    return () => {
      unwatch();
      data.subscription.unsubscribe();
    };
  }, [reload]);

  // Profiles: yours loads when you sign in; #@name in the address opens someone's profile.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    loadMyProfile(user.id).then(setProfile, () => undefined);
  }, [user]);
  useEffect(() => {
    const onHash = () => {
      setProfileName(usernameFromHash());
      setFriendsOpen(location.hash === '#friends');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const showProfile = (name?: string) => {
    if (name) location.hash = `@${name}`;
    else history.replaceState(null, '', location.pathname + location.search);
    setProfileName(name);
    setFriendsOpen(false);
    window.scrollTo(0, 0);
  };
  const showFriends = () => {
    location.hash = 'friends';
    setFriendsOpen(true);
    setProfileName(undefined);
    window.scrollTo(0, 0);
  };
  const refreshFriends = useCallback(() => {
    listFriends().then(
      (l) => {
        setFriends(l);
        setFriendsError(undefined);
      },
      (e) => setFriendsError(`Couldn't load your friends: ${(e as Error).message}`),
    );
  }, []);
  // Friends and requests: on sign-in, when you come back to the tab, and every minute.
  useEffect(() => {
    if (!user || !profile) {
      setFriends([]);
      return;
    }
    refreshFriends();
    const t = window.setInterval(() => !document.hidden && refreshFriends(), 60_000);
    window.addEventListener('focus', refreshFriends);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', refreshFriends);
    };
  }, [user, profile?.id, refreshFriends]);
  const onPage = !!profileName || (friendsOpen && !!user);
  const goView = (v: View) => {
    if (onPage) showProfile(undefined);
    setView(v);
  };
  const friendRequests = friends.filter((f) => f.status === 'pending' && f.incoming).length;
  const topIdsOf = (p: Profile | null) => ({ books: p?.showcase.topBooks?.map((x) => x.id) ?? [], records: p?.showcase.topRecords?.map((x) => x.id) ?? [] });
  // Keep your profile's snapshot (reading, spinning, totals) up to date, a little after things settle.
  useEffect(() => {
    if (!user || !profile || !loaded) return;
    const t = setTimeout(() => {
      const next = buildShowcase(allBooks, readings, spins, topIdsOf(profile));
      if (JSON.stringify(next) === JSON.stringify(profile.showcase)) return;
      saveShowcase(user.id, next).then(() => setProfile((p) => (p ? { ...p, showcase: next } : p)), () => undefined);
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, loaded, allBooks, readings, spins]);

  // Fill in moods, pace and warnings for books that have none, guessed from their genres.
  // Runs quietly in the background, one book at a time, and never touches a book you've tagged.
  const vibeBusy = useRef(false);
  useEffect(() => {
    const needs = (b: Book) => !isMusic(b) && !b.vibeChecked && !b.moods?.length && !b.pace;
    if (!loaded || vibeBusy.current || !allBooks.some(needs)) return;
    vibeBusy.current = true;
    (async () => {
      let filled = 0;
      for (const { id } of allBooks.filter(needs)) {
        const b = await store.get(id);
        if (!b || !needs(b)) continue;
        let g = guessVibe([...b.subjects, ...b.tags]);
        if (!g.moods.length) {
          try {
            g = guessVibe([...b.subjects, ...b.tags, ...(await fetchSubjects(b))]);
          } catch {
            break; // offline or rate-limited: try again next time
          }
          await new Promise((r) => setTimeout(r, 800));
        }
        const latest = await store.get(id);
        if (!latest || !needs(latest)) continue;
        const found = g.moods.length > 0;
        const next: Book = {
          ...latest,
          vibeChecked: true,
          ...(found ? { moods: g.moods, pace: g.pace, contentWarnings: latest.contentWarnings?.length ? latest.contentWarnings : g.contentWarnings.length ? g.contentWarnings : undefined, vibeGuessed: true } : {}),
        };
        await store.put(next);
        setBooks((l) => l.map((x) => (x.id === id ? next : x)));
        if (found) filled++;
      }
      vibeBusy.current = false;
      if (filled) setToast(`Added moods to ${filled} book${filled === 1 ? '' : 's'}. Open a book to adjust them.`);
    })().catch(() => {
      vibeBusy.current = false;
    });
  }, [loaded, allBooks]);

  // Records imported from Discogs: fetch each release's barcode, track count and cover,
  // one at a time (Discogs allows about one request a second without a token).
  const discogsBusy = useRef(false);
  // Bumped when the Discogs filler finishes, so the track-list filler (which waits for it) starts.
  const [discogsDone, setDiscogsDone] = useState(0);
  useEffect(() => {
    const needs = (b: Book) => isMusic(b) && !!b.discogsId && ((!b.discogsChecked && (!b.coverUrl || !b.trackCount || !b.barcode)) || !b.pressingChecked);
    if (!loaded || discogsBusy.current || !allBooks.some(needs)) return;
    discogsBusy.current = true;
    (async () => {
      let filled = 0;
      for (const { id } of allBooks.filter(needs)) {
        const b = await store.get(id);
        if (!b || !needs(b)) continue;
        let found: Awaited<ReturnType<typeof fetchDiscogsRelease>> = {};
        try {
          found = await fetchDiscogsRelease(b.discogsId!);
        } catch (err) {
          if (!/HTTP 404/.test(String(err))) break; // offline or too many requests: try again next time
        }
        if (!b.coverUrl && !found.coverUrl && b.authors[0]) {
          try {
            found.coverUrl = await findAlbumCover(b.authors[0], b.title);
          } catch {
            /* no cover is fine */
          }
        }
        const latest = await store.get(id);
        if (!latest) continue;
        const next: Book = {
          ...latest,
          discogsChecked: true,
          pressingChecked: true,
          vinylColor: latest.vinylColor ?? found.vinylColor,
          edition: latest.edition ?? found.edition,
          pressingCountry: latest.pressingCountry ?? found.pressingCountry,
          matrix: latest.matrix ?? found.matrix,
          catalogNumber: latest.catalogNumber ?? found.catalogNumber,
          coverUrl: latest.coverUrl ?? found.coverUrl,
          trackCount: latest.trackCount ?? found.trackCount,
          barcode: latest.barcode ?? found.barcode,
          subjects: latest.subjects.length ? latest.subjects : found.subjects ?? [],
          publishedDate: latest.publishedDate ?? found.publishedDate,
          updatedAt: new Date().toISOString(),
        };
        await store.put(next);
        setBooks((l) => l.map((x) => (x.id === id ? next : x)));
        if (next.coverUrl !== latest.coverUrl || next.trackCount !== latest.trackCount) filled++;
        await new Promise((r) => setTimeout(r, getDiscogsToken() ? 1100 : 2600));
      }
      discogsBusy.current = false;
      setDiscogsDone((n) => n + 1);
      if (filled) setToast(`Added covers and details for ${filled} record${filled === 1 ? '' : 's'} from Discogs.`);
    })().catch(() => {
      discogsBusy.current = false;
    });
  }, [loaded, allBooks]);

  // Track lists for records, so favorites and "which record has this song?" work across the collection.
  const tracksBusy = useRef(false);
  useEffect(() => {
    const needs = (b: Book) => isMusic(b) && b.owned !== false && !b.tracks?.length && !b.tracksChecked && !!b.title;
    // Wait for Discogs details first: the release id gives the best track list.
    if (!loaded || tracksBusy.current || discogsBusy.current || !allBooks.some(needs)) return;
    tracksBusy.current = true;
    (async () => {
      for (const { id } of allBooks.filter(needs)) {
        const b = await store.get(id);
        if (!b || !needs(b)) continue;
        let tracks: Book['tracks'];
        try {
          tracks = await fetchTrackList(b);
        } catch {
          break; // offline: try again next time
        }
        const latest = await store.get(id);
        if (!latest || !needs(latest)) continue;
        const next: Book = { ...latest, tracks, tracksChecked: true, trackCount: latest.trackCount ?? tracks?.length, updatedAt: new Date().toISOString() };
        await store.put(next);
        setBooks((l) => l.map((x) => (x.id === id ? next : x)));
        await new Promise((r) => setTimeout(r, 2600));
      }
      tracksBusy.current = false;
    })().catch(() => {
      tracksBusy.current = false;
    });
  }, [loaded, allBooks, discogsDone]);

  // Find the series for books that don't have one (or have no number yet): from
  // Goodreads-style titles, "series:" subjects, or Open Library's edition record.
  // Each book is looked at once per version of the finder; series you set yourself are left alone.
  const seriesBusy = useRef(false);
  useEffect(() => {
    const needs = (b: Book) =>
      !isMusic(b) && !b.seriesManual && (b.seriesV ?? 0) < SERIES_FINDER_VERSION && (!b.series || b.series.number === undefined);
    if (!loaded || seriesBusy.current || !allBooks.some(needs)) return;
    seriesBusy.current = true;
    (async () => {
      let found = 0;
      for (const { id } of allBooks.filter(needs)) {
        const b = await store.get(id);
        if (!b || !needs(b)) continue;
        const candidates: BookSeries[] = [];
        const fromTitle = seriesFromTitle(b.title);
        if (fromTitle) candidates.push(fromTitle);
        for (const x of b.subjects.filter((x) => /^series\s*:/i.test(x))) {
          const p = parseSeries(x);
          if (p) candidates.push(p);
        }
        if (!candidates.some((c) => c.number !== undefined) && b.isbn13) {
          try {
            for (const raw of await fetchSeries(b.isbn13)) {
              const p = parseSeries(raw);
              if (p && !isPublisherSeries(p.name)) candidates.push(p);
            }
          } catch {
            break; // offline: try again next time
          }
          await new Promise((r) => setTimeout(r, 800));
        }
        const latest = await store.get(id);
        if (!latest || !needs(latest)) continue;
        // Keep the series the book already has and just add its number, when one turns up.
        // A publisher line picked up by an older version isn't a real series.
        const old = latest.series && !isPublisherSeries(latest.series.name) ? latest.series : undefined;
        const same = old && candidates.find((c) => c.number !== undefined && seriesKey(c.name) === seriesKey(old.name));
        const best = same ? { ...old!, number: same.number } : old ?? candidates.find((c) => c.number !== undefined) ?? candidates[0];
        const changed = best?.name !== latest.series?.name || best?.number !== latest.series?.number;
        const next: Book = { ...latest, seriesChecked: true, seriesV: SERIES_FINDER_VERSION, series: best };
        await store.put(next);
        setBooks((l) => l.map((x) => (x.id === id ? next : x)));
        if (changed) found++;
      }
      seriesBusy.current = false;
      if (found) setToast(`Updated the series for ${found} book${found === 1 ? '' : 's'}. See Books → Series.`);
    })().catch(() => {
      seriesBusy.current = false;
    });
  }, [loaded, allBooks]);

  /** Saves a small change to a book without opening it. */
  const patchBook = async (b: Book) => {
    const next = { ...b, updatedAt: new Date().toISOString() };
    await store.put(next);
    setBooks((l) => l.map((x) => (x.id === b.id ? next : x)));
  };

  // A timer for a reading that's since been deleted can't be finished, so drop it.
  useEffect(() => {
    if (loaded && activeSession && readings.length && !readings.some((r) => r.id === activeSession.readingId)) setActiveSession(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, readings]);

  const [storageProblem, setStorageProblem] = useState('');
  useEffect(() => {
    reload()
      .catch((err) => setStorageProblem(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
  }, [reload]);

  useEffect(() => writePref(PREF_FORMAT, defaultFormat), [defaultFormat]);
  useEffect(() => writePref(PREF_SPOT, JSON.stringify(defaultSpot)), [defaultSpot]);
  useEffect(() => writePref(PREF_CURRENCY, currency), [currency]);
  // Forget the default shelf if its bookcase was deleted or made smaller.
  const spotValid = (s: Spot | null) => {
    const bc = s && bookcases.find((c) => c.id === s.bookcaseId);
    return !!bc && s!.shelf >= 0 && s!.shelf <= bc.shelves && s!.section <= bc.sections;
  };
  const scanSpot = spotValid(defaultSpot) ? defaultSpot : null;

  /** A new book, placed at the end of the default shelf if one is chosen. */
  const freshBook = async (meta: BookMetadata): Promise<Book> => {
    const b = newBook(meta, defaultFormat);
    if (scanSpot) b.placement = { ...scanSpot, position: nextPosition(await store.list(), scanSpot) };
    return b;
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const patchScan = (key: string, patch: Partial<ScanItem>) =>
    setScans((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraNote, setCameraNote] = useState(false);

  const handleCode = useCallback(
    async (raw: string) => {
      const key = newId();
      const parsed = parseScan(raw);
      setFlash(true);
      setTimeout(() => setFlash(false), 450);

      if (parsed.type === 'invalid') {
        setScans((l) => [{ key, raw, state: 'invalid', message: parsed.reason }, ...l]);
        return;
      }
      const ids =
        parsed.type === 'isbn'
          ? { isbn13: parsed.isbn13, isbn10: parsed.isbn10 }
          : { barcode: parsed.code };
      const find = () => (parsed.type === 'isbn' ? store.findByIsbn(parsed.isbn13) : store.findByBarcode(parsed.code));
      const asDuplicate = (b: Book): Partial<ScanItem> => ({
        state: 'duplicate',
        bookId: b.id,
        kind: kindOf(b),
        title: b.title,
        author: b.authors[0],
        coverUrl: b.coverUrl,
        message:
          scanTarget === 'wishlist'
            ? `You already own this${b.copies > 1 ? ` (${b.copies} copies)` : ''}. No need to buy it.`
            : b.copies > 1
              ? `You have ${b.copies} copies.`
              : undefined,
      });
      // A book Stacks knows but you don't own (wishlist or read elsewhere): scanning it changes that.
      const fromUnowned = async (b: Book) => {
        const now = new Date().toISOString();
        if (scanTarget === 'wishlist') {
          if (!b.wishlist) await store.put({ ...b, wishlist: true, updatedAt: now });
          patchScan(key, {
            state: 'added', bookId: b.id, kind: kindOf(b), title: b.title, author: b.authors[0], coverUrl: b.coverUrl, before: b,
            message: b.wishlist ? 'Already on your wishlist.' : 'Added to your wishlist.',
          });
        } else {
          const owned: Book = { ...b, owned: undefined, wishlist: undefined, format: isMusic(b) ? b.format : b.format ?? defaultFormat, updatedAt: now };
          if (scanSpot) owned.placement = { ...scanSpot, position: nextPosition(await store.list(), scanSpot) };
          await store.put(owned);
          patchScan(key, {
            state: 'added', bookId: b.id, kind: kindOf(b), title: b.title, author: b.authors[0], coverUrl: b.coverUrl, before: b,
            message: b.wishlist ? 'Moved from your wishlist into your library.' : 'Added to your library (it was in your reading history).',
          });
        }
        reload();
      };
      const known = (b: Book) => (b.owned === false ? fromUnowned(b) : patchScan(key, asDuplicate(b)));

      // Show the scan straight away, so a scan never seems to vanish.
      setScans((l) => [{ key, raw, ...ids, state: 'looking' }, ...l]);
      try {
        const existing = await find();
        if (existing) return known(existing);

        const result = parsed.type === 'isbn' ? await lookupIsbn(parsed.isbn13, parsed.isbn10) : await lookupBarcode(parsed.code);
        // The same item scanned twice in a row: the first scan may have saved it meanwhile.
        const again = await find();
        if (again) return known(again);

        if (result.status === 'found') {
          const book = await freshBook(result.metadata);
          if (scanTarget === 'wishlist') {
            book.owned = false;
            book.wishlist = true;
            book.placement = undefined;
          }
          await store.put(book);
          // Deezer and iTunes can't tell vinyl from CD; only MusicBrainz and Discogs can.
          const guessedKind = isMusic(book) && !book.sources.some((x) => x === 'musicbrainz' || x === 'discogs');
          patchScan(key, {
            state: 'added', bookId: book.id, kind: kindOf(book), title: book.title, author: book.authors[0], coverUrl: book.coverUrl,
            message: scanTarget === 'wishlist' ? 'Added to your wishlist.' : guessedKind ? 'Saved as a CD. If it’s vinyl, open it and switch to Vinyl.' : undefined,
          });
          reload();
        } else if (result.status === 'not-found') {
          patchScan(key, {
            state: 'not-found',
            message:
              parsed.type === 'isbn'
                ? "Open Library and Google Books don't know this ISBN. Add the details yourself."
                : "MusicBrainz, Deezer and iTunes don't know this barcode. Add the record or CD yourself, or add a Discogs token (Backup → Lookup keys) and press Retry.",
          });
        } else {
          patchScan(key, { state: 'error', message: result.message });
        }
      } catch (err) {
        patchScan(key, { state: 'error', message: `Couldn't save this scan: ${err instanceof Error ? err.message : String(err)}` });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultFormat, scanTarget, scanSpot?.bookcaseId, scanSpot?.shelf, scanSpot?.section, reload],
  );

  useBarcodeScanner(handleCode, sinkRef, view !== 'reading' && !profileName && !profileEditing && !cameraOpen && !accountOpen && !open && !editingCase && !searchFor && !settingsOpen && !importOpen && wishSearch === false);

  // Keep the scan box ready: focus it on start and whenever a panel closes.
  useEffect(() => {
    if (!open && !editingCase && (document.activeElement === document.body || !document.activeElement)) {
      sinkRef.current?.focus();
    }
  }, [open, editingCase, loaded, searchFor, settingsOpen, importOpen]);

  const onSinkKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const sink = e.currentTarget;
    const slow = sink.value && e.timeStamp - Number(sink.dataset.last ?? 0) > 150;
    sink.dataset.last = String(e.timeStamp);
    const digit = digitOf(e);
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (!sink.value) return;
      e.preventDefault();
      const code = sink.value;
      sink.value = '';
      handleCode(code);
      return;
    }
    if (slow) {
      // A person typing, not a scanner: move what they typed to the visible box.
      e.preventDefault();
      setEntry(sink.value + (digit ?? (e.key.length === 1 ? e.key : '')));
      sink.value = '';
      scanFieldRef.current?.focus();
      return;
    }
    if (digit && digit !== e.key) {
      e.preventDefault();
      sink.value += digit;
    }
  };

  const submitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry.trim()) return;
    handleCode(entry);
    setEntry('');
    sinkRef.current?.focus(); // so the next scan saves quietly again
  };

  const undoScan = async (item: ScanItem) => {
    if (!item.bookId) return;
    if (item.before) {
      // The scan only changed a book Stacks already had: put it back as it was.
      await takeOff(item.bookId);
      await store.put(item.before);
      patchScan(item.key, { state: 'undone', message: undefined });
      return reload();
    }
    await takeOff(item.bookId);
    await store.remove(item.bookId);
    await store.removeReadingsOf(item.bookId);
    patchScan(item.key, { state: 'undone', message: undefined });
    reload();
  };

  const addCopy = async (item: ScanItem) => {
    const b = item.bookId && (await store.get(item.bookId));
    if (!b) return;
    await store.put({ ...b, copies: b.copies + 1, updatedAt: new Date().toISOString() });
    patchScan(item.key, { state: 'added', message: `You now have ${b.copies + 1} copies.` });
    reload();
  };

  /** Take a book off its shelf so the books after it move up a spot. */
  const takeOff = async (id: string) => {
    const all = await store.list();
    const changed = moveBook(all, id, null).filter((b) => b.id !== id);
    if (changed.length) await store.putMany(changed);
  };

  const moveTo = async (bookId: string, spot: Spot | null, index?: number) => {
    const changed = moveBook(await store.list(), bookId, spot, index);
    if (changed.length) await store.putMany(changed);
    reload();
  };

  const retryScan = (item: ScanItem) => {
    setScans((l) => l.filter((s) => s.key !== item.key));
    handleCode(item.raw);
  };

  /** A search result picked for a scan: open it ready to save, keeping the scanned ISBN. */
  const pickHit = async (hit: SearchHit) => {
    const item = searchFor;
    setSearchFor(null);
    const meta: BookMetadata = {
      ...blankMeta(),
      ...hit.metadata,
      isbn13: item?.isbn13 ?? hit.metadata.isbn13,
      isbn10: item?.isbn10 ?? hit.metadata.isbn10,
      kind: 'book',
      sources: [hit.source],
    };
    setOpen({ book: await freshBook(meta), isNew: true, scanKey: item?.key });
  };

  const openScan = async (item: ScanItem) => {
    if (item.bookId) {
      const b = await store.get(item.bookId);
      if (b) setOpen({ book: b });
    } else if (item.state === 'not-found' || item.state === 'error') {
      setOpen({ book: await freshBook(blankMeta({ isbn13: item.isbn13, isbn10: item.isbn10, barcode: item.barcode })), isNew: true, scanKey: item.key });
    }
  };

  const saveBook = async (book: Book) => {
    if (open?.isNew && (book.isbn13 || book.barcode)) {
      const dup = book.isbn13 ? await store.findByIsbn(book.isbn13) : await store.findByBarcode(book.barcode!);
      if (dup) {
        setToast(`“${dup.title}” is already in your library.`);
        setOpen({ book: dup });
        return;
      }
    }
    // Save everything but the shelf spot, then move the book so its neighbours renumber.
    const all = await store.list();
    const prev = all.find((b) => b.id === book.id);
    const wanted = book.placement;
    const base: Book = { ...book, placement: prev?.placement };
    await store.put(base);
    const samePlace = sameSpot(prev?.placement, wanted) && prev?.placement?.position === wanted?.position;
    if (!samePlace) {
      const list = [...all.filter((b) => b.id !== book.id), base];
      const changed = moveBook(list, book.id, wanted ?? null, wanted ? wanted.position - 1 : undefined);
      if (changed.length) await store.putMany(changed);
    }
    if (open?.scanKey) {
      patchScan(open.scanKey, { state: 'added', bookId: book.id, title: book.title, author: book.authors[0], message: undefined });
    }
    setToast(open?.isNew ? `Added “${book.title}”.` : 'Saved.');
    setOpen(null);
    reload();
  };

  const deleteBook = async (id: string) => {
    const b = books.find((x) => x.id === id);
    await takeOff(id);
    await store.remove(id);
    await store.removeReadingsOf(id);
    await store.removeNotesOf(id);
    await store.removeSpinsOf(id);
    setScans((l) => l.map((s) => (s.bookId === id ? { ...s, state: 'undone', message: undefined } : s)));
    setOpen(null);
    setToast(b ? `Removed “${b.title}”.` : 'Removed.');
    reload();
  };

  const refreshBook = async (book: Book) => {
    if (!book.isbn13) return;
    setToast('Looking up the latest details…');
    const r = await lookupIsbn(book.isbn13, book.isbn10);
    if (r.status !== 'found') return setToast(r.status === 'error' ? r.message : 'No details found for this ISBN.');
    const updated: Book = { ...book, ...r.metadata, id: book.id, updatedAt: new Date().toISOString() };
    await store.put(updated);
    setOpen({ book: updated });
    setToast('Details refreshed.');
    reload();
  };

  const onImport = async (file: File) => {
    try {
      const incoming = parseBackup(await file.text());
      const n = await store.importMany(incoming.books, incoming.bookcases, incoming.readings, incoming.challenges, incoming.notes, incoming.spins);
      if (incoming.styluses.length && !styluses.length) setStyluses(incoming.styluses as Stylus[]);
      setToast(`Restored ${n} book${n === 1 ? '' : 's'}.`);
      reload();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  const saveReading = async (r: Reading) => {
    setReadings((l) => [...l.filter((x) => x.id !== r.id), r]);
    await store.putReading(r);
  };
  const saveNote = async (n: BookNote) => {
    setNotes((l) => [...l.filter((x) => x.id !== n.id), n]);
    await store.putNote(n);
  };
  /** Fetch Discogs marketplace prices for records that have none or old ones, one at a time. */
  const updatePrices = async () => {
    if (priceRun) return;
    const token = !!getDiscogsToken();
    const todo = allBooks.filter((b) => isMusic(b) && (b.owned !== false || b.wishlist) && ((b.discogsId && isStale(b)) || (token && !b.discogsId && b.barcode)));
    if (!todo.length) return;
    stopPrices.current = false;
    setPriceRun({ done: 0, total: todo.length });
    const cur = marketCurrency(currency);
    let priced = 0;
    let problem = '';
    for (let i = 0; i < todo.length && !stopPrices.current; i++) {
      const b = await store.get(todo[i].id);
      if (!b) continue;
      let id = b.discogsId;
      try {
        if (!id && b.barcode) id = await discogsIdForBarcode(b.barcode);
        if (id) {
          let m;
          try {
            m = await fetchMarketPrices(id, cur, b.mediaCondition);
          } catch (err) {
            if (!/HTTP 429/.test(String(err))) throw err;
            await new Promise((r) => setTimeout(r, 15000)); // Discogs asked us to slow down
            m = await fetchMarketPrices(id, cur, b.mediaCondition);
          }
          const latest = (await store.get(b.id)) ?? b;
          const next: Book = { ...latest, discogsId: id, market: { ...m, checkedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
          await store.put(next);
          setBooks((l) => l.map((x) => (x.id === b.id ? next : x)));
          if (m.lowest !== undefined || m.suggested !== undefined) priced++;
        }
      } catch (err) {
        if (/HTTP 404/.test(String(err))) continue;
        problem = "Couldn't reach Discogs, so prices stopped updating. Try again later.";
        break;
      }
      setPriceRun({ done: i + 1, total: todo.length });
      await new Promise((r) => setTimeout(r, token ? 2200 : 2600));
    }
    setPriceRun(null);
    setToast(problem || `Updated prices for ${priced} record${priced === 1 ? '' : 's'}.`);
  };

  /** Log a play of a record: now, or on an earlier day. */
  const spinRecord = async (b: Book, at?: string) => {
    const x: Spin = { id: newId(), bookId: b.id, at: at ?? new Date().toISOString() };
    setSpins((l) => [...l, x]);
    await store.putSpin(x);
    const n = (plays.get(b.id)?.count ?? 0) + 1;
    setToast(at ? `Added a play of “${b.title}”.` : `Now spinning: “${b.title}”. That's play ${n}.`);
  };
  const removeSpin = async (id: string) => {
    setSpins((l) => l.filter((x) => x.id !== id));
    await store.removeSpin(id);
  };
  const removeNote = async (id: string) => {
    setNotes((l) => l.filter((x) => x.id !== id));
    await store.removeNote(id);
  };
  const removeReading = async (id: string) => {
    setReadings((l) => l.filter((x) => x.id !== id));
    await store.removeReading(id);
  };

  const buyFromWishlist = async (b: Book) => {
    const owned: Book = { ...b, owned: undefined, wishlist: undefined, acquiredOn: todayIsoDate(), updatedAt: new Date().toISOString() };
    if (scanSpot && !isMusic(b)) owned.placement = { ...scanSpot, position: nextPosition(await store.list(), scanSpot) };
    await store.put(owned);
    setToast(`“${b.title}” is now in your ${isMusic(b) ? 'collection' : 'library'}${owned.placement ? `, on ${label(owned)}` : ''}.`);
    reload();
  };
  const removeFromWishlist = async (b: Book) => {
    const mine = readings.filter((r) => r.bookId === b.id);
    const want = mine.filter((r) => r.status === 'want');
    for (const r of want) await store.removeReading(r.id);
    // Nothing else to remember about it: drop the book altogether.
    if (mine.length === want.length) await store.remove(b.id);
    else await store.put({ ...b, wishlist: undefined, updatedAt: new Date().toISOString() });
    setToast(`Removed “${b.title}” from your wishlist.`);
    reload();
  };
  const addWishFromSearch = async (hit: SearchHit) => {
    setWishSearch(false);
    const series = wishSeries.current;
    wishSeries.current = undefined;
    const m = hit.metadata;
    const dup = sameBook(allBooks, { isbn13: m.isbn13, title: m.title ?? '', authors: m.authors ?? [] });
    if (dup && dup.owned !== false) return setToast(`You already own “${dup.title}”. No need to buy it.`);
    if (dup) {
      await store.put({ ...dup, wishlist: true, series: dup.series ?? series, updatedAt: new Date().toISOString() });
    } else {
      const b = newBook({ ...blankMeta(), ...m, kind: 'book', sources: [hit.source] } as BookMetadata, defaultFormat);
      await store.put({ ...b, owned: false, wishlist: true, ...(series ? { series, seriesChecked: true, seriesManual: true } : {}) });
    }
    setToast(`Added “${m.title}” to your wishlist.`);
    reload();
  };

  const saveChallenge = async (c: Challenge) => {
    setChallenges((l) => [...l.filter((x) => x.id !== c.id), c]);
    await store.putChallenge(c);
  };
  const removeChallenge = async (id: string) => {
    setChallenges((l) => l.filter((x) => x.id !== id));
    await store.removeChallenge(id);
  };

  // Hand out badges whenever reading changes, and say so.
  useEffect(() => {
    if (!loaded || !challenges.length) return;
    const byId = new Map(allBooks.map((b) => [b.id, b]));
    const won: string[] = [];
    for (const c of challenges) {
      const { challenge, earned } = awardBadges(c, progressOf(c, readings, byId));
      if (earned.length) {
        saveChallenge(challenge);
        won.push(...earned.map((b) => b.name));
      }
    }
    if (won.length === 1) setToast(`Badge earned: ${won[0]}!`);
    else if (won.length > 1) setToast(`${won.length} badges earned: ${won.slice(0, 3).join(', ')}${won.length > 3 ? '…' : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, readings, allBooks, challenges]);

  const closeMenu = () => menuRef.current?.removeAttribute('open');
  const today = new Date().toISOString().slice(0, 10);

  const saveBookcase = async (bc: Bookcase) => {
    await store.putBookcase(bc);
    // Shelves or cubes that no longer exist: their books go back to the tray.
    const all = await store.list();
    const orphans = all.filter(
      (b) => b.placement?.bookcaseId === bc.id && (b.placement.shelf > bc.shelves || b.placement.section > bc.sections),
    );
    for (const o of orphans) await moveTo(o.id, null);
    if (editingCase?.isNew && !scanSpot) setDefaultSpot({ bookcaseId: bc.id, shelf: 1, section: 1 });
    setToast(editingCase?.isNew ? `Added ${bc.name}.` : 'Saved.');
    setEditingCase(null);
    reload();
  };

  const deleteBookcase = async (id: string) => {
    await store.removeBookcase(id);
    setEditingCase(null);
    setToast('Bookcase deleted. Its books are in “Not on a bookcase”.');
    reload();
  };

  const showOnShelf = (b: Book) => {
    setOpen(null);
    setView('shelves');
    setHighlightId(b.id);
    setTimeout(() => setHighlightId(undefined), 4000);
  };

  const label = (b: Book) => placeLabel(b, bookcases);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9x]/g, '');
    let list = (includeUnowned && view !== 'music' ? allBooks : books).filter(
      (b) =>
        (view === 'music' ? isMusic(b) && (kindFilter === 'all' || kindOf(b) === kindFilter) : !isMusic(b)) &&
        (view === 'music' || formatFilter === 'all' || b.format === formatFilter) &&
        (shelfFilter === 'all' || (shelfFilter === 'none' ? !label(b) : b.placement?.bookcaseId === shelfFilter)) &&
        (!lentOnly || b.loan) &&
        (view === 'music' || statusFilter === 'all' || (currentReading(readings, b.id)?.status ?? 'none') === statusFilter) &&
        (view === 'music' || matchesVibe(b, vibeFilter)),
    );
    if (q) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.subtitle?.toLowerCase().includes(q) ||
          b.authors.some((a) => a.toLowerCase().includes(q)) ||
          b.tags.some((t) => t.toLowerCase().includes(q)) ||
          b.location?.toLowerCase().includes(q) ||
          b.catalogNumber?.toLowerCase().includes(q) ||
          b.vinylColor?.toLowerCase().includes(q) ||
          b.edition?.toLowerCase().includes(q) ||
          b.matrix?.toLowerCase().includes(q) ||
          (q.length >= 3 && b.tracks?.some((t) => t.title.toLowerCase().includes(q))) ||
          label(b).toLowerCase().includes(q) ||
          b.loan?.to.toLowerCase().includes(q) ||
          (qDigits.length >= 4 && (b.isbn13?.includes(qDigits) || b.isbn10?.includes(qDigits) || b.barcode?.includes(qDigits))),
      );
    }
    const by: Record<SortKey, (a: Book, b: Book) => number> = {
      added: (a, b) => b.addedAt.localeCompare(a.addedAt),
      title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      author: (a, b) => surname(a).localeCompare(surname(b)) || a.title.localeCompare(b.title),
      published: (a, b) => year(b).localeCompare(year(a)),
      played: (a, b) => (plays.get(b.id)?.count ?? 0) - (plays.get(a.id)?.count ?? 0) || (plays.get(b.id)?.last ?? '').localeCompare(plays.get(a.id)?.last ?? ''),
    };
    return [...list].sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, allBooks, includeUnowned, bookcases, readings, query, sort, view, kindFilter, formatFilter, shelfFilter, lentOnly, statusFilter, vibeFilter, plays]);

  const totals = useMemo(() => {
    const copies = books.reduce((n, b) => n + b.copies, 0);
    const onlyBooks = books.filter((b) => !isMusic(b));
    const pages = onlyBooks.reduce((n, b) => n + (b.pageCount ?? 0), 0);
    const authors = new Set(onlyBooks.flatMap((b) => b.authors)).size;
    const vinyl = books.filter((b) => kindOf(b) === 'vinyl').length;
    const cds = books.filter((b) => kindOf(b) === 'cd').length;
    return { titles: onlyBooks.length, copies, pages, authors, vinyl, cds };
  }, [books]);

  // Everything lives in this browser only, so nudge now and then to save a copy.
  const [backupNote, setBackupNote] = useState(() => readPref(PREF_LAST_BACKUP, ''));
  const [snoozedUntil, setSnoozedUntil] = useState(() => Number(readPref(PREF_BACKUP_SNOOZE, '0')));
  const downloadBackup = () => {
    const today = new Date().toISOString().slice(0, 10);
    downloadFile(`stacks-backup-${today}.json`, JSON.stringify(makeBackup(allBooks, bookcases, readings, challenges, notes, spins, styluses), null, 2), 'application/json');
    writePref(PREF_LAST_BACKUP, today);
    setBackupNote(today);
  };
  const daysSinceBackup = backupNote ? Math.floor((Date.now() - Date.parse(backupNote)) / 86_400_000) : Infinity;
  const backupDue = !user && books.length >= 5 && daysSinceBackup >= 14 && Date.now() > snoozedUntil;

  const inBooks = BOOK_PAGES.some(([k]) => k === view);
  const booksNav = (
    <div className="subtabs-line">
      <nav className="subtabs" aria-label="Book pages">
        {BOOK_PAGES.map(([k, l]) => (
          <button key={k} className={view === k ? 'active' : ''} aria-current={view === k ? 'page' : undefined} onClick={() => setView(k)}>
            {l}
          </button>
        ))}
      </nav>
    </div>
  );
  const musicNav = (
    <div className="subtabs-line">
      <nav className="subtabs" aria-label="Music pages">
        {(
          [
            ['collection', 'Collection'],
            ['listening', 'Listening'],
            ['value', 'Value'],
            ['wantlist', 'Wantlist'],
            ['wrap', 'Year in music'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={musicTab === k ? 'active' : ''} aria-current={musicTab === k ? 'page' : undefined} onClick={() => setMusicTab(k)}>
            {l}
          </button>
        ))}
      </nav>
    </div>
  );
  const sectionCount = books.filter((b) => (view === 'music') === isMusic(b)).length;
  const sessionAdded = scans.filter((s) => s.state === 'added').length;
  const filtersOn = (view === 'music' ? kindFilter !== 'all' : formatFilter !== 'all' || statusFilter !== 'all' || vibeFilter !== 'any') || shelfFilter !== 'all' || lentOnly || query;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <h1>Stacks</h1>
        </div>
        <nav className="tabs" aria-label="Views">
          <button className={inBooks && !onPage ? 'active' : ''} onClick={() => goView(lastBooksPage)}>Books</button>
          <button className={view === 'music' && !onPage ? 'active' : ''} onClick={() => goView('music')}>Music</button>
          <button className={view === 'reading' && !onPage ? 'active' : ''} onClick={() => goView('reading')}>Reading</button>
          {user && (
            <button className={friendsOpen ? 'active' : ''} onClick={showFriends}>
              Friends{friendRequests > 0 && <span className="tab-badge" aria-label={`${friendRequests} new`}>{friendRequests}</span>}
            </button>
          )}
        </nav>
        <dl className="totals" aria-label="Library totals">
          <div><dt>Books</dt><dd>{totals.titles.toLocaleString()}</dd></div>
          {totals.vinyl + totals.cds > 0 ? (
            <>
              <div><dt>Vinyl</dt><dd>{totals.vinyl.toLocaleString()}</dd></div>
              <div><dt>CDs</dt><dd>{totals.cds.toLocaleString()}</dd></div>
            </>
          ) : (
            <>
              <div><dt>Copies</dt><dd>{totals.copies.toLocaleString()}</dd></div>
              <div><dt>Authors</dt><dd>{totals.authors.toLocaleString()}</dd></div>
            </>
          )}
          <div><dt>Pages</dt><dd>{totals.pages.toLocaleString()}</dd></div>
        </dl>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={async () => setOpen({ book: await freshBook({ ...blankMeta(), kind: view === 'music' ? 'vinyl' : 'book' }), isNew: true })}>
            Add by hand
          </button>
          <button className={`btn ghost account-btn ${user ? 'in' : ''}`} onClick={() => setAccountOpen(true)} title={user ? syncLabel(sync) : 'Sign in to sync your library'}>
            {user ? (
              <>
                {profile ? <Avatar p={profile} size={22} /> : null}
                <span className={`sync-dot ${sync.kind}`} aria-hidden="true" /> {profile ? `@${profile.username}` : 'Account'}
              </>
            ) : (
              'Sign in'
            )}
          </button>
          <details className="menu" ref={menuRef}>
            <summary className="btn ghost">Backup</summary>
            <div className="menu-pop">
              <button onClick={() => { closeMenu(); downloadBackup(); }}>
                Download backup (.json)
              </button>
              <button onClick={() => { closeMenu(); downloadFile(`stacks-library-${today}.csv`, toCsv(allBooks, label), 'text/csv'); }}>
                Export spreadsheet (.csv)
              </button>
              <button onClick={() => { closeMenu(); importRef.current?.click(); }}>Restore from backup…</button>
              <button onClick={() => { closeMenu(); setImportOpen(true); }}>Import from Goodreads or StoryGraph…</button>
              <button onClick={() => { closeMenu(); setDiscogsOpen(true); }}>Import from Discogs…</button>
              <button onClick={() => { closeMenu(); setSettingsOpen(true); }}>Lookup keys…</button>
            </div>
          </details>
          <input
            ref={importRef}
            id="import-file"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {backupDue && (
        <div className="backup-nudge" role="note">
          <p>
            <strong>{backupNote ? `Your last backup was ${daysSinceBackup} days ago.` : "You haven't backed up your library yet."}</strong>{' '}
            Your {books.length} items are stored only in this browser. Clearing browsing data or switching browsers would lose them.
          </p>
          <div className="backup-nudge-actions">
            <button className="btn primary" onClick={downloadBackup}>Download backup</button>
            <button
              className="btn ghost"
              onClick={() => {
                const until = Date.now() + 3 * 86_400_000;
                writePref(PREF_BACKUP_SNOOZE, String(until));
                setSnoozedUntil(until);
              }}
            >
              Remind me in 3 days
            </button>
          </div>
        </div>
      )}

      {profileName && (
        <ProfileView
          username={profileName}
          mine={profile}
          signedIn={!!user}
          onEdit={() => setProfileEditing(true)}
          onBack={() => showProfile(undefined)}
          onSignIn={() => setAccountOpen(true)}
          uid={user?.id}
          friends={friends}
          onFriendsChanged={refreshFriends}
        />
      )}
      {friendsOpen && !profileName && user && (
        <FriendsView
          uid={user.id}
          me={profile}
          friends={friends}
          loadError={friendsError}
          onChanged={refreshFriends}
          onOpenProfile={(n) => showProfile(n)}
          onEditProfile={() => setProfileEditing(true)}
          onBack={() => showProfile(undefined)}
        />
      )}
      <main className="layout" hidden={!!profileName || (friendsOpen && !!user)}>
        {view === 'reading' && (
          <aside className="scan-panel" aria-label="Currently reading">
            <NowReading books={allBooks} readings={readings} onOpen={(b) => setOpen({ book: b })} onChange={saveReading} active={activeSession} onStartTimer={(r, b) => setActiveSession(startSession(r, b))} />
          </aside>
        )}
        <section className="scan-panel" aria-label="Scan books" hidden={view === 'reading'}>
          {storageProblem && (
            <div className="setup-callout storage-problem" role="alert">
              <h2>Your library couldn't open</h2>
              <p>{storageProblem}</p>
            </div>
          )}
          {loaded && !storageProblem && bookcases.length === 0 && (
            <div className="setup-callout" role="note">
              <h2>Start by adding your bookcase</h2>
              <p>Tell Stacks what bookcase you have, like a black IKEA Billy, and every book you scan goes straight onto the shelf you pick, in order.</p>
              <button className="btn primary" onClick={() => setEditingCase({ bc: newBookcase('billy-80', 0), isNew: true })}>
                Add a bookcase
              </button>
              <p className="muted small">You can still scan without one. Those books wait in “Not on a bookcase”.</p>
            </div>
          )}
          <input
            ref={sinkRef}
            id="scanner-sink"
            className="scanner-sink"
            aria-label="Barcode scanner"
            tabIndex={-1}
            autoComplete="off"
            inputMode="none"
            onKeyDown={onSinkKey}
          />
          <form className={`scan-field ${flash ? 'flash' : ''}`} onSubmit={submitEntry}>
            <div className="scan-head">
              <div className="barcode" aria-hidden="true">
                {[1, 3, 1, 2, 1, 1, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 1, 4, 2, 1].map((w, i) => (
                  <i key={i} style={{ width: w * 2 }} />
                ))}
              </div>
              <div>
                {open || editingCase || searchFor || settingsOpen || accountOpen || importOpen || wishSearch !== false ? (
                  <>
                    <p className="scan-status paused"><span className="dot" /> Scanner paused</p>
                    <p className="scan-hint">Close the panel on the right to scan again.</p>
                  </>
                ) : pageFocused ? (
                  <>
                    <p className="scan-status"><span className="dot" /> Scanner ready</p>
                    <p className="scan-hint">Scan the barcode on the back of a book, record or CD. You don't need to click anything first.</p>
                  </>
                ) : (
                  <>
                    <p className="scan-status paused"><span className="dot" /> Click this page to scan</p>
                    <p className="scan-hint">Your scanner types into whichever window is active. Click anywhere on Stacks first, then scan.</p>
                  </>
                )}
              </div>
            </div>
            <label className="sr-only" htmlFor="scan-input">ISBN</label>
            <div className="scan-input-row">
              <input
                ref={scanFieldRef}
                id="scan-input"
                data-scan-input=""
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => {
                  // Some scanners end with Tab instead of Enter.
                  if (e.key === 'Tab' && entry.trim()) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                    return;
                  }
                  // Keyboard layouts like AZERTY type é, &, " on the number row; read the digit instead.
                  const d = digitOf(e);
                  if (d && d !== e.key && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    setEntry((v) => v + d);
                  }
                }}
                placeholder="Or type an ISBN, then Enter"
                inputMode="numeric"
                autoComplete="off"
              />
              <button className="btn primary" type="submit">Add</button>
            </div>
            <button
              type="button"
              className="btn camera-btn"
              onClick={() => (cameraSupported() && !cameraNeedsHttps() ? setCameraOpen(true) : setCameraNote(!cameraNote))}
            >
              <span aria-hidden="true">📷</span> Scan with camera
            </button>
            {cameraNote && (
              <p className="muted small camera-note">
                {cameraNeedsHttps()
                  ? 'Phones only let a web page use the camera when it’s opened from an https:// web address. Open Stacks from its web link instead of a saved file.'
                  : 'This browser can’t use a camera. Try Chrome or Safari.'}
              </p>
            )}
          </form>
          {cameraOpen && <CameraScanner onCode={handleCode} onClose={() => setCameraOpen(false)} />}

          <div className={`scan-target ${scanTarget}`} role="radiogroup" aria-label="Scans go to">
            <span className="scan-target-label">Scans go to</span>
            {(['library', 'wishlist'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={scanTarget === t} className={`status-option ${scanTarget === t ? 'on' : ''}`} onClick={() => setScanTarget(t)}>
                {t === 'library' ? 'My library' : 'My wishlist'}
              </button>
            ))}
          </div>
          {scanTarget === 'wishlist' ? (
            <p className="muted small wish-note">Scanned books go on your wishlist. If you already own one, Stacks tells you instead.</p>
          ) : (
          <div className="scan-defaults">
            <label className="field">
              <span>New books are</span>
              <select id="default-format" value={defaultFormat} onChange={(e) => setDefaultFormat(e.target.value as BookFormat)}>
                {Object.entries(FORMAT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>And go on</span>
              <select
                id="default-spot"
                value={scanSpot ? `${scanSpot.bookcaseId}|${scanSpot.shelf}|${scanSpot.section}` : ''}
                onChange={(e) => {
                  const [bookcaseId, shelf, section] = e.target.value.split('|');
                  setDefaultSpot(bookcaseId ? { bookcaseId, shelf: Number(shelf), section: Number(section) } : null);
                }}
              >
                <option value="">No shelf yet</option>
                {bookcases.map((bc) => (
                  <optgroup key={bc.id} label={bc.name}>
                    {allSpotsOf(bc).map((sp) => (
                      <option key={`${sp.shelf}|${sp.section}`} value={`${bc.id}|${sp.shelf}|${sp.section}`}>
                        {bc.name}: {spotName(bc, sp)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          )}

          {scanTarget === 'library' && bookcases.length > 0 && !scanSpot && (
            <p className="spot-hint">Pick a shelf under <strong>And go on</strong> so the books you scan are put on it.</p>
          )}

          <div className="session-head">
            <h2>This session</h2>
            <span className="muted">{sessionAdded ? `${sessionAdded} added` : scans.length ? '' : 'Nothing scanned yet'}</span>
            {scans.length > 0 && <button className="link" onClick={() => setScans([])}>Clear</button>}
          </div>
          {scans.length === 0 ? (
            <p className="empty-small">Each book you scan shows up here so you can check it, fix it or undo it.</p>
          ) : (
            <ol className="scan-list">
              {scans.map((s) => (
                <li key={s.key} className={`scan-item state-${s.state}`}>
                  <button
                    className="scan-thumb"
                    onClick={() => openScan(s)}
                    disabled={s.state === 'undone' || s.state === 'invalid' || s.state === 'looking'}
                    aria-label={`Open ${s.title ?? s.raw}`}
                  >
                    {s.title ? <Cover url={s.coverUrl} title={s.title} size="sm" /> : <span className="cover cover-sm cover-pending" />}
                  </button>
                  <div className="scan-body">
                    <p className="scan-title">{s.title ?? (s.isbn13 ? formatIsbn13(s.isbn13) : s.raw)}</p>
                    <p className="scan-meta">
                      <span className={`pill pill-${s.state}`}>{STATE_LABEL[s.state]}</span>
                      {s.kind && s.kind !== 'book' && <span className="kind-tag">{KIND_LABELS[s.kind].one}</span>}
                      {s.author && <span className="muted">{s.author}</span>}
                    </p>
                    {s.message && <p className="scan-msg">{s.message}</p>}
                  </div>
                  <div className="scan-actions">
                    {s.state === 'added' && <button className="link" onClick={() => undoScan(s)}>Undo</button>}
                    {s.state === 'duplicate' && <button className="link" onClick={() => addCopy(s)}>Add a copy</button>}
                    {(s.state === 'not-found' || s.state === 'error') && s.isbn13 && (
                      <button className="link" onClick={() => setSearchFor(s)}>Search by title</button>
                    )}
                    {s.state === 'not-found' && <button className="link" onClick={() => openScan(s)}>Enter details</button>}
                    {(s.state === 'error' || (s.state === 'not-found' && s.barcode)) && <button className="link" onClick={() => retryScan(s)}>Retry</button>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {view === 'wishlist' ? (
          <section className="library" aria-label="Wishlist">
            <div className="library-tools"><h2>Your books</h2>{booksNav}</div>
            <WishlistView
              books={allBooks.filter((b) => !isMusic(b))}
              readings={readings}
              placeOf={label}
              onOpen={(b) => setOpen({ book: b })}
              onBought={buyFromWishlist}
              onRemove={removeFromWishlist}
              onAddByTitle={() => {
                wishSeries.current = undefined;
                setWishSearch('');
              }}
              onScanToWishlist={() => setScanTarget((t) => (t === 'wishlist' ? 'library' : 'wishlist'))}
              scanningToWishlist={scanTarget === 'wishlist'}
            />
          </section>
        ) : view === 'reading' ? (
          <section className="library" aria-label="Reading">
            <div className="library-tools">
              <h2>Your reading</h2>
              <nav className="subtabs" aria-label="Reading pages">
                {(
                  [
                    ['overview', 'Overview'],
                    ['stats', 'Reading stats'],
                    ['notes', 'Quotes and notes'],
                    ['wrap', 'Year in books'],
                    ['achievements', 'Achievements'],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} className={readingTab === k ? 'active' : ''} aria-current={readingTab === k ? 'page' : undefined} onClick={() => setReadingTab(k)}>
                    {l}
                  </button>
                ))}
              </nav>
            </div>
            {readingTab === 'overview' && (
              <>
                {[11, 0].includes(new Date().getMonth()) && (
                  <div className="wrap-nudge">
                    <span>
                      <strong>Your {new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()} in books is ready.</strong> See your highlights and save a picture to share.
                    </span>
                    <button className="btn primary small-btn" onClick={() => setReadingTab('wrap')}>See your year</button>
                  </div>
                )}
                <ChallengesPanel challenges={challenges} books={allBooks} readings={readings} onSave={saveChallenge} onRemove={removeChallenge} />
                <ReadingView books={allBooks} readings={readings} onOpen={(b) => setOpen({ book: b })} onChange={saveReading} />
              </>
            )}
            {readingTab === 'stats' && <ReadingStats books={allBooks} readings={readings} onOpen={(b) => setOpen({ book: b })} />}
            {readingTab === 'notes' && <NotesView books={allBooks} notes={notes} onOpen={(b) => setOpen({ book: b })} onSave={saveNote} onRemove={removeNote} />}
            {readingTab === 'wrap' && <YearWrap books={allBooks} readings={readings} notes={notes} challenges={challenges} onOpen={(b) => setOpen({ book: b })} />}
            {readingTab === 'achievements' && (
              <AchievementsView books={allBooks} readings={readings} challenges={challenges} onGoToChallenges={() => setReadingTab('overview')} />
            )}
          </section>
        ) : view === 'stats' ? (
          <section className="library" aria-label="Stats">
            <div className="library-tools"><h2>Your books</h2>{booksNav}</div>
            <Stats books={books} bookcases={bookcases} onOpen={(b) => setOpen({ book: b })} />
          </section>
        ) : view === 'series' ? (
          <section className="library" aria-label="Series">
            <div className="library-tools"><h2>Your books</h2>{booksNav}</div>
            <SeriesView
              books={allBooks.filter((b) => !isMusic(b))}
              readings={readings}
              onOpen={(b) => setOpen({ book: b })}
              onUpdate={patchBook}
              onFindMissing={(name, n) => {
                wishSeries.current = { name, number: n };
                setWishSearch(`${name} ${n}`);
              }}
            />
          </section>
        ) : view === 'music' && musicTab === 'listening' ? (
          <section className="library" aria-label="Listening">
            <div className="library-tools"><h2>Your music</h2>{musicNav}</div>
            {[11, 0].includes(new Date().getMonth()) && spins.length > 0 && (
              <div className="wrap-nudge">
                <span>
                  <strong>Your {new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()} in music is ready.</strong> See your most played records and save a picture to share.
                </span>
                <button className="btn primary small-btn" onClick={() => setMusicTab('wrap')}>See your year</button>
              </div>
            )}
            <ListeningView
              records={books.filter(isMusic)}
              spins={spins}
              onSpin={(b) => spinRecord(b)}
              onOpen={(b) => setOpen({ book: b })}
              onRemoveSpin={removeSpin}
              allRecords={allBooks.filter(isMusic)}
              styluses={styluses}
              onStylusChange={setStyluses}
            />
          </section>
        ) : view === 'music' && musicTab === 'wrap' ? (
          <section className="library" aria-label="Year in music">
            <div className="library-tools"><h2>Your music</h2>{musicNav}</div>
            <MusicWrap records={allBooks.filter(isMusic)} spins={spins} onOpen={(b) => setOpen({ book: b })} />
          </section>
        ) : view === 'music' && musicTab === 'wantlist' ? (
          <section className="library" aria-label="Wantlist">
            <div className="library-tools"><h2>Your music</h2>{musicNav}</div>
            <WishlistView
              music
              books={allBooks.filter(isMusic)}
              readings={readings}
              placeOf={label}
              onOpen={(b) => setOpen({ book: b })}
              onBought={buyFromWishlist}
              onRemove={removeFromWishlist}
              onAddByTitle={async () => setOpen({ book: { ...(await freshBook({ ...blankMeta(), kind: 'vinyl' })), placement: undefined, owned: false, wishlist: true }, isNew: true })}
              onImportDiscogs={() => {
                setDiscogsWants(true);
                setDiscogsOpen(true);
              }}
              onScanToWishlist={() => setScanTarget((t) => (t === 'wishlist' ? 'library' : 'wishlist'))}
              scanningToWishlist={scanTarget === 'wishlist'}
            />
          </section>
        ) : view === 'music' && musicTab === 'value' ? (
          <section className="library" aria-label="Value">
            <div className="library-tools"><h2>Your music</h2>{musicNav}</div>
            <ValueView
              records={books.filter(isMusic)}
              currency={marketCurrency(currency)}
              hasToken={!!getDiscogsToken()}
              run={priceRun}
              onUpdate={updatePrices}
              onStop={() => {
                stopPrices.current = true;
              }}
              onOpen={(b) => setOpen({ book: b })}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </section>
        ) : view === 'shelves' ? (
          <section className="library" aria-label="Shelves">
            <div className="library-tools">
              <h2>Your books</h2>
              {booksNav}
              <p className="muted small">Drag books to rearrange them. Click a book to see or edit it.</p>
            </div>
            <ShelvesView
              books={books}
              bookcases={bookcases}
              highlightId={highlightId}
              onOpenBook={(b) => setOpen({ book: b })}
              onMove={moveTo}
              onAddBookcase={() => setEditingCase({ bc: newBookcase('billy-80', bookcases.length), isNew: true })}
              onEditBookcase={(bc) => setEditingCase({ bc, isNew: false })}
            />
          </section>
        ) : (
          <section className="library" aria-label={view === 'music' ? 'Your music' : 'Your books'}>
            <div className="library-tools">
              <h2>{view === 'music' ? 'Your music' : 'Your books'}</h2>
              {view === 'music' ? musicNav : booksNav}
              <input
                id="search"
                type="search"
                className="search"
                placeholder="Search title, author, artist, tag, shelf or barcode"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {view === 'music' ? (
                <select id="filter-kind" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as ItemKind | 'all')} aria-label="Type">
                  <option value="all">Vinyl and CDs</option>
                  <option value="vinyl">Vinyl</option>
                  <option value="cd">CDs</option>
                </select>
              ) : (
                <select id="filter-format" value={formatFilter} onChange={(e) => setFormatFilter(e.target.value as BookFormat | 'all')} aria-label="Format">
                  <option value="all">All book formats</option>
                  {Object.entries(FORMAT_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              )}
              <select id="filter-shelf" value={shelfFilter} onChange={(e) => setShelfFilter(e.target.value)} aria-label="Shelf">
                <option value="all">All bookcases</option>
                {bookcases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="none">Not on a bookcase</option>
              </select>
              {view !== 'music' && (
                <select id="filter-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ReadStatus | 'none' | 'all')} aria-label="Reading status">
                  <option value="all">Any reading status</option>
                  {(Object.keys(STATUS_LABELS) as ReadStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}
                  <option value="none">No status yet</option>
                </select>
              )}
              {view !== 'music' && <VibeSelect id="filter-vibe" value={vibeFilter} onChange={setVibeFilter} />}
              {view !== 'music' && allBooks.length > books.length && (
                <label className="check">
                  <input id="filter-unowned" type="checkbox" checked={includeUnowned} onChange={(e) => setIncludeUnowned(e.target.checked)} />
                  Read but not owned
                </label>
              )}
              <label className="check">
                <input id="filter-lent" type="checkbox" checked={lentOnly} onChange={(e) => setLentOnly(e.target.checked)} />
                Lent out
              </label>
              <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
                <option value="added">Recently added</option>
                <option value="title">Title A–Z</option>
                <option value="author">{view === 'music' ? 'Artist A–Z' : 'Author A–Z'}</option>
                <option value="published">Newest published</option>
                {view === 'music' && <option value="played">Most played</option>}
              </select>
            </div>
            {filtersOn && sectionCount > 0 && (
              <p className="result-count muted">
                Showing {shown.length} of {sectionCount}
              </p>
            )}

            {loaded && view === 'music' && sectionCount === 0 ? (
              <div className="empty">
                <h3>No records or CDs yet</h3>
                <p>Scan the barcode on the back of a record or CD, the same way you scan books. Stacks looks it up on MusicBrainz, Deezer and iTunes (and Discogs, if you add a token) and adds it here.</p>
                <p>
                  Already keep your records on Discogs?{' '}
                  <button className="btn primary small-btn" onClick={() => setDiscogsOpen(true)}>Import your Discogs collection</button>
                </p>
                <p className="muted">
                  No barcode, or it isn't found?{' '}
                  <button className="link" onClick={async () => setOpen({ book: await freshBook({ ...blankMeta(), kind: 'vinyl' }), isNew: true })}>
                    Add a record or CD by hand
                  </button>
                </p>
              </div>
            ) : loaded && books.length === 0 ? (
              <div className="empty">
                <div className="empty-shelf" aria-hidden="true"><i /><i /><i /><i /><i /></div>
                <h3>Your shelves are empty</h3>
                <p>Plug in your barcode scanner and scan the first book from your stack. It lands here with its cover, author and page count filled in.</p>
                <p className="muted">No scanner handy? Type the 13-digit ISBN printed above the barcode into the box on the left.</p>
              </div>
            ) : shown.length === 0 ? (
              <div className="empty"><p>{view === 'music' ? 'Nothing matches these filters.' : sectionCount === 0 ? 'No books yet. Your records and CDs are under Music.' : 'No books match these filters.'}</p></div>
            ) : (
              <ul className="grid">
                {shown.map((b) => (
                  <li key={b.id}>
                    <button className="book" onClick={() => setOpen({ book: b })}>
                      <span className={`book-cover${kindOf(b) === 'vinyl' && discBackground(b.vinylColor) ? ' has-disc' : ''}`}>
                        {kindOf(b) === 'vinyl' && discBackground(b.vinylColor) && (
                          <span className="card-disc" style={{ background: `radial-gradient(circle, var(--surface) 0 3%, #e9e2cf 4% 15%, transparent 16%), ${discBackground(b.vinylColor)}` }} title={b.vinylColor} />
                        )}
                        <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} square={isMusic(b)} />
                        {b.copies > 1 && <span className="badge">×{b.copies}</span>}
                      </span>
                      <span className="book-title">{b.title}</span>
                      <span className="book-author">{b.authors.join(', ') || 'Unknown author'}</span>
                      {b.series && <span className="book-series">{seriesLabel(b.series)}</span>}
                      <span className="book-pages">
                        {isMusic(b)
                          ? [KIND_LABELS[kindOf(b)].one, b.trackCount && `${b.trackCount} tracks`, b.publishedDate?.slice(0, 4), b.mediaCondition && [gradeShort(b.mediaCondition), gradeShort(b.sleeveCondition)].filter(Boolean).join('/'), plays.get(b.id) && `${plays.get(b.id)!.count} ${plays.get(b.id)!.count === 1 ? 'play' : 'plays'}`].filter(Boolean).join(' · ')
                          : b.pageCount ? `${b.pageCount.toLocaleString()} pages` : 'Pages unknown'}
                      </span>
                      {(() => {
                        // Found by a song title: say which song.
                        const q = query.trim().toLowerCase();
                        if (q.length < 3 || !b.tracks || b.title.toLowerCase().includes(q) || b.authors.some((a) => a.toLowerCase().includes(q))) return null;
                        const t = b.tracks.find((x) => x.title.toLowerCase().includes(q));
                        return t ? <span className="book-track-hit">♪ {t.position ? `${t.position} ` : ''}{t.title}</span> : null;
                      })()}
                      {b.placement && label(b) && <span className="book-place">{label(b)}</span>}
                      {b.loan && <span className="book-loan">Lent to {b.loan.to}</span>}
                      {(() => {
                        const r = !isMusic(b) && currentReading(readings, b.id);
                        if (!r) return null;
                        const pct = r.status === 'reading' ? progressPct(r, b) : undefined;
                        return (
                          <span className={`book-status status-${r.status}`}>
                            {STATUS_LABELS[r.status]}
                            {pct !== undefined && ` · ${pct}%`}
                          </span>
                        );
                      })()}
                    </button>
                    {isMusic(b) && (
                      <button className="card-spin" onClick={() => spinRecord(b)} aria-label={`Spin ${b.title}`} title="Spin it: log a play now">
                        ▶
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {activeSession && (
        <TimerBar
          active={activeSession}
          book={allBooks.find((b) => b.id === activeSession.bookId)}
          reading={readings.find((r) => r.id === activeSession.readingId)}
          onChange={setActiveSession}
          onSave={saveReading}
        />
      )}
      {open && (
        <BookDrawer
          book={open.book}
          isNew={open.isNew}
          onSave={saveBook}
          onDelete={deleteBook}
          onRefresh={refreshBook}
          onShowOnShelf={showOnShelf}
          onClose={() => setOpen(null)}
          books={books}
          bookcases={bookcases}
          defaultCurrency={currency}
          onCurrencyChange={setCurrency}
          readings={readingsOf(readings, open.book.id)}
          onReadingChange={saveReading}
          onReadingRemove={removeReading}
          notes={notes.filter((n) => n.bookId === open.book.id)}
          onNoteSave={saveNote}
          onNoteRemove={removeNote}
          spins={spins.filter((x) => x.bookId === open.book.id)}
          onSpin={(at) => spinRecord(open.book, at)}
          onSpinRemove={removeSpin}
          onQuickSave={async (patch) => {
            const cur = await store.get(open.book.id);
            if (cur) await patchBook({ ...cur, ...patch });
          }}
          seriesNames={[...new Set(allBooks.map((b) => b.series?.name).filter((n): n is string => !!n))].sort()}
        />
      )}

      {searchFor && (
        <SearchDialog
          isbn13={searchFor.isbn13}
          onPick={pickHit}
          onOpenSettings={() => setSettingsOpen(true)}
          onClose={() => setSearchFor(null)}
        />
      )}

      {wishSearch !== false && (
        <SearchDialog initialQuery={wishSearch} onPick={addWishFromSearch} onOpenSettings={() => setSettingsOpen(true)} onClose={() => setWishSearch(false)} />
      )}

      {importOpen && (
        <ImportDialog
          books={allBooks}
          readings={readings}
          notes={notes}
          defaultFormat={defaultFormat}
          onClose={() => setImportOpen(false)}
          onImport={async (plan: ImportPlan) => {
            await store.importMany([...plan.newBooks, ...plan.updatedBooks], [], plan.readings, [], plan.notes);
            await reload();
            setImportOpen(false);
            setView('reading');
            setToast(`Imported ${plan.readings.length} reads and ${plan.newBooks.length} new books.`);
          }}
        />
      )}

      {discogsOpen && (
        <DiscogsImport
          books={allBooks}
          wantlist={discogsWants}
          onClose={() => {
            setDiscogsOpen(false);
            setDiscogsWants(false);
          }}
          onImport={async (plan: DiscogsPlan) => {
            await store.putMany([...plan.newBooks, ...plan.updated]);
            await reload();
            setDiscogsOpen(false);
            setDiscogsWants(false);
            const wanted = plan.newBooks.some((b) => b.owned === false);
            setView('music');
            setMusicTab(wanted ? 'wantlist' : 'collection');
            setToast(
              wanted
                ? `Added ${plan.newBooks.length} record${plan.newBooks.length === 1 ? '' : 's'} to your wantlist${plan.alreadyOwned.length ? `. ${plan.alreadyOwned.length} you already own were left off` : ''}.`
                : `Imported ${plan.newBooks.length} record${plan.newBooks.length === 1 ? '' : 's'} from Discogs${plan.updated.length ? ` and updated ${plan.updated.length} you already had` : ''}.`,
            );
          }}
        />
      )}

      {accountOpen && (
        <AccountDialog
          user={user}
          sync={sync}
          recovering={recovering}
          profile={profile}
          onEditProfile={() => setProfileEditing(true)}
          onViewProfile={() => {
            setAccountOpen(false);
            if (profile) showProfile(profile.username);
          }}
          onClose={() => {
            setAccountOpen(false);
            setRecovering(false);
          }}
          onSignedOut={() => {
            setAccountOpen(false);
            void reload();
            setStylusList(loadStyluses());
            setToast('Signed out.');
          }}
        />
      )}

      {profileEditing && user && (
        <ProfileEditor
          uid={user.id}
          email={user.email}
          profile={profile}
          books={allBooks}
          makeShowcase={(top) => buildShowcase(allBooks, readings, spins, top)}
          onClose={() => setProfileEditing(false)}
          onSaved={(p) => {
            setProfile(p);
            setProfileEditing(false);
            setAccountOpen(false);
            showProfile(p.username);
            setToast('Profile saved.');
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            setToast('Saved. Press Retry on any scan that failed.');
          }}
        />
      )}

      {editingCase && (
        <BookcaseEditor
          bookcase={editingCase.bc}
          isNew={editingCase.isNew}
          bookCount={books.filter((b) => b.placement?.bookcaseId === editingCase.bc.id).length}
          onSave={saveBookcase}
          onDelete={deleteBookcase}
          onClose={() => setEditingCase(null)}
        />
      )}

      <div className="toast" role="status" aria-live="polite" hidden={!toast}>{toast}</div>
    </div>
  );
}
