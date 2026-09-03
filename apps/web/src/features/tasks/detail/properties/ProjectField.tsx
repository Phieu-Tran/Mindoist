import { Columns3, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProjectColumn } from '@mindoist/shared/types';
import { Select } from '@/components/ui/select';
import { usePropertyMutation } from './use-property-mutation';
import type { ProjectOption, PropertySave } from './types';

interface Props {
  taskId: string;
  value: string;
  projectColumnId: string;
  projects: ProjectOption[];
  projectColumns: ProjectColumn[];
  save: PropertySave;
  onChange: (value: string) => void;
  onColumnChange: (value: string) => void;
}

export function ProjectField({ taskId, value, projectColumnId, projects, projectColumns, save, onChange, onColumnChange }: Props) {
  const { t } = useTranslation('tasks');
  const { commit, error } = usePropertyMutation(taskId, save);
  const select = (next: string) => {
    onChange(next);
    onColumnChange('');
    void commit({ projectId: next || null, projectColumnId: null });
  };
  return (
    <>
      <div className="flex min-h-11 shrink-0 items-center gap-1 rounded-control bg-background/75 pl-1.5 xl:min-h-7" title={error ?? undefined}>
        <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Select
          value={value}
          options={[{ value: '', label: t('detail.noProject') }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
          onChange={select}
          aria-label={t('detail.project')}
          data-testid="detail-project"
          size="sm"
          align="left"
          className="w-auto min-w-0 max-w-[9rem]"
          triggerClassName="border-none bg-transparent px-1.5 hover:bg-transparent"
        />
      </div>
      {value && (
        <div className="flex min-h-11 shrink-0 items-center gap-1 rounded-control bg-background/75 pl-1.5 xl:min-h-7" title={error ?? undefined}>
          <Columns3 className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Select
            value={projectColumnId}
            options={[{ value: '', label: t('detail.noKanbanColumn') }, ...projectColumns.map((column) => ({ value: column.id, label: column.name }))]}
            onChange={(next) => {
              onColumnChange(next);
              void commit({ projectColumnId: next || null });
            }}
            aria-label={t('detail.kanbanColumn')}
            data-testid="detail-project-column"
            size="sm"
            align="left"
            className="w-auto min-w-0 max-w-[9rem]"
            triggerClassName="border-none bg-transparent px-1.5 hover:bg-transparent"
          />
        </div>
      )}
    </>
  );
}
