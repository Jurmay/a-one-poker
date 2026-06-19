import React from 'react';
import { SUIT_COLOR } from '../engine/poker';

export function Card({ card, size = 'md', faceDown = false, className = '' }) {
  const sizes = {
    sm: 'w-8 h-12 text-xs',
    md: 'w-10 h-14 text-sm',
    lg: 'w-12 h-16 text-base',
    xl: 'w-14 h-20 text-lg',
  };
  const sz = sizes[size] || sizes.md;

  if (faceDown || !card) {
    return (
      <div className={`card-back ${sz} ${className}`} />
    );
  }

  const isRed = SUIT_COLOR[card.s] === 'red';
  return (
    <div className={`card-face ${sz} ${isRed ? 'text-red-700' : 'text-gray-900'} ${className} deal-anim`}>
      <span style={{ lineHeight: 1 }}>{card.r}</span>
      <span style={{ lineHeight: 1, fontSize: '0.8em' }}>{card.s}</span>
    </div>
  );
}

export function CardPlaceholder({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-8 h-12', md: 'w-10 h-14', lg: 'w-12 h-16', xl: 'w-14 h-20' };
  const sz = sizes[size] || sizes.md;
  return (
    <div className={`${sz} border border-dashed border-white/10 rounded bg-white/5 ${className}`} />
  );
}
