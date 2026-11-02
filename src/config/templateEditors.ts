// The templates whose Endeavours open in an editor of their own (docs/features/endeavours.md
// phase 7 (d)): Edit on one made from them (`Collection.templateId`) opens that editor, through
// uiStore.openEditCollection, and the editor's "All settings" opens the ordinary one. Kept apart
// from config/endeavourTemplates.ts so uiStore can read it without loading the templates.

export type TemplateEditorModal = 'subject-editor' | 'semester-editor';

export const TEMPLATE_EDITORS: Record<string, TemplateEditorModal> = {
  subject:  'subject-editor',
  semester: 'semester-editor',
};

export const editorFor = (templateId: string | undefined): TemplateEditorModal | null =>
  (templateId && TEMPLATE_EDITORS[templateId]) || null;
