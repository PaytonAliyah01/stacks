
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LETTERS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'narrow' }));

interface ShareProps {
  sharing: string;
  save: () => void;
  copy: () => void;
  disabled: boolean;
}

export function ShareButtons({ sharing, save, copy, disabled }: Readonly<ShareProps>) {
  return (
    <div className="wrap-share">
      <button className="btn primary small-btn" onClick={save} disabled={disabled}>Save picture</button>
      <button className="btn ghost small-btn wrap-ghost" onClick={copy} disabled={disabled}>Copy picture</button>
      {sharing && <span className="small">{sharing}</span>}
    </div>
  );
}

interface YearProps {
  intro: string;
  year: string;
  years: string[];
  onYear: (y: string) => void;
}

export function WrapYearPicker({ intro, year, years, onYear }: Readonly<YearProps>) {
  return (
    <div className="finished-head">
      <p className="muted">{intro}</p>
      <select value={year} onChange={(e) => onYear(e.target.value)} aria-label="Year">
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

interface MonthProps {
  perMonth: number[];
  /** "book" or "spin". */
  unit: string;
  label: string;
}

export function MonthBars({ perMonth, unit, label }: Readonly<MonthProps>) {
  const peak = Math.max(1, ...perMonth);
  return (
    <div className="wrap-months" aria-label={label}>
      {perMonth.map((n, i) => (
        <div key={MONTH_KEYS[i]} className="wrap-month" title={`${n} ${unit}${n === 1 ? '' : 's'}`}>
          <span className="wrap-bar" style={{ height: `${(n / peak) * 100}%` }}>{n > 0 && <b>{n}</b>}</span>
          <span className="wrap-m">{MONTH_LETTERS[i]}</span>
        </div>
      ))}
    </div>
  );
}
