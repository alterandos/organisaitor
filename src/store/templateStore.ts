import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { EndeavourTemplateDef, EndeavourTemplateId } from '@/types/templates';
import { now } from '@/utils/date';
import { persistStorage } from '@/utils/persistStorage';
import { moveToTrash } from '@/services/trashCapture';
import { normaliseTemplate } from '@/utils/templatePlan';

// The person's own Endeavour templates (types/templates.ts), synced (`endeavour_templates`, migration
// 072). The built-in ones are config/defaultTemplates.ts; editing one adds the person's copy here
// (`builtIn`). Read them together through services/templates.ts.

export type TemplateInput = Omit<EndeavourTemplateDef, 'id' | 'createdAt' | 'updatedAt'>;

interface TemplateState {
  templates: Record<EndeavourTemplateId, EndeavourTemplateDef>;
  addTemplate:    (input: TemplateInput) => EndeavourTemplateId;
  updateTemplate: (id: EndeavourTemplateId, changes: Partial<Omit<EndeavourTemplateDef, 'id' | 'createdAt'>>) => void;
  deleteTemplate: (id: EndeavourTemplateId) => void;
}

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set) => ({
      templates: {},

      addTemplate: (input) => {
        const id = nanoid() as EndeavourTemplateId;
        const ts = now();
        set((s) => ({ templates: { ...s.templates, [id]: { ...input, name: input.name.trim(), id, createdAt: ts, updatedAt: ts } } }));
        return id;
      },

      updateTemplate: (id, changes) => set((s) => {
        const t = s.templates[id];
        if (!t) return {};
        return { templates: { ...s.templates, [id]: { ...t, ...changes, updatedAt: now() } } };
      }),

      deleteTemplate: (id) => set((s) => {
        const { [id]: removed, ...rest } = s.templates;
        if (removed) moveToTrash('endeavourTemplate', removed);
        return { templates: rest as Record<EndeavourTemplateId, EndeavourTemplateDef> };
      }),
    }),
    {
      name: 'endeavour-templates',
      storage: persistStorage(),
      // v2 (2026-11-06): a template only fills in the form (types/templates.ts); one from before is
      // read into today's shape (a notebook in it ticks "Make a notebook"; the rest is dropped).
      version: 2,
      migrate: (persisted, fromVersion) => {
        const state = persisted as { templates?: Record<string, unknown> };
        if (fromVersion < 2 && state.templates) {
          state.templates = Object.fromEntries(Object.entries(state.templates).map(([k, t]) => [k, normaliseTemplate(t as Record<string, unknown>)]));
        }
        return state as unknown as TemplateState;
      },
    },
  ),
);
