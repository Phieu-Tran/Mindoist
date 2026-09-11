import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tag, UpdateTagRequest } from '@mindoist/shared/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { TagListResult } from '../hooks/useApi';

interface Props {
  state: TagListResult;
  selectedTagId: string | null;
  onSelect: (id: string | null) => void;
}

export function TagManager({ state, selectedTagId, onSelect }: Props) {
  const { t } = useTranslation('tasks');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || pending) return;
    setPending(true);
    try {
      await state.createTag({ name: newName.trim(), ...(newColor ? { color: newColor } : {}) });
      setNewName('');
      setNewColor('');
    } catch {
      // The hook keeps the draft and exposes the API error.
    } finally {
      setPending(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditing(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || '');
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim() || pending) return;
    const req: UpdateTagRequest = { name: editName.trim(), ...(editColor ? { color: editColor } : {}) };
    setPending(true);
    try {
      await state.updateTag(editing, req);
      setEditing(null);
    } catch {
      // Keep the edit draft for retry.
    } finally {
      setPending(false);
    }
  };

  const remove = async (tag: Tag) => {
    if (pending || !window.confirm(t('tags.confirmDelete'))) return;
    setPending(true);
    try {
      await state.deleteTag(tag.id);
      if (selectedTagId === tag.id) onSelect(null);
    } catch {
      // Keep the tag visible when deletion fails.
    } finally {
      setPending(false);
    }
  };

  return (
    <section data-testid="tag-manager" className="p-4">
      <h2 className="mb-3 text-lg font-semibold">{t('tags.title')}</h2>
      {state.error && (
        <div role="alert" className="mb-3 flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{state.error}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void state.refetch()}>{t('tags.retry')}</Button>
        </div>
      )}
      <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2" aria-label={t('tags.create')}>
        <Input data-testid="tag-name-input" disabled={pending} aria-label={t('tags.name')} value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('tags.name')} />
        <input
          aria-label={t('tags.color')}
          type="color"
          disabled={pending}
          value={newColor || '#64748b'}
          onChange={e => setNewColor(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-1"
        />
        <Button type="submit" disabled={pending || !newName.trim()}>{t('tags.create')}</Button>
      </form>
      {state.loading ? (
        <p aria-live="polite">{t('tags.loading')}</p>
      ) : state.tags.length === 0 ? (
        <p data-testid="tags-empty" className="text-sm text-muted-foreground">{t('tags.empty')}</p>
      ) : (
        <div className="flex flex-col gap-2" role="list">
          {state.tags.map(tag => (
            <div key={tag.id} data-testid={`tag-${tag.id}`} role="listitem" className="flex items-center gap-2 rounded-md border border-border p-2">
              {editing === tag.id ? (
                <>
                  <Input data-testid={`tag-edit-name-${tag.id}`} disabled={pending} aria-label={t('tags.name')} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                  <input aria-label={t('tags.color')} disabled={pending} type="color" value={editColor || '#64748b'} onChange={e => setEditColor(e.target.value)} className="h-9 w-12" />
                  <Button type="button" size="sm" onClick={() => void saveEdit()} disabled={pending || !editName.trim()}>{t('tags.save')}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)} disabled={pending}>{t('detail.cancel')}</Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant={selectedTagId === tag.id ? 'secondary' : 'ghost'}
                    className="flex-1 justify-start"
                    onClick={() => onSelect(selectedTagId === tag.id ? null : tag.id)}
                    aria-pressed={selectedTagId === tag.id}
                  >
                    <span className="mr-2 h-3 w-3 rounded-full" style={{ backgroundColor: tag.color || '#64748b' }} aria-hidden="true" />
                    {tag.name}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => startEdit(tag)} disabled={pending}>{t('tags.edit')}</Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => void remove(tag)} disabled={pending}>{t('tags.delete')}</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
