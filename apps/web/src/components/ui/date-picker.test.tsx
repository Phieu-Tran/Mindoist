import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from './date-picker';

describe('DatePicker popup positioning', () => {
  it('ignores scroll events after its anchor is detached during navigation', () => {
    render(<DatePicker value="2026-08-13" onChange={vi.fn()} testId="deadline-date" />);
    const anchor = screen.getByTestId('deadline-date');
    fireEvent.click(anchor);
    Object.defineProperty(anchor, 'isConnected', { configurable: true, get: () => false });
    const measure = vi.spyOn(anchor, 'getBoundingClientRect');

    expect(() => fireEvent.scroll(window)).not.toThrow();
    expect(measure).not.toHaveBeenCalled();
  });

  it('localizes the calendar and exposes selected/today semantics', () => {
    render(
      <DatePicker
        value="2026-09-01"
        onChange={vi.fn()}
        testId="deadline-date"
        ariaLabel="Ngày"
        locale="vi"
        todayLabel="Hôm nay"
        clearLabel="Xoá"
        previousMonthLabel="Tháng trước"
        nextMonthLabel="Tháng sau"
      />
    );

    fireEvent.click(screen.getByTestId('deadline-date'));
    expect(screen.getByRole('dialog', { name: 'Ngày' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tháng trước' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tháng sau' })).toBeInTheDocument();
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('1');
  });
});
