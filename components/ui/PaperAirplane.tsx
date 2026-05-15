"use client";

import { useEffect, useRef, useCallback } from "react";

export default function PaperAirplane() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    x: 0,
    y: 0,
    vx: 1.0,
    vy: 0.7,
    angle: 0,
    mouseX: -1000,
    mouseY: -1000,
    trail: [] as { x: number; y: number; age: number }[],
    initialized: false,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const s = stateRef.current;

    // Initialize position once
    if (!s.initialized) {
      s.x = canvas.width * 0.3;
      s.y = canvas.height * 0.3;
      s.initialized = true;
    }

    // Boid-like behavior: attraction to mouse but repulsion when too close
    const dx = s.mouseX - s.x;
    const dy = s.mouseY - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const minDistance = 150; // Don't get closer than this
    const maxDistance = 400; // Start approaching if farther than this

    if (dist < minDistance) {
      // Too close! Run away (separation/avoidance)
      const repulsionForce = (minDistance - dist) / minDistance;
      s.vx -= (dx / dist) * repulsionForce * 0.08;
      s.vy -= (dy / dist) * repulsionForce * 0.08;
    } else if (dist > maxDistance) {
      // Too far, gently approach (cohesion)
      const attractionForce = Math.min((dist - maxDistance) / 200, 1);
      s.vx += (dx / dist) * attractionForce * 0.015;
      s.vy += (dy / dist) * attractionForce * 0.015;
    } else {
      // Sweet spot - just orbit/drift
      const orbitX = -dy / dist;
      const orbitY = dx / dist;
      s.vx += orbitX * 0.005;
      s.vy += orbitY * 0.005;
    }

    // Add gentle sine wave wobble
    s.vx += Math.sin(Date.now() * 0.001) * 0.003;
    s.vy += Math.cos(Date.now() * 0.0012) * 0.003;

    // Clamp speed
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    const maxSpeed = 1.8;
    if (speed > maxSpeed) {
      s.vx = (s.vx / speed) * maxSpeed;
      s.vy = (s.vy / speed) * maxSpeed;
    }

    // Damping
    s.vx *= 0.995;
    s.vy *= 0.995;

    // Move
    s.x += s.vx;
    s.y += s.vy;

    // Soft bounce off edges
    const margin = 40;
    if (s.x < margin) { s.vx += 0.05; s.x = margin; }
    if (s.x > canvas.width - margin) { s.vx -= 0.05; s.x = canvas.width - margin; }
    if (s.y < margin) { s.vy += 0.05; s.y = margin; }
    if (s.y > canvas.height - margin) { s.vy -= 0.05; s.y = canvas.height - margin; }

    // Smooth angle toward velocity direction
    const targetAngle = Math.atan2(s.vy, s.vx);
    let angleDiff = targetAngle - s.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    s.angle += angleDiff * 0.05;

    // Update trail
    s.trail.push({ x: s.x, y: s.y, age: 0 });
    s.trail = s.trail
      .map((p) => ({ ...p, age: p.age + 1 }))
      .filter((p) => p.age < 60);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw cartoony gray contrail with dashed puffs
    if (s.trail.length > 2) {
      for (let i = 0; i < s.trail.length - 1; i++) {
        const t = i / s.trail.length;
        const alpha = (1 - t) * 0.35;
        const width = (1 - t) * 6 + 2;

        ctx.beginPath();
        ctx.moveTo(s.trail[i].x, s.trail[i].y);
        ctx.lineTo(s.trail[i + 1].x, s.trail[i + 1].y);
        ctx.strokeStyle = `rgba(160, 160, 160, ${alpha})`;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.setLineDash([4, 6]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Draw paper airplane (bigger and more detailed)
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);

    const scale = 1.5;

    // Main wing body (top)
    ctx.beginPath();
    ctx.moveTo(20 * scale, 0);
    ctx.lineTo(-14 * scale, -10 * scale);
    ctx.lineTo(-6 * scale, 0);
    ctx.closePath();
    ctx.fillStyle = "#7DB3E8";
    ctx.fill();
    ctx.strokeStyle = "#4A88D0";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Main wing body (bottom)
    ctx.beginPath();
    ctx.moveTo(20 * scale, 0);
    ctx.lineTo(-14 * scale, 10 * scale);
    ctx.lineTo(-6 * scale, 0);
    ctx.closePath();
    ctx.fillStyle = "#5A9FDB";
    ctx.fill();
    ctx.strokeStyle = "#4A88D0";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center fold line
    ctx.beginPath();
    ctx.moveTo(20 * scale, 0);
    ctx.lineTo(-14 * scale, 0);
    ctx.strokeStyle = "#3D7AC7";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Wing details (creases)
    ctx.beginPath();
    ctx.moveTo(-6 * scale, 0);
    ctx.lineTo(-10 * scale, -6 * scale);
    ctx.strokeStyle = "#4A88D0";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-6 * scale, 0);
    ctx.lineTo(-10 * scale, 6 * scale);
    ctx.stroke();

    ctx.restore();

    requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      stateRef.current.mouseX = e.clientX;
      stateRef.current.mouseY = e.clientY;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);

    const frameId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(frameId);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
