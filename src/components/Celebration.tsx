'use client';

import React, { useEffect, useState } from 'react';

interface CelebrationProps {
  show: boolean;
  onComplete?: () => void;
}

const PARTICLE_COUNT = 20;

export function Celebration({ show, onComplete }: CelebrationProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; color: string; delay: number; size: number }>>([]);

  useEffect(() => {
    if (!show) {
      setParticles([]);
      return;
    }

    // Neo-roman palette — warm stone, laurel gold, parchment, terracotta (tasteful, not cartoonish)
    const colors = ['#c9a063', '#a67c52', '#d4b896', '#f5f1e8', '#8b6a43', '#e8d5b7', '#6b5d4f', '#f0e6d3'];
    const newParticles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.5,
      size: 4 + Math.random() * 8,
    }));
    setParticles(newParticles);

    const timer = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, 3000);

    return () => clearTimeout(timer);
  }, [show, onComplete]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: '-10px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            animation: `confetti-fall 2.5s ease-out ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
