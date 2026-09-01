import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.removeItem('theme');
    document.documentElement.classList.remove('light', 'dark');
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem('theme');
    document.documentElement.classList.remove('light', 'dark');
  });

  it('toggles the resolved theme and persists it', async () => {
    localStorage.setItem('theme', 'light');
    render(<ThemeToggle />);

    const toggle = screen.getByTestId('theme-toggle');
    expect(toggle).toHaveAttribute('title', 'light');

    fireEvent.click(toggle);

    await waitFor(() => expect(localStorage.getItem('theme')).toBe('dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(toggle).toHaveAttribute('title', 'dark');
  });

  it('syncs a change made in one instance to another rendered at the same time (sidebar + Settings)', async () => {
    localStorage.setItem('theme', 'light');
    render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    );
    const toggles = screen.getAllByTestId('theme-toggle');
    expect(toggles[0]).toHaveAttribute('title', 'light');
    expect(toggles[1]).toHaveAttribute('title', 'light');

    fireEvent.click(toggles[0]);

    await waitFor(() => expect(toggles[1]).toHaveAttribute('title', 'dark'));
  });
});
