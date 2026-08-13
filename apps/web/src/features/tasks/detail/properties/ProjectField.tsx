import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { usePropertyMutation } from './use-property-mutation';
import type { ProjectOption, PropertySave } from './types';

interface Props {
  taskId: string;
  value: string;
  projects: ProjectOption[];
  save: PropertySave;
  onChange: (value: string) => void;
}

export function ProjectField({ taskId, value, projects, save, onChange }: Props) {
  const { t } = useTranslation('tasks');
  const { commit, error } = usePropertyMutation(taskId, save);
  const select = (next: string) => {
    onChange(next);
    void commit({ projectId: next || null });
  };
  return (
    <div className="flex min-h-11 shrink-0 items-center gap-1 rounded-control bg-background/75 pl-1.5 xl:min-h-7" title={error ?? undefined}>
      <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Select
        value={value}
        options={[{ value: '', label: t('detail.noProject') }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
        onChange={select}
        data-testid="detail-project"
        size="sm"
        align="left"
        className="w-auto min-w-0 max-w-[9rem]"
        triggerClassName="border-none bg-transparent px-1.5 hover:bg-transparent"
      />
    </div>
  );
}
