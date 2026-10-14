import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { registerUiKit, type UiKitComponents } from './kit';
import { herouiKit } from './heroui';
import { Button } from './button';
import { Input } from './input';
import { Checkbox } from './checkbox';
import { Switch } from './switch';
import { Select } from './select';
import { DatePicker } from './date-picker';
import { ActionMenu } from './action-menu';
import { PopoverPanel } from './popover-panel';
import { ModalFrame } from './modal-frame';
import { useRef, useState } from 'react';

const kits: Array<[name: 'legacy' | 'heroui', components: Partial<UiKitComponents>]> = [
  ['legacy', {}],
  ['heroui', herouiKit],
];

afterAll(() => registerUiKit('legacy', {}));

describe.each(kits)('UI kit: %s', (name, components) => {
  beforeEach(() => registerUiKit(name, components));

  it('marks the document with the active kit', () => {
    expect(document.documentElement.dataset.uiKit).toBe(name);
  });

  it('Button fires onClick, honours disabled and submits forms by default', async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button onClick={onClick} data-testid="go">Go</Button>
        <Button disabled onClick={onClick}>Off</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('go')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Input forwards value, onChange and ref', async () => {
    const ref = { current: null as HTMLInputElement | null };
    const onChange = vi.fn();
    render(<Input ref={ref} aria-label="Title" onChange={onChange} data-testid="title" />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'ab');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(ref.current).toBe(screen.getByTestId('title'));
  });

  it('Checkbox toggles by click and keyboard and exposes its name', async () => {
    const onCheckedChange = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div draggable onClick={onRowClick}>
        <Checkbox checked={false} onCheckedChange={onCheckedChange} aria-label="Complete task" data-testid="toggle" />
      </div>,
    );
    await userEvent.click(screen.getByTestId('toggle'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    const checkbox = screen.getByRole('checkbox', { name: 'Complete task' });
    expect(checkbox).not.toBeChecked();
    checkbox.focus();
    await userEvent.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it('Switch reports the next state', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked onCheckedChange={onCheckedChange} aria-label="Notifications" data-testid="notify" />);
    expect(screen.getByRole('switch', { name: 'Notifications' })).toBeChecked();
    await userEvent.click(screen.getByTestId('notify'));
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('Select picks an option', async () => {
    const onChange = vi.fn();
    render(
      <Select
        value="week"
        onChange={onChange}
        aria-label="View"
        data-testid="view"
        options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]}
      />,
    );
    expect(screen.getByTestId('view')).toHaveTextContent('Week');
    await userEvent.click(screen.getByTestId('view'));
    await userEvent.click(await screen.findByRole('option', { name: 'Day' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('day'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Select reports re-picking the current option', async () => {
    const onChange = vi.fn();
    render(
      <Select
        value="week"
        onChange={onChange}
        aria-label="View"
        data-testid="view"
        options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]}
      />,
    );
    await userEvent.click(screen.getByTestId('view'));
    await userEvent.click(await screen.findByRole('option', { name: 'Week' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('week'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Select treats an empty-string option as a real choice', async () => {
    const onChange = vi.fn();
    render(
      <Select
        value=""
        onChange={onChange}
        aria-label="Project"
        data-testid="project"
        options={[{ value: '', label: 'No project' }, { value: 'p1', label: 'Work' }]}
      />,
    );
    expect(screen.getByTestId('project')).toHaveTextContent('No project');
    await userEvent.click(screen.getByTestId('project'));
    await userEvent.click(await screen.findByRole('option', { name: 'Work' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('p1'));
  });

  it('DatePicker opens a "Pick date" dialog and returns ISO dates', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<DatePicker value="" onChange={onChange} testId="due" locale="en" />);
    expect(screen.getByTestId('due')).toHaveTextContent('dd/mm/yyyy');

    await userEvent.click(screen.getByTestId('due'));
    const dialog = await screen.findByRole('dialog', { name: 'Pick date' });
    await userEvent.click(within(dialog).getByRole('button', { name: /^Today$/ }));
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(onChange).toHaveBeenLastCalledWith(iso);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pick date' })).not.toBeInTheDocument());

    rerender(<DatePicker value="2026-03-04" onChange={onChange} testId="due" locale="en" />);
    expect(screen.getByTestId('due')).toHaveTextContent('04/03/2026');
    await userEvent.click(screen.getByTestId('due'));
    const reopened = await screen.findByRole('dialog', { name: 'Pick date' });
    await userEvent.click(reopened.querySelector<HTMLElement>('[data-calendar-day="2026-03-18"]')!);
    expect(onChange).toHaveBeenLastCalledWith('2026-03-18');

    await userEvent.click(screen.getByTestId('due'));
    const again = await screen.findByRole('dialog', { name: 'Pick date' });
    await userEvent.click(within(again).getByRole('button', { name: /^Clear$/ }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('ActionMenu runs the picked action and skips disabled items', async () => {
    const onAction = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      const anchorRef = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>More</button>
          <ActionMenu
            open={open}
            onClose={() => setOpen(false)}
            onAction={key => { onAction(key); setOpen(false); }}
            aria-label="Task actions"
            anchorRef={anchorRef}
            items={[
              { key: 'here', textValue: 'Here', content: 'Here', disabled: true },
              { key: 'delete', textValue: 'Delete', content: 'Delete' },
            ]}
          />
        </div>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items).toHaveLength(2);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Here' }));
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onAction).toHaveBeenCalledWith('delete');
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument());
  });

  it('PopoverPanel shows its content with the given role and name', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const anchorRef = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>Priority</button>
          <PopoverPanel open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} role="listbox" aria-label="Priority options">
            <button type="button" role="option" aria-selected={false} onClick={() => setOpen(false)}>P1</button>
          </PopoverPanel>
        </div>
      );
    }
    render(<Harness />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Priority' }));
    const panel = await screen.findByRole('listbox', { name: 'Priority options' });
    await userEvent.click(within(panel).getByRole('option', { name: 'P1' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('ModalFrame is a labelled modal that closes on Escape unless blocked', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ModalFrame open onClose={onClose} role="alertdialog" aria-labelledby="t" overlayClassName="fixed inset-0">
        <h2 id="t">Delete task?</h2>
        <button type="button">Cancel</button>
      </ModalFrame>,
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete task?' });
    expect(dialog).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    onClose.mockClear();
    rerender(
      <ModalFrame open onClose={onClose} dismissable={false} role="alertdialog" aria-labelledby="t" overlayClassName="fixed inset-0">
        <h2 id="t">Delete task?</h2>
        <button type="button">Cancel</button>
      </ModalFrame>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});
