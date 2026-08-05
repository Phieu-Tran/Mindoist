import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreateProjectDialog } from './CreateProjectDialog';

describe('CreateProjectDialog', () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onCreate.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: [] }) }));
  });

  const renderDialog = (parentId?: string) => render(
    <CreateProjectDialog
      open
      parentId={parentId}
      parentName={parentId ? 'Work' : undefined}
      onClose={onClose}
      onCreate={onCreate}
    />,
  );

  it('offers all four modern workflow templates', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /Daily Log/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Job Search/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Personal/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Custom/ })).toBeInTheDocument();
  });

  it('submits a selected preset as a sub-project', async () => {
    renderDialog('parent-1');
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Career move' } });
    fireEvent.click(screen.getByRole('button', { name: /Job Search/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      name: 'Career move',
      type: 'JOB',
      color: 'indigo',
      parentId: 'parent-1',
      areaId: null,
      customColumns: undefined,
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('parses custom columns and preserves the chosen project color', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Content studio' } });
    fireEvent.click(screen.getByRole('button', { name: /Custom/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /Custom columns/ }), { target: { value: 'Ideas, Draft, Review, Published' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ocean' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      name: 'Content studio',
      type: 'CUSTOM',
      color: 'ocean',
      parentId: undefined,
      areaId: null,
      customColumns: ['Ideas', 'Draft', 'Review', 'Published'],
    }));
  });
});
