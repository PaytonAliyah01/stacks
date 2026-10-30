import { useMemo } from 'react';
import type { Book, Challenge, Reading } from '../types';
import { achievementsOf } from '../lib/achievements';
import { BADGES } from '../lib/challenges';
import { formatDay } from '../lib/reading';

interface Props {
  books: Book[];
  readings: Reading[];
  challenges: Challenge[];
  onGoToChallenges: () => void;
}

function Medal({ mark, name, earnedOn, description, progress }: { mark: string; name: string; earnedOn: string | null; description: string; progress?: { now: number; target: number } }) {
  const pct = progress ? Math.min(100, Math.round((progress.now / progress.target) * 100)) : undefined;
  return (
    <li className={`achievement ${earnedOn ? 'earned' : 'locked'}`}>
      <span className="medal" aria-hidden="true">{mark}</span>
      <span className="achievement-text">
        <strong>{name}</strong>
        <span className="muted small">{description}</span>
        {earnedOn ? (
          <span className="earned-on">Earned {formatDay(earnedOn)}</span>
        ) : pct !== undefined ? (
          <span className="achievement-progress">
            <span className="progress-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
            <span className="muted small">{progress!.now.toLocaleString()} / {progress!.target.toLocaleString()}</span>
          </span>
        ) : (
          <span className="muted small">Not yet</span>
        )}
      </span>
    </li>
  );
}

export function AchievementsView({ books, readings, challenges, onGoToChallenges }: Props) {
  const lifetime = useMemo(() => achievementsOf(books, readings), [books, readings]);
  const groups = [...new Set(lifetime.map((a) => a.group))];
  const earnedLifetime = lifetime.filter((a) => a.earnedOn).length;
  const earnedBadges = challenges.reduce((n, c) => n + Object.keys(c.badges).length, 0);
  const recent = [
    ...lifetime.filter((a) => a.earnedOn).map((a) => ({ key: a.id, name: a.name, mark: a.mark, on: a.earnedOn!, where: 'Lifetime' })),
    ...challenges.flatMap((c) =>
      Object.entries(c.badges).map(([id, on]) => {
        const b = BADGES.find((x) => x.id === id);
        return { key: `${c.id}:${id}`, name: b?.name ?? id, mark: b?.mark ?? '•', on, where: c.name };
      }),
    ),
  ]
    .sort((a, b) => b.on.localeCompare(a.on))
    .slice(0, 6);

  return (
    <div className="reading-view">
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Lifetime achievements</span>
          <span className="stat-value">{earnedLifetime} / {lifetime.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Challenge badges</span>
          <span className="stat-value">{earnedBadges} / {challenges.length * BADGES.length}</span>
          <span className="muted">across {challenges.length} challenge{challenges.length === 1 ? '' : 's'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Latest</span>
          <span className="stat-value small">{recent[0]?.name ?? '–'}</span>
          <span className="muted">{recent[0] ? `${formatDay(recent[0].on)} · ${recent[0].where}` : 'finish a book to start'}</span>
        </div>
      </div>

      {recent.length > 0 && (
        <section className="panel">
          <h3>Recently earned</h3>
          <ul className="badges">
            {recent.map((r) => (
              <li key={r.key} className="badge-medal earned" title={`${r.where}, ${formatDay(r.on)}`}>
                <span className="medal" aria-hidden="true">{r.mark}</span>
                <span className="medal-name">{r.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map((g) => (
        <section key={g} className="panel">
          <h3>{g}</h3>
          <ul className="achievement-grid">
            {lifetime.filter((a) => a.group === g).map((a) => <Medal key={a.id} {...a} />)}
          </ul>
        </section>
      ))}

      <section className="panel">
        <div className="finished-head">
          <h3>Challenge badges</h3>
          <button className="btn ghost small-btn" onClick={onGoToChallenges}>{challenges.length ? 'See challenges' : '+ Start a challenge'}</button>
        </div>
        {challenges.length === 0 && <p className="muted">Start a challenge to earn its ten badges.</p>}
        {challenges.map((c) => (
          <div key={c.id} className="challenge-badges">
            <strong className="challenge-name">{c.name}</strong>
            <ul className="achievement-grid">
              {BADGES.map((b) => (
                <Medal key={b.id} mark={b.mark} name={b.name} description={b.description(c)} earnedOn={c.badges[b.id] ?? null} />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
