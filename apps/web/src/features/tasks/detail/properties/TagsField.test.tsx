import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagsField } from './TagsField';

describe('TagsField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates and immediately assigns a tag without leaving task details', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    const onCreateTag = vi.fn().mockResolvedValue({
      id: 'tag-1',
      userId: 'user-1',
      name: 'Deep work',
      color: null,
      deletedAt: null,
      createdAt: '',
      updatedAt: '',
    });

    render(
      <TagsField
        taskId="task-1"
        value={[]}
        tags={[]}
        save={save}
        onChange={onChange}
        onCreateTag={onCreateTag}
      />,
    );

    fireEvent.click(screen.getByTestId('detail-tags'));
    expect(screen.getByText('No tags yet. Create one above.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Deep work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));

    await waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Deep work'));
    expect(onChange).toHaveBeenCalledWith(['tag-1']);
    expect(save).toHaveBeenCalledWith({ tagIds: ['tag-1'] });
  });

  it('confirms deletion and removes the tag from the current task', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    const onDeleteTag = vi.fn().mockResolvedValue(undefined);
    const tag = {
      id: 'tag-1',
      userId: 'user-1',
      name: 'Deep work',
      color: null,
      deletedAt: null,
      createdAt: '',
      updatedAt: '',
    };

    render(
      <TagsField
        taskId="task-1"
        value={['tag-1']}
        tags={[tag]}
        save={save}
        onChange={onChange}
        onDeleteTag={onDeleteTag}
      />,
    );

    fireEvent.click(screen.getByTestId('detail-tags'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete tag Deep work' }));
    expect(screen.getByText('Delete #Deep work? It will be removed from every task.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete tag' }));

    await waitFor(() => expect(onDeleteTag).toHaveBeenCalledWith('tag-1'));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(save).toHaveBeenCalledWith({ tagIds: [] });
  });
  it('keeps a failed edit draft and saves the corrected name and color', async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error('Conflict')).mockResolvedValueOnce({});
    render(<TagsField taskId="task-1" value={[]} tags={[{ id: 'tag-1', name: 'Work' } as any]} save={vi.fn()} onChange={vi.fn()} onUpdateTag={update} />);
    fireEvent.click(screen.getByTestId('detail-tags'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit tag Work' }));
    fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: 'Renamed' } });
    fireEvent.change(screen.getByLabelText('Tag color'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save tag' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('New tag name')).toHaveValue('Renamed');
    fireEvent.click(screen.getByRole('button', { name: 'Save tag' }));
    await waitFor(() => expect(screen.queryByLabelText('New tag name')).toBeNull());
    expect(update).toHaveBeenLastCalledWith('tag-1', { name: 'Renamed', color: '#123456' });
  });

  it('does not send a previously deleted tag when selecting another tag', async () => {
    const save = vi.fn();
    render(<TagsField taskId="task-1" value={['deleted']} tags={[{ id: 'active', name: 'Active' } as any]} save={save} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('detail-tags'));
    fireEvent.click(screen.getByTestId('detail-tag-active'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ tagIds: ['active'] }));
  });

});
