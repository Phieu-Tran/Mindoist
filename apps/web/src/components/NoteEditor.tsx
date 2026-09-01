import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useDialogA11y } from './ui/dialog';
import { cn } from '@/lib/utils';
import type { Note, UpdateNoteRequest } from '@mindoist/shared/types';

interface Props {
  note: Note;
  onSave: (id: string, req: UpdateNoteRequest) => Promise<void> | void;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export function NoteEditor({ note, onSave, onClose, onDelete }: Props) {
  const { t } = useTranslation('tasks');
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(note.title || '');
  const [content, setContent] = useState(note.content || '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteDialogRef = useDialogA11y({
    open: showDeleteConfirm,
    onClose: () => setShowDeleteConfirm(false),
  });

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Reset when note changes
  useEffect(() => {
    setTitle(note.title || '');
    setContent(note.content || '');
    setDirty(false);
  }, [note.id, note.title, note.content]);

  const handleSave = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await onSave(note.id, { title: title || null, content: content || null });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [dirty, note.id, title, content, onSave]);

  // Auto-save on blur or after 2s idle
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(handleSave, 2000);
    return () => clearTimeout(timer);
  }, [dirty, handleSave]);

  const handleClose = useCallback(() => {
    if (dirty) {
      handleSave().then(onClose);
    } else {
      onClose();
    }
  }, [dirty, handleSave, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-card md:relative md:inset-auto md:w-[32rem] md:border-l md:border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0" aria-label={t('notes.editor')}>
        <button
          className="md:hidden min-h-11 min-w-11 rounded hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={handleClose}
          aria-label={t('notes.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        {dirty && (
          <Button size="sm" variant="default" onClick={handleSave} disabled={saving}>
            {saving ? '…' : t('detail.save')}
          </Button>
        )}
        <button
          className="min-h-11 min-w-11 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setShowDeleteConfirm(true)}
          aria-label={t('notes.delete')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          className="min-h-11 min-w-11 rounded hover:bg-accent text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={handleClose}
          aria-label={t('notes.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 md:p-5">
        <label htmlFor="note-editor-title" className="sr-only">{t('notes.titleLabel')}</label>
        <Input
          id="note-editor-title"
          ref={titleRef}
          value={title}
          onChange={e => { setTitle(e.target.value); setDirty(true); }}
          placeholder={t('notes.untitled')}
          aria-label={t('notes.titleLabel')}
          className="h-auto px-0 text-lg font-semibold border-none shadow-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <label htmlFor="note-editor-content" className="sr-only">{t('notes.contentLabel')}</label>
        <textarea
          id="note-editor-content"
          ref={contentRef}
          value={content}
          onChange={e => { setContent(e.target.value); setDirty(true); }}
          placeholder={t('notes.editorPlaceholder')}
          aria-label={t('notes.contentLabel')}
          className={cn(
            'w-full min-h-[300px] resize-none border-none shadow-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-transparent',
            'text-base leading-relaxed text-foreground placeholder:text-muted-foreground/50',
            'font-sans'
          )}
        />
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div
          className="frosted-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            ref={deleteDialogRef}
            className="frosted-surface bg-card rounded-xl border border-border p-6 w-[90vw] max-w-sm shadow-lg"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="note-delete-title"
            aria-describedby="note-delete-description"
          >
            <h3 id="note-delete-title" className="font-semibold text-base mb-2">{t('notes.delete')}</h3>
            <p id="note-delete-description" className="text-sm text-muted-foreground mb-4">
              {t('notes.deleteConfirm')}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                {t('notes.cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { onDelete(note.id); setShowDeleteConfirm(false); }}
              >
                {t('notes.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
