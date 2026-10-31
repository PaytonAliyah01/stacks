import { useEffect, useRef, useState } from 'react';
import { ago, markNotifsRead, readNotifs, type Notif, type NotifTarget } from '../lib/notifications';

/** The bell in the top bar: everything waiting for you, in one list. */
export function NotificationBell({ notifs, onGo }: { notifs: Notif[]; onGo: (t: NotifTarget) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [read, setRead] = useState(readNotifs);
  const [now, setNow] = useState(Date.now());
  const unread = notifs.filter((n) => !read.has(n.id));

  // Close when you click outside or press Escape.
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  const mark = (ids: string[]) => {
    markNotifsRead(ids);
    setRead(readNotifs());
  };
  const go = (n: Notif) => {
    mark([n.id]);
    if (ref.current) ref.current.open = false;
    onGo(n.target);
  };

  return (
    <details className="menu notif-menu" ref={ref} onToggle={() => setNow(Date.now())}>
      <summary className="btn ghost notif-bell" aria-label={unread.length ? `Notifications, ${unread.length} new` : 'Notifications'} title="Notifications">
        <span aria-hidden="true">🔔</span>
        {unread.length > 0 && <span className="tab-badge">{unread.length > 99 ? '99+' : unread.length}</span>}
      </summary>
      <div className="menu-pop notif-pop" role="dialog" aria-label="Notifications">
        <div className="notif-head">
          <strong>Notifications</strong>
          {unread.length > 0 && (
            <button className="link-btn" onClick={() => mark(unread.map((n) => n.id))}>
              Mark all as read
            </button>
          )}
        </div>
        {notifs.length === 0 ? (
          <p className="notif-empty">You're all caught up. Friend requests, borrow asks, invites and new releases will show up here.</p>
        ) : (
          <ul className="notif-list">
            {notifs.map((n) => {
              const isNew = !read.has(n.id);
              return (
                <li key={n.id}>
                  <button className={`notif ${isNew ? 'new' : ''}`} onClick={() => go(n)}>
                    <span className="notif-icon" aria-hidden="true">{n.icon}</span>
                    <span className="notif-body">
                      <span className="notif-text">{n.text}</span>
                      {n.detail && <span className="notif-detail">{n.detail}</span>}
                      <span className="notif-meta">
                        {n.action && <span className="notif-todo">Needs you</span>}
                        {ago(n.at, now)}
                      </span>
                    </span>
                    {isNew && <span className="notif-dot" aria-label="new" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
