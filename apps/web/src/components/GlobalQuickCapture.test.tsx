import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { GlobalQuickCapture } from './GlobalQuickCapture';

describe('GlobalQuickCapture (B2.26)', () => {
  let onAdd: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    onAdd = vi.fn();
  });

  const renderCapture = () =>
    render(
      <I18nextProvider i18n={i18n}>
        <button type="button" data-testid="page-button">Somewhere else on the page</button>
        <GlobalQuickCapture onAdd={onAdd} />
      </I18nextProvider>
    );

  it('is not rendered until Cmd/Ctrl+K is pressed', () => {
    renderCapture();
    expect(screen.queryByTestId('global-quick-capture')).not.toBeInTheDocument();
  });

  it('opens on Ctrl+K from anywhere on the page, even while another element has focus', async () => {
    renderCapture();
    const pageButton = screen.getByTestId('page-button');
    pageButton.focus();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    expect(screen.getByTestId('global-quick-capture')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('global-quick-capture-input')).toHaveFocus());
  });

  it('opens on Cmd+K (metaKey) too', () => {
    renderCapture();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByTestId('global-quick-capture')).toBeInTheDocument();
  });

  it('wraps Tab/Shift+Tab at the dialog boundary instead of leaking focus out', async () => {
    renderCapture();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const dialog = screen.getByTestId('global-quick-capture');
    const input = screen.getByTestId('global-quick-capture-input');
    const submit = screen.getByTestId('global-quick-capture-submit');
    await waitFor(() => expect(input).toHaveFocus());

    // Shift+Tab from the first control wraps to the last
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(submit).toHaveFocus();

    // Tab from the last control wraps back to the first
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(input).toHaveFocus();
  });

  it('Escape closes the console and restores focus to what was focused before', async () => {
    renderCapture();
    const pageButton = screen.getByTestId('page-button');
    pageButton.focus();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByTestId('global-quick-capture');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByTestId('global-quick-capture')).not.toBeInTheDocument();
    expect(pageButton).toHaveFocus();
  });

  it('submitting parses the input with the shared Quick Add parser and calls onAdd', async () => {
    renderCapture();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const input = await screen.findByTestId('global-quick-capture-input');

    fireEvent.change(input, { target: { value: 'call dentist p1' } });
    fireEvent.click(screen.getByTestId('global-quick-capture-submit'));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'call dentist', priority: 1 }));
    expect(screen.queryByTestId('global-quick-capture')).not.toBeInTheDocument();
  });

  it('does not call onAdd for empty/whitespace-only input', () => {
    renderCapture();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const dialog = screen.getByTestId('global-quick-capture');
    fireEvent.submit(dialog.querySelector('form')!);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
