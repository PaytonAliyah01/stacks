/** Rich backgrounds for the year wrap-up share pictures: a deep gradient, soft glows of light and a fine grain. */
export function paintBackdrop(g: CanvasRenderingContext2D, W: number, H: number, kind: 'books' | 'music') {
  const pal =
    kind === 'books'
      ? { from: '#1f4438', to: '#0d1f1a', glowA: 'rgba(216,173,85,0.30)', glowB: 'rgba(86,170,140,0.28)' }
      : { from: '#3a2148', to: '#140e1a', glowA: 'rgba(224,182,90,0.24)', glowB: 'rgba(200,70,140,0.30)' };
  const lin = g.createLinearGradient(0, 0, W * 0.4, H);
  lin.addColorStop(0, pal.from);
  lin.addColorStop(1, pal.to);
  g.fillStyle = lin;
  g.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, c: string) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, c);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  };
  glow(W * 0.95, H * 0.02, W * 0.75, pal.glowA);
  glow(0, H * 0.85, W * 0.8, pal.glowB);
  // Fine grain, the same every time.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    g.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
}

/** A little stack of book spines, for the top corner of the books picture. */
export function paintSpines(g: CanvasRenderingContext2D, right: number, bottom: number) {
  const spines: [number, number, string][] = [
    [34, 230, '#d8ad55'],
    [26, 270, '#7a3b4a'],
    [40, 210, '#3f7f6c'],
    [22, 250, '#e9dfc8'],
    [36, 285, '#a5583a'],
    [30, 235, '#2f5a8a'],
  ];
  let x = right - spines.reduce((s, [w]) => s + w + 6, 0);
  g.save();
  g.globalAlpha = 0.9;
  for (const [w, h, c] of spines) {
    g.fillStyle = c;
    g.fillRect(x, bottom - h, w, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x, bottom - h + 22, w, 6);
    g.fillRect(x, bottom - 34, w, 6);
    x += w + 6;
  }
  // The one leaning at the end.
  g.translate(x + 4, bottom);
  g.rotate(0.22);
  g.fillStyle = '#c98f3a';
  g.fillRect(0, -240, 32, 240);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, -218, 32, 6);
  g.restore();
}
