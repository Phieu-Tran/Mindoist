import { propertiesForSection, type TaskPropertyDefinition, type TaskPropertySectionId } from './property-registry';
import { ColorField } from './properties/ColorField';
import { DeadlineField } from './properties/DeadlineField';
import { EstimateField } from './properties/EstimateField';
import { PlannedTimeField } from './properties/PlannedTimeField';
import { PriorityField } from './properties/PriorityField';
import { ProjectField } from './properties/ProjectField';
import { RecurrenceField } from './properties/RecurrenceField';
import { TagsField } from './properties/TagsField';
import type { TaskPropertyEditorProps } from './properties/types';

const sections: TaskPropertySectionId[] = ['organize', 'schedule', 'automation'];

function PropertyField({ definition, editor }: { definition: TaskPropertyDefinition; editor: TaskPropertyEditorProps }) {
  const { draft } = editor;
  switch (definition.id) {
    case 'project': return <ProjectField taskId={editor.taskId} value={draft.projectId} projectColumnId={draft.projectColumnId} projects={editor.projects} projectColumns={editor.projectColumns} save={editor.save} onChange={(value) => editor.onDraftChange('projectId', value)} onColumnChange={(value) => editor.onDraftChange('projectColumnId', value)} />;
    case 'tags': return <TagsField taskId={editor.taskId} value={draft.tagIds} tags={editor.tags} save={editor.save} onChange={(value) => editor.onDraftChange('tagIds', value)} onCreateTag={editor.onCreateTag} onDeleteTag={editor.onDeleteTag} />;
    case 'priority': return <PriorityField taskId={editor.taskId} value={draft.priority} save={editor.save} onChange={(value) => editor.onDraftChange('priority', value)} />;
    case 'color': return <ColorField taskId={editor.taskId} value={draft.color} save={editor.save} onChange={(value) => editor.onDraftChange('color', value)} onPreview={editor.onColorPreview} />;
    case 'deadline': return <DeadlineField taskId={editor.taskId} deadlineDate={draft.deadlineDate} deadlineTime={draft.deadlineTime} deadlineTimeZone={editor.deadlineTimeZone} startDate={draft.startDate} save={editor.save} onDeadlineDateChange={(value) => editor.onDraftChange('deadlineDate', value)} onDeadlineTimeChange={(value) => editor.onDraftChange('deadlineTime', value)} onStartDateChange={(value) => editor.onDraftChange('startDate', value)} />;
    case 'plannedTime': return <PlannedTimeField taskId={editor.taskId} defaultDate={draft.deadlineDate} onChanged={editor.onTasksChanged} />;
    case 'estimate': return <EstimateField taskId={editor.taskId} value={draft.estimateMin} save={editor.save} onChange={(value) => editor.onDraftChange('estimateMin', value)} />;
    case 'recurrence': return <RecurrenceField taskId={editor.taskId} value={draft} save={editor.save} onChange={(key, value) => {
      if (key === 'recurrencePreset') editor.onDraftChange(key, value as TaskPropertyEditorProps['draft']['recurrencePreset']);
      else if (key === 'customRrule') editor.onDraftChange(key, value as string);
      else if (key === 'recurrenceBasis') editor.onDraftChange(key, value as TaskPropertyEditorProps['draft']['recurrenceBasis']);
      else editor.onDraftChange(key, value as TaskPropertyEditorProps['draft']['recurringResetMode']);
    }} />;
  }
}

export function TaskPropertyEditor(props: TaskPropertyEditorProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/25 p-2.5" data-testid="task-property-registry">
      {sections.map((section) => (
        <div key={section} data-property-section={section} className={section === 'schedule' ? 'grid gap-2' : 'flex flex-wrap items-start gap-1.5'}>
          {propertiesForSection(section).map((definition) => <PropertyField key={definition.id} definition={definition} editor={props} />)}
        </div>
      ))}
    </div>
  );
}
