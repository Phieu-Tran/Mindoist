import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccentPicker } from './AccentPicker';
import { ACCENT_STORAGE_KEY } from '@/lib/appearance';

describe('AccentPicker', () => {
  beforeEach(() => {
    localStorage.removeItem(ACCENT_STORAGE_KEY);
    delete document.documentElement.dataset.accent;
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem(ACCENT_STORAGE_KEY);
    delete document.documentElement.dataset.accent;
  });

  it('applies and persists a selected accent', async () => {
    render(<AccentPicker />);

    fireEvent.click(screen.getByTestId('accent-picker-trigger'));
    expect(screen.getByRole('dialog', { name: 'Choose an accent color' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Ocean' }));

    await waitFor(() => expect(document.documentElement.dataset.accent).toBe('ocean'));
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('ocean');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('accent-picker-trigger')).toHaveFocus();
  });

  it('restores the stored accent and closes with Escape', async () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, 'jade');
    render(<AccentPicker side="top" />);

    await waitFor(() => expect(document.documentElement.dataset.accent).toBe('jade'));
    const trigger = screen.getByTestId('accent-picker-trigger');
    expect(trigger).toHaveAccessibleName('Accent color (currently Jade)');

    fireEvent.click(trigger);
    expect(screen.getByRole('radio', { name: 'Jade' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('syncs a change made in one instance to another rendered at the same time (sidebar + Settings)', async () => {
    render(
      <>
        <AccentPicker />
        <AccentPicker side="top" variant="row" />
      </>,
    );
    const triggers = screen.getAllByTestId('accent-picker-trigger');
    expect(triggers[0]).toHaveAccessibleName('Accent color (currently Indigo)');
    expect(triggers[1]).toHaveAccessibleName('Accent color (currently Indigo)');

    fireEvent.click(triggers[0]);
    fireEvent.click(screen.getByRole('radio', { name: 'Amber' }));

    await waitFor(() => expect(triggers[1]).toHaveAccessibleName('Accent color (currently Amber)'));
  });
});
