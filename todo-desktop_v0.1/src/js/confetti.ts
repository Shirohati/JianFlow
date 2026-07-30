const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const CONFETTI_CLASS = 'cf-particle';

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

let container: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement('div');
    container.id = 'cf-container';
    container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
    document.body.appendChild(container);
  }
  return container;
}

export function triggerConfetti(count: number = 80) {
  const c = getContainer();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cx = w / 2;
  const cy = h * 0.35;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = CONFETTI_CLASS;
    const size = rand(6, 10);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const angle = rand(-Math.PI, Math.PI);
    const speed = rand(300, 700);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 200;
    const rot = rand(0, 720);
    const rotSpeed = rand(-360, 360);
    const dur = rand(1.5, 3);
    const shape = Math.random() > 0.5 ? '50%' : '0';

    el.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:${size}px;height:${size * rand(0.6, 1.4)}px;background:${color};border-radius:${shape};opacity:1`;
    c.appendChild(el);

    const start = performance.now();
    const animate = (now: number) => {
      const t = (now - start) / 1000;
      const progress = t / dur;
      if (progress >= 1) { el.remove(); return; }
      const x = cx + vx * t;
      const y = cy + vy * t + 400 * t * t;
      el.style.transform = `translate(${x - cx}px, ${y - cy}px) rotate(${rot + rotSpeed * t}deg)`;
      el.style.opacity = String(1 - progress);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
}

export function triggerBurst(x: number, y: number, count: number = 14) {
  const c = getContainer();

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = CONFETTI_CLASS;
    const size = rand(4, 7);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const angle = rand(-Math.PI, Math.PI);
    const speed = rand(60, 180);
    const dur = rand(0.5, 1);
    const shape = Math.random() > 0.5 ? '50%' : '0';

    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${color};border-radius:${shape};opacity:1`;
    c.appendChild(el);

    const start = performance.now();
    const animate = (now: number) => {
      const t = (now - start) / 1000;
      const progress = t / dur;
      if (progress >= 1) { el.remove(); return; }
      const dx = Math.cos(angle) * speed * t;
      const dy = Math.sin(angle) * speed * t + 80 * t * t;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${t * 360}deg)`;
      el.style.opacity = String(1 - progress);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
}

export function triggerScreenFlash() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998;background:radial-gradient(circle,rgba(255,215,0,0.25),transparent 70%);opacity:1;transition:opacity 1.5s ease';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 1600);
}
