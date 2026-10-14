import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { registerUiKit, type UiKitComponents } from './kit';
import { herouiKit } from './heroui';
import { Button } from './button';
import { Input } from './input';
import { Checkbox } from './checkbox';
import { Switch } from './switch';
import { Select } from './select';

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
});
