import { useEffect, useRef } from 'react';

/** Adapted from ashish rajwani's ASMRStaticBackground (21st.dev).
 * Keep the magnetic pull, perpendicular vortex, shard geometry and friction glow;
 * bound the work and pause with motion/visibility controls. No cursor replacement.
 */
export function ASMRBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, frame = 0, last = 0, paused = false;
    const pointer = { x: -1000, y: -1000 };
    type Particle = { x: number; y: number; vx: number; vy: number; size: number; alpha: number; glass: boolean; rotation: number; spin: number; glow: number };
    let particles: Particle[] = [];
    function size() {
      const r = canvas!.getBoundingClientRect(); width = r.width; height = r.height;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas!.width = Math.round(width * dpr); canvas!.height = Math.round(height * dpr); ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: Math.min(innerWidth < 768 ? 260 : 1000, Math.round(width * height / 1100)) }, () => ({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - .5) * .2, vy: (Math.random() - .5) * .2, size: Math.random() * 1.5 + .5, alpha: Math.random() * .4 + .1, glass: Math.random() > .7, rotation: Math.random() * Math.PI * 2, spin: (Math.random() - .5) * .05, glow: 0 }));
      draw(false);
    }
    function draw(update: boolean) {
      const dark = document.documentElement.dataset.theme === 'dark';
      ctx!.fillStyle = dark ? 'rgba(10,10,12,.22)' : 'rgba(248,249,251,.3)'; ctx!.fillRect(0, 0, width, height);
      for (const p of particles) {
        if (update) {
          const dx = pointer.x - p.x, dy = pointer.y - p.y, dist = Math.hypot(dx, dy);
          if (dist < 280 && dist > .1) { const force = (280 - dist) / 280; p.vx += (dx / dist) * force * .12 + (dy / dist) * force * .7; p.vy += (dy / dist) * force * .12 - (dx / dist) * force * .7; p.glow = force * .7; } else p.glow *= .92;
          p.x += p.vx; p.y += p.vy; p.vx = p.vx * .95 + (Math.random() - .5) * .04; p.vy = p.vy * .95 + (Math.random() - .5) * .04;
          p.rotation += p.spin + (Math.abs(p.vx) + Math.abs(p.vy)) * .05;
          if (p.x < -20) p.x = width + 20; if (p.x > width + 20) p.x = -20; if (p.y < -20) p.y = height + 20; if (p.y > height + 20) p.y = -20;
        }
        ctx!.save();ctx!.translate(p.x, p.y);ctx!.rotate(p.rotation);
        const color = dark ? p.glass ? '240,245,255' : '100,105,115' : p.glass ? '120,130,150' : '55,65,81';
        ctx!.fillStyle = `rgba(${color},${Math.min(p.alpha + p.glow, .9)})`;
        if (p.glow > .3) { ctx!.shadowBlur = p.glow * 8; ctx!.shadowColor = `rgba(180,220,255,${p.glow})`; }
        ctx!.beginPath();ctx!.moveTo(0, -p.size * 2.5);ctx!.lineTo(p.size, 0);ctx!.lineTo(0, p.size * 2.5);ctx!.lineTo(-p.size, 0);ctx!.closePath();ctx!.fill();ctx!.restore();
      }
    }
    const tick = (now: number) => { if (now - last > 30) { draw(true); last = now; } frame = requestAnimationFrame(tick); };
    function sync() { cancelAnimationFrame(frame); frame = 0; if (!document.hidden && !media.matches && !paused) frame = requestAnimationFrame(tick); else draw(false); }
    function move(e: PointerEvent) { if (e.pointerType === 'touch') return; const r = canvas!.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; }
    function leave() { pointer.x = pointer.y = -1000; }
    function pause(e: Event) { paused = Boolean((e as CustomEvent).detail); sync(); }
    const observer = new ResizeObserver(() => { size(); sync(); }); observer.observe(canvas);
    const theme = () => { ctx.clearRect(0,0,width,height); draw(false); };
    size();sync();window.addEventListener('pointermove', move, { passive: true });window.addEventListener('pointerout', leave);window.addEventListener('rolesphere:theme', theme);window.addEventListener('rolesphere:motion',pause);document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);
    return () => { cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('pointermove', move);window.removeEventListener('pointerout', leave);window.removeEventListener('rolesphere:theme',theme);window.removeEventListener('rolesphere:motion',pause);document.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync); };
  }, []);
  return <canvas ref={ref} className="rs-asmr-canvas" aria-hidden="true" />;
}
