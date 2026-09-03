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
    expect(screen.getByRole('button', { name: 'Add tag' })).toHaveTextContent('Add tag');
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
    const deleteButton = screen.getByRole('button', { name: 'Delete tag Deep work' });
    expect(deleteButton).toHaveTextContent('Delete tag');
    fireEvent.click(deleteButton);
    expect(screen.getByText('Delete #Deep work? It will be removed from every task.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete tag' }));

    await waitFor(() => expect(onDeleteTag).toHaveBeenCalledWith('tag-1'));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(save).toHaveBeenCalledWith({ tagIds: [] });
  });
});
