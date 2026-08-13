import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, FileText, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import type { Note } from '@mindoist/shared/types';

interface Props {
  notes: Note[];
  loading: boolean;
  error: string | null;
  selectedNoteId?: string;
  onSelect: (note: Note) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

function timeAgo(dateStr: string, locale: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return locale === 'vi' ? 'vừa xong' : 'just now';
  if (mins < 60) return locale === 'vi' ? `${mins} phút trước` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return locale === 'vi' ? `${hrs} giờ trước` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return locale === 'vi' ? `${days} ngày trước` : `${days}d ago`;
  // Fixed DD/MM/YYYY, matching the rest of the app's date display — not
  // `toLocaleDateString()`, which renders in the browser's default locale
  // regardless of the app's own language setting.
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function NoteList({ notes, loading, error, selectedNoteId, onSelect, onCreate, onDelete }: Props) {
  const { t, i18n } = useTranslation('tasks');
  const locale = i18n.language;

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        {t('notes.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="p-4 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
        {error}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground text-sm mb-3">
          {t('notes.empty')}
        </p>
        <Button size="sm" onClick={onCreate}>
          <Plus className="w-4 h-4 mr-1" />
          {t('notes.create')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1" role="list" aria-label={t('sidebar.notes')}>
      <div className="flex justify-end mb-2">
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus className="w-4 h-4 mr-1" />
          {t('notes.create')}
        </Button>
      </div>
      {notes.map(note => (
        <div
          key={note.id}
          role="listitem"
          className={cn(
            'group flex items-start gap-2 rounded-lg border p-1 transition-colors',
            'hover:bg-accent/50',
            selectedNoteId === note.id
              ? 'border-primary bg-accent/30'
              : 'border-transparent'
          )}
        >
          <button
            type="button"
            aria-current={selectedNoteId === note.id ? 'page' : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-md p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelect(note)}
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium truncate">
                {note.title || t('notes.untitled')}
              </h3>
              {note.content && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">
                  {note.content.replace(/[#*_`~]/g, '').slice(0, 120)}
                </p>
              )}
            </div>
            <span className="mt-1 block text-xs text-muted-foreground">
              {timeAgo(note.updatedAt, locale)}
            </span>
          </button>
          <button
            type="button"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover:opacity-100"
            onClick={() => onDelete(note.id)}
            aria-label={`${t('notes.delete')}: ${note.title || t('notes.untitled')}`}
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
