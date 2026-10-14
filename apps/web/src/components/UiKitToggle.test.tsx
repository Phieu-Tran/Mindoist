import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UiKitToggle } from './UiKitToggle';

describe('UiKitToggle', () => {
  it('shows the three choices and reports a new one', async () => {
    localStorage.removeItem('ui-kit');
    const onChange = vi.fn();
    render(<UiKitToggle onChange={onChange} />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByTestId('ui-kit-default')).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByTestId('ui-kit-heroui'));
    expect(onChange).toHaveBeenCalledWith('heroui');
    expect(screen.getByTestId('ui-kit-heroui')).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByTestId('ui-kit-heroui'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
