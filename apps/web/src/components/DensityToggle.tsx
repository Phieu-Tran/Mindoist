import { useState } from 'react';
import { cn } from '@/lib/utils';

export type Density = 'compact' | 'cozy' | 'comfortable';

function storedDensity(): Density {
  const stored = localStorage.getItem('mindoist:density');
  return stored === 'compact' || stored === 'comfortable' ? stored : 'cozy';
}

export function applyDensity(density: Density) {
  localStorage.setItem('mindoist:density', density);
  document.documentElement.dataset.density = density;
  window.dispatchEvent(new CustomEvent('mindoist:density-change', { detail: { density } }));
}

export function DensityToggle() {
  const [density, setDensity] = useState<Density>(storedDensity);

  return (
    <div className="inline-grid grid-cols-3 rounded-control bg-muted p-0.5" role="radiogroup" aria-label="Interface density">
      {(['compact', 'cozy', 'comfortable'] as const).map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={density === option}
          className={cn('rounded px-2.5 py-1.5 text-xs capitalize text-muted-foreground', density === option && 'bg-background font-semibold text-foreground shadow-sm')}
          onClick={() => { setDensity(option); applyDensity(option); }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
