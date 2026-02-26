/**
 * LoginBackground — Animated atmospheric background for login screens.
 *
 * Multi-layered radial gradients with floating particle orbs
 * that drift slowly to create a cinematic, living feel.
 */

import { useEffect, useRef } from 'react';
import styles from './LoginBackground.module.css';

/** Number of floating orbs */
const ORB_COUNT = 5;

interface Orb {
  x: number;
  y: number;
  size: number;
  dx: number;
  dy: number;
  hue: number; // 0-360
  opacity: number;
}

function createOrbs(): Orb[] {
  const orbs: Orb[] = [];
  const hues = [160, 45, 190, 160, 30]; // green, gold, cyan, green, gold
  for (let i = 0; i < ORB_COUNT; i++) {
    orbs.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 200 + Math.random() * 300,
      dx: (Math.random() - 0.5) * 0.015,
      dy: (Math.random() - 0.5) * 0.012,
      hue: hues[i],
      opacity: 0.03 + Math.random() * 0.04,
    });
  }
  return orbs;
}

export function LoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbsRef = useRef<Orb[]>(createOrbs());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    resize();
    window.addEventListener('resize', resize);

    function animate() {
      if (!canvas || !ctx) return;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Draw floating orbs as soft radial gradients
      for (const orb of orbsRef.current) {
        // Update position (wrap around)
        orb.x += orb.dx;
        orb.y += orb.dy;
        if (orb.x < -10) orb.x = 110;
        if (orb.x > 110) orb.x = -10;
        if (orb.y < -10) orb.y = 110;
        if (orb.y > 110) orb.y = -10;

        const px = (orb.x / 100) * width;
        const py = (orb.y / 100) * height;
        const r = orb.size;

        const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
        grad.addColorStop(0, `hsla(${orb.hue}, 60%, 50%, ${orb.opacity})`);
        grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');

        ctx.fillStyle = grad;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className={styles.bg}>
      <canvas ref={canvasRef} className={styles.canvas} />
      {/* Static gradient overlay for depth */}
      <div className={styles.overlay} />
    </div>
  );
}
