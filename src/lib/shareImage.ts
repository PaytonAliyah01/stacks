import type { Book } from '../types';
import { paintBackdrop, paintSpines } from './backdrop';
import { shortTitle, type Wrap } from './wrapup';
import type { MusicWrap } from './musicwrap';

// The 1080×1350 share pictures for the year wrap-ups: the size Instagram and most chats show whole.
const W = 1080;
const H = 1350;
const SERIF = "Literata, Georgia, 'Times New Roman', serif";
const SANS = 'system-ui, -apple-system, Segoe UI, sans-serif';
const MONTH_LETTERS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'narrow' }));

export function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + (s.codePointAt(i) ?? 0)) % 360;
  return h;
}

export const loadImage = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => resolve(null), 4000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img.naturalWidth > 5 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.src = url;
  });

interface Palette {
  ink: string;
  soft: string;
  gold: string;
}

function newCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return [c, c.getContext('2d')!];
}

const toPng = (c: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'));

function drawHeading(g: CanvasRenderingContext2D, p: Palette, year: string, what: string) {
  g.fillStyle = p.gold;
  g.font = `600 34px ${SANS}`;
  g.fillText('STACKS', 80, 110);
  g.fillStyle = p.ink;
  g.font = `600 92px ${SERIF}`;
  g.fillText(`My ${year}`, 80, 220);
  g.fillText(what, 80, 320);
}

function drawStat(g: CanvasRenderingContext2D, p: Palette, top: number, x: number, value: string, label: string) {
  g.fillStyle = p.ink;
  g.font = `700 88px ${SERIF}`;
  g.fillText(value, x, top);
  g.fillStyle = p.soft;
  g.font = `500 30px ${SANS}`;
  g.fillText(label, x, top + 45);
}

interface Tile {
  width: number;
  height: number;
  font: number;
  pad: number;
  first: number;
  lineHeight: number;
  bottom: number;
}

/** A colored block with the title written on it, for a cover the image server won't share. */
function drawBlankCover(g: CanvasRenderingContext2D, p: Palette, title: string, x: number, y: number, t: Tile) {
  g.fillStyle = `hsl(${hue(title)} 35% 38%)`;
  g.fillRect(x, y, t.width, t.height);
  g.fillStyle = p.ink;
  g.font = `600 ${t.font}px ${SERIF}`;
  let line = '';
  let ly = y + t.first;
  const last = y + t.height - t.bottom;
  for (const word of title.split(' ')) {
    if (g.measureText(`${line} ${word}`).width > t.width - t.pad * 2 && line) {
      g.fillText(line, x + t.pad, ly);
      line = word;
      ly += t.lineHeight;
      if (ly > last) break;
    } else line = line ? `${line} ${word}` : word;
  }
  if (ly <= last) g.fillText(line, x + t.pad, ly);
}

/** Covers in rows of six: real ones where the image server allows it, colored blocks otherwise. */
async function drawCovers(g: CanvasRenderingContext2D, p: Palette, items: { b: Book; title: string }[], top: number, t: Tile, gap: number) {
  const imgs = await Promise.all(items.map(({ b }) => (b.coverUrl ? loadImage(b.coverUrl) : Promise.resolve(null))));
  items.forEach(({ title }, i) => {
    const x = 80 + (i % 6) * (t.width + gap);
    const y = top + Math.floor(i / 6) * (t.height + gap);
    const img = imgs[i];
    if (img) g.drawImage(img, x, y, t.width, t.height);
    else drawBlankCover(g, p, title, x, y, t);
  });
}

/** Label and value rows, cut short with "…" when a value is too wide. Rows below `stopAt` are left out. */
function drawRows(g: CanvasRenderingContext2D, p: Palette, rows: [string, string][], start: number, stopAt: number): number {
  let y = start;
  for (const [label, value] of rows) {
    if (y > stopAt) break;
    g.fillStyle = p.soft;
    g.font = `500 28px ${SANS}`;
    g.fillText(label.toUpperCase(), 80, y);
    g.fillStyle = p.ink;
    g.font = `600 38px ${SERIF}`;
    let v = value;
    while (g.measureText(v).width > W - 160 - 300 && v.length > 4) v = v.slice(0, -2);
    g.fillText(v === value ? v : `${v}…`, 380, y);
    y += 66;
  }
  return y;
}

/** Bars per month along the bottom. */
function drawMonthBars(g: CanvasRenderingContext2D, p: Palette, perMonth: number[], tallest: number) {
  const peak = Math.max(1, ...perMonth);
  const bw = 58;
  const step = (W - 160 - bw) / 11;
  perMonth.forEach((n, i) => {
    const x = 80 + i * step;
    const h = Math.max(4, (n / peak) * tallest);
    g.fillStyle = n ? p.gold : 'rgba(255,255,255,0.15)';
    g.fillRect(x, 1270 - h, bw, h);
    g.fillStyle = p.soft;
    g.font = `500 24px ${SANS}`;
    g.textAlign = 'center';
    g.fillText(MONTH_LETTERS[i], x + bw / 2, 1305);
    g.textAlign = 'left';
  });
}

const stars = (n?: number) => (n ? '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') : '');
const BOOK_PALETTE: Palette = { ink: '#f3efe4', soft: '#b9c8bf', gold: '#d8ad55' };

/** Where the label rows start, under however many rows of covers there are. */
function rowsStart(covers: number, none: number, oneRow: number, twoRows: number) {
  if (!covers) return none;
  return covers > 6 ? twoRows : oneRow;
}

/** The year in books as a picture. */
export async function drawYearImage(w: Wrap): Promise<Blob | null> {
  const [c, g] = newCanvas();
  const p = BOOK_PALETTE;
  paintBackdrop(g, W, H, 'books');
  paintSpines(g, W - 110, 330);
  drawHeading(g, p, w.year, 'in books');
  drawStat(g, p, 470, 80, w.books.toLocaleString(), w.books === 1 ? 'book' : 'books');
  drawStat(g, p, 470, 400, w.pages.toLocaleString(), 'pages');
  if (w.minutes) drawStat(g, p, 470, 760, String(Math.round(w.minutes / 60)), 'hours');

  const shown = w.covers.slice(-12);
  await drawCovers(g, p, shown.map((b) => ({ b, title: shortTitle(b) })), 580, { width: 140, height: 210, font: 20, pad: 12, first: 34, lineHeight: 26, bottom: 20 }, 18);

  const rows: [string, string][] = [];
  if (w.favorite) rows.push(['Favorite', `${shortTitle(w.favorite.book)} ${stars(w.favorite.rating)}`]);
  if (w.moods.length) rows.push(['Mood', w.moods.map(([m]) => m).join(', ')]);
  if (w.topAuthor && w.topAuthor[1] > 1) rows.push(['Top author', w.topAuthor[0]]);
  if (w.challenge) rows.push(['Challenge', `${w.challenge.done.toLocaleString()} of ${w.challenge.goal.toLocaleString()} ${w.challenge.unit}`]);
  if (w.longest) rows.push(['Longest', `${shortTitle(w.longest)}, ${w.longest.pageCount} pages`]);
  const end = drawRows(g, p, rows, rowsStart(shown.length, 600, 870, 1080), H - 80);

  // Books per month along the bottom, when there's room.
  if (end < 1150) drawMonthBars(g, p, w.perMonth, 110);
  return toPng(c);
}

const MUSIC_PALETTE: Palette = { ink: '#f4ede2', soft: '#c3b5c9', gold: '#e0b65a' };
export const hoursText = (h: number) => (h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString());

/** A record in the top corner of the music picture. */
function drawRecord(g: CanvasRenderingContext2D, gold: string) {
  const cx = W - 150;
  const cy = 170;
  const disc = (r: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  };
  disc(230, '#0f0c12');
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let r = 90; r < 225; r += 9) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  disc(72, gold);
  disc(8, '#0f0c12');
}

/** The year in music as a picture. */
export async function drawMusicImage(w: MusicWrap): Promise<Blob | null> {
  const [c, g] = newCanvas();
  const p = MUSIC_PALETTE;
  paintBackdrop(g, W, H, 'music');
  drawRecord(g, p.gold);
  drawHeading(g, p, w.year, 'in music');
  drawStat(g, p, 480, 80, w.spins.toLocaleString(), w.spins === 1 ? 'spin' : 'spins');
  drawStat(g, p, 480, 400, hoursText(w.hours), 'hours');
  drawStat(g, p, 480, 720, w.records.toLocaleString(), w.records === 1 ? 'record' : 'records');

  const shown = w.topRecords.slice(0, 12).map((x) => x.b);
  await drawCovers(g, p, shown.map((b) => ({ b, title: b.title })), 590, { width: 140, height: 140, font: 19, pad: 11, first: 32, lineHeight: 24, bottom: 16 }, 18);

  const rows: [string, string][] = [];
  const top = w.topRecords[0];
  if (top) rows.push(['On repeat', `${top.b.title} (${top.n}×)`]);
  if (w.topArtists[0]) rows.push(['Top artist', w.topArtists[0][0]]);
  if (w.added.length) rows.push(['New in', `${w.added.length} record${w.added.length === 1 ? '' : 's'}`]);
  if (w.longestStreak > 1) rows.push(['Streak', `${w.longestStreak} days in a row`]);
  drawRows(g, p, rows, rowsStart(shown.length, 620, 812, 970), H - 200);

  drawMonthBars(g, p, w.perMonth, 100);
  return toPng(c);
}

/** Saves a picture to the downloads folder. */
export function downloadPicture(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
