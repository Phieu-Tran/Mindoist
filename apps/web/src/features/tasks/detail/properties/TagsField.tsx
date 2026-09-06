import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Tag, Trash2, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Tag as TagType } from '@mindoist/shared/types';
import { primitiveColors } from '@mindoist/design-tokens';
import { cn } from '@/lib/utils';
import { useDismissiblePopover } from './use-dismissible-popover';
import { usePropertyMutation } from './use-property-mutation';
import type { PropertySave } from './types';

interface Props {
  taskId: string;
  value: string[];
  tags: TagType[];
  save: PropertySave;
  onChange: (value: string[]) => void;
  onCreateTag?: (name: string) => Promise<TagType>;
  onDeleteTag?: (id: string) => Promise<void>;
  onUpdateTag?: (id: string, request: { name: string; color?: string }) => Promise<unknown>;
}

export function TagsField({ taskId, value, tags, save, onChange, onCreateTag, onDeleteTag, onUpdateTag }: Props) {
  const { t } = useTranslation('tasks');
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editingPending, setEditingPending] = useState(false);
  const [editError, setEditError] = useState('');
  const rename = async () => {
    if (!editing || !onUpdateTag || !editName.trim() || editingPending) return;
    setEditingPending(true);
    setEditError('');
    try {
      await onUpdateTag(editing, { name: editName.trim(), ...(editColor ? { color: editColor } : {}) });
      setEditing(null);
    } catch {
      setEditError(t('tags.editError'));
    } finally { setEditingPending(false); }
  };
  const close = useCallback(() => {
    setOpen(false);
    setDeleteConfirmId(null);
    setDeleteError('');
  }, []);
  const ref = useDismissiblePopover(open, close);
  const { commit, error } = usePropertyMutation(taskId, save);
  const selectedTags = useMemo(() => value.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is TagType => Boolean(tag)), [tags, value]);
  const summary = selectedTags.length ? `${selectedTags[0].name}${selectedTags.length > 1 ? ` +${selectedTags.length - 1}` : ''}` : t('detail.noTags');
  const toggle = (tagId: string) => {
    const active = value.filter(id => tags.some(tag => tag.id === id));
    const next = active.includes(tagId) ? active.filter((id) => id !== tagId) : [...active, tagId];
    onChange(next);
    void commit({ tagIds: next });
  };
  const create = async () => {
    const name = newTagName.trim();
    if (!name || !onCreateTag || creating) return;

    setCreateError('');
    const existing = tags.find((tag) => tag.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0);
    if (existing) {
      if (!value.includes(existing.id)) {
        const next = [...value, existing.id];
        onChange(next);
        await commit({ tagIds: next });
      }
      setNewTagName('');
      return;
    }

    setCreating(true);
    try {
      const tag = await onCreateTag(name);
      const next = value.includes(tag.id) ? value : [...value, tag.id];
      onChange(next);
      await commit({ tagIds: next });
      setNewTagName('');
    } catch {
      setCreateError(t('tags.createError'));
    } finally {
      setCreating(false);
    }
  };
  const remove = async (tag: TagType) => {
    if (!onDeleteTag || deletingTagId) return;

    setDeleteError('');
    setDeletingTagId(tag.id);
    try {
      await onDeleteTag(tag.id);
      if (value.includes(tag.id)) {
        const next = value.filter((id) => id !== tag.id);
        onChange(next);
        await commit({ tagIds: next });
      }
      setDeleteConfirmId(null);
    } catch {
      setDeleteError(t('tags.deleteError'));
    } finally {
      setDeletingTagId(null);
    }
  };
  return (
    <div ref={ref} className="relative shrink-0" title={error ?? undefined}>
      <button type="button" data-testid="detail-tags" onClick={() => setOpen((current) => !current)} aria-haspopup="dialog" aria-expanded={open} title={selectedTags.map((tag) => tag.name).join(', ') || t('detail.noTags')} className={cn('flex min-h-11 max-w-[11rem] items-center gap-1.5 rounded-md border-0 bg-background/75 px-2 text-xs font-medium transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-7', value.length === 0 && 'font-normal text-muted-foreground')}>
        <Tag className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate text-left">{summary}</span><ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-[17rem] overflow-hidden rounded-xl border-0 bg-popover p-2 shadow-xl" role="dialog" aria-label={t('tags.manageTags')}>
          <div className="px-1 pb-1 pt-0.5">
            <p className="m-0 text-xs font-semibold text-foreground">{t('tags.manageTags')}</p>
            <p className="m-0 mt-0.5 text-[0.68rem] leading-4 text-muted-foreground">{t('tags.manageHint')}</p>
          </div>
          {onCreateTag && (
            <div className="mt-1.5 flex gap-1 rounded-lg bg-muted p-1">
              <label className="sr-only" htmlFor={`new-tag-${taskId}`}>{t('tags.namePlaceholder')}</label>
              <input
                id={`new-tag-${taskId}`}
                name="newTagName"
                value={newTagName}
                disabled={creating}
                onChange={(event) => setNewTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    void create();
                  }
                }}
                placeholder={`${t('tags.namePlaceholder')}…`}
                autoComplete="off"
                maxLength={60}
                className="min-w-0 flex-1 rounded-md border-0 bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="button" onClick={() => { void create(); }} disabled={!newTagName.trim() || creating} aria-label={t('tags.addTag')} aria-busy={creating} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
          {(createError || deleteError || editError) && <p className="m-0 px-2 py-1.5 text-xs text-destructive" role="alert">{createError || deleteError || editError}</p>}
          <div className="mt-1 max-h-64 overflow-y-auto" role="listbox" aria-label={t('sidebar.tags')}>
            {tags.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">{t('tags.empty')}</p> : tags.map((tag) => {
              const selected = value.includes(tag.id);
              const confirming = deleteConfirmId === tag.id;
              return (
                <div key={tag.id} role="presentation" className={cn('rounded-lg', confirming && 'bg-destructive/10')}>
                  <div className="flex items-center gap-1">
                    <button type="button" role="option" data-testid={`detail-tag-${tag.id}`} aria-selected={selected} onClick={() => toggle(tag.id)} className={cn('flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-8', selected && 'bg-muted font-medium')}>
                      <Check className={cn('h-3 w-3 shrink-0', !selected && 'opacity-0')} aria-hidden="true" />
                      <span className="truncate">#{tag.name}</span>
                    </button>
                    {onUpdateTag && (
                      <button type="button" aria-label={t('tags.editTag', { name: tag.name })} disabled={editingPending} onClick={() => { setEditing(tag.id); setEditName(tag.name); setEditColor(tag.color || ''); setEditError(''); }} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                    {onDeleteTag && (
                      <button type="button" aria-label={t('tags.deleteTag', { name: tag.name })} onClick={() => { setDeleteError(''); setDeleteConfirmId(confirming ? null : tag.id); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {editing === tag.id && (
                    <div className="flex flex-wrap gap-1 p-2">
                      <input aria-label={t('tags.editName')} value={editName} onChange={event => setEditName(event.target.value)} disabled={editingPending} maxLength={120} className="min-w-0 flex-1 rounded border p-1 text-xs" />
                      <input type="color" aria-label={t('tags.color')} value={editColor || primitiveColors.slate[500]} onChange={event => setEditColor(event.target.value)} disabled={editingPending} className="h-8 w-8" />
                      <button type="button" disabled={editingPending || !editName.trim()} onClick={() => void rename()} className="rounded bg-primary px-2 text-xs text-primary-foreground">{t('tags.save')}</button>
                      <button type="button" disabled={editingPending} onClick={() => setEditing(null)} className="px-2 text-xs">{t('tags.cancel')}</button>
                    </div>
                  )}
                  {confirming && (
                    <div className="px-2 pb-2 pt-1">
                      <p className="m-0 text-[0.68rem] leading-4 text-foreground">{t('tags.deleteConfirm', { name: tag.name })}</p>
                      <div className="mt-1.5 flex justify-end gap-1">
                        <button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-md px-2 py-1 text-[0.68rem] font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('tags.cancel')}</button>
                        <button type="button" onClick={() => { void remove(tag); }} disabled={deletingTagId === tag.id} aria-busy={deletingTagId === tag.id} className="rounded-md bg-destructive px-2 py-1 text-[0.68rem] font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('tags.delete')}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
