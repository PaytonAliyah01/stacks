import { MOODS, PACES, cap } from '../lib/moods';

/** One dropdown for filtering by mood or pace. */
export function VibeSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Mood or pace">
      <option value="any">Any mood or pace</option>
      <optgroup label="Mood">
        {MOODS.map((m) => <option key={m} value={`mood:${m}`}>{cap(m)}</option>)}
      </optgroup>
      <optgroup label="Pace">
        {PACES.map((p) => <option key={p} value={`pace:${p}`}>{cap(p)} paced</option>)}
      </optgroup>
    </select>
  );
}
