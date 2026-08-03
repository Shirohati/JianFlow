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

export function triggerInhale(x: number, y: number, count: number = 34) {
  const c = getContainer();
  const start = performance.now();
  const total = 0.55;

  // 粒子从四周被"吸"入中心：轨道螺旋收敛 + 加速 + 收缩
  interface InhaleParticle {
    el: HTMLDivElement;
    r0: number;
    angle: number;
    dur: number;
    spin: number;
    size: number;
    color: string;
  }
  const particles: InhaleParticle[] = [];
  for (let i = 0; i < count; i++) {
    const r0 = rand(36, 120);
    const angle = rand(-Math.PI, Math.PI);
    const dur = rand(0.32, 0.5);
    const size = rand(3, 6);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const spin = rand(1.2, 4.5) * (Math.random() > 0.5 ? 1 : -1);
    const el = document.createElement('div');
    el.className = CONFETTI_CLASS;
    const shape = Math.random() > 0.4 ? '50%' : '2px';
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${color};border-radius:${shape};opacity:1;box-shadow:0 0 6px ${color}`;
    c.appendChild(el);
    particles.push({ el, r0, angle, dur, spin, size, color });
  }

  // 湮灭信号环：从中心扩散一环后淡出
  const ring = document.createElement('div');
  ring.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:10px;height:10px;border:2px solid #fff;border-radius:50%;opacity:0;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 12px rgba(255,255,255,0.8)`;
  c.appendChild(ring);

  // 中心闪光
  const flash = document.createElement('div');
  flash.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:14px;height:14px;border-radius:50%;opacity:0;transform:translate(-50%,-50%);pointer-events:none;background:radial-gradient(circle,#fff 0%,rgba(255,240,180,0.9) 40%,transparent 75%)`;
  c.appendChild(flash);

  const animate = (now: number) => {
    const t = (now - start) / 1000;
    if (t >= total) {
      particles.forEach(p => p.el.remove());
      ring.remove();
      flash.remove();
      return;
    }

    // 环：0.05s 开始扩散，0.35s 内从 0 → 90px
    const ringP = Math.min(1, Math.max(0, (t - 0.04) / 0.3));
    const ringR = ringP * 90;
    ring.style.width = `${ringR}px`;
    ring.style.height = `${ringR}px`;
    ring.style.opacity = String((1 - ringP) * 0.9);

    // 闪光：结束时爆闪
    const flashP = Math.min(1, Math.max(0, (t - 0.36) / 0.16));
    if (flashP > 0) {
      const fs = 1.8 - flashP * 0.9;
      flash.style.transform = `translate(-50%,-50%) scale(${fs})`;
      flash.style.opacity = String((1 - flashP) * 0.9);
    }

    for (const p of particles) {
      const pt = Math.min(1, (t - 0) / p.dur);
      if (pt <= 0) {
        p.el.style.opacity = '1';
        p.el.style.transform = `translate(-50%,-50%) scale(1)`;
        continue;
      }
      if (pt >= 1) {
        p.el.style.opacity = '0';
        continue;
      }
      // 加速吸入：easeIn 曲线
      const eased = pt * pt * pt;
      const ang = p.angle + p.spin * pt * Math.PI;
      const px = x + Math.cos(ang) * p.r0 * (1 - eased);
      const py = y + Math.sin(ang) * p.r0 * (1 - eased);
      const s = 1 - eased * 0.85;
      p.el.style.transform = `translate(-50%,-50%) translate(${px - x}px, ${py - y}px) scale(${s}) rotate(${pt * 360}deg)`;
      p.el.style.opacity = String(1 - eased * 1.1);
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

export function triggerScreenFlash() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998;background:radial-gradient(circle,rgba(255,215,0,0.25),transparent 70%);opacity:1;transition:opacity 1.5s ease';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 1600);
}
