import { useState } from 'react';

function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + (s.codePointAt(i) ?? 0)) % 360;
  return h;
}

export function Cover({ url, title, author, size = 'md', square = false }: { url?: string; title: string; author?: string; size?: 'sm' | 'md' | 'lg'; square?: boolean }) {
  const shape = square ? ' cover-square' : '';
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        className={`cover cover-${size}${shape}`}
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={(e) => {
          // Open Library returns a 1x1 pixel when it has no cover.
          if ((e.currentTarget as HTMLImageElement).naturalWidth < 5) setFailed(true);
        }}
      />
    );
  }
  return (
    <div className={`cover cover-${size}${shape} cover-blank`} style={{ ['--h' as string]: hue(title) }} aria-hidden="true">
      <span className="cover-blank-title">{title}</span>
      {author && <span className="cover-blank-author">{author}</span>}
    </div>
  );
}
