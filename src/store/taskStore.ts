import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppData, Task, TaskId, TagId, Tag,
  CollectionId, Collection, Purpose, PurposeId,
  CreateTaskInput, CreateCollectionInput, CreatePurposeInput,
  FieldSchema, RoutineTask,
} from '@/types';
import { newCollectionId, newPurposeId } from '@/utils/id';
import { createTask } from '@/services/taskService';
import { now } from '@/utils/date';
import { mergeNewLinks } from '@/utils/links';
import { useTrackerStore } from '@/store/trackerStore';
import { persistStorage } from '@/utils/persistStorage';

const EMPTY: AppData = {
  version:     2,
  tasks:       {} as AppData['tasks'],
  tags:        {} as AppData['tags'],
  collections: {} as AppData['collections'],
  purposes:    {} as AppData['purposes'],
};

export interface TaskActions {
  // Tasks
  addTask:     (input: CreateTaskInput) => TaskId;
  updateTask:  (id: TaskId, changes: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
  toggleTask:  (id: TaskId) => void;
  deleteTask:  (id: TaskId) => void;
  archiveTask: (id: TaskId, reason?: string | null) => void;
  restoreTask: (id: TaskId) => void;

  // Tags
  addTag:    (tag: Tag) => void;
  updateTag: (id: TagId, changes: Partial<Pick<Tag, 'name' | 'color' | 'notes'>>) => void;
  deleteTag: (id: TagId) => void;

  // Collections (projects, lists, trackers …)
  addCollection:    (input: CreateCollectionInput) => void;
  updateCollection: (id: CollectionId, changes: Partial<Pick<Collection, 'name' | 'color' | 'description' | 'deadline' | 'completed' | 'completedAt' | 'purposeIds' | 'tagIds' | 'fieldSchema' | 'routineTasks' | 'repeatConfig' | 'collectionId' | 'archivedAt'>>) => void;
  deleteCollection: (id: CollectionId) => void;

  // Purposes
  addPurpose:    (input: CreatePurposeInput) => void;
  updatePurpose: (id: PurposeId, changes: Partial<Pick<Purpose, 'name' | 'color' | 'description' | 'archivedAt'>>) => void;
  deletePurpose: (id: PurposeId) => void;
}

type TaskStore = AppData & TaskActions;

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      ...EMPTY,

      // ── Tasks ──────────────────────────────────────────────────────────────

      addTask: (input) => {
        const task = createTask(input, 0);
        set((state) => {
          const updatedTask = { ...task, sortOrder: Object.keys(state.tasks).length };
          const tasks: AppData['tasks'] = { ...state.tasks, [task.id]: updatedTask };

          // If this is a sub-task, register it on the parent
          if (task.parentId && state.tasks[task.parentId]) {
            const parent = state.tasks[task.parentId];
            tasks[task.parentId] = {
              ...parent,
              subtaskIds: [...(parent.subtaskIds ?? []), task.id],
              updatedAt: now(),
            };
          }
          return { tasks };
        });
        return task.id;
      },

      updateTask: (id, changes) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return {};
          // Links newly typed into the notes are copied into the links list too.
          const patch = changes.notes !== undefined
            ? { ...changes, links: mergeNewLinks(changes.links ?? task.links ?? [], changes.notes, task.notes) }
            : changes;
          return {
            tasks: {
              ...state.tasks,
              [id]: { ...task, ...patch, updatedAt: now() },
            },
          };
        }),

      toggleTask: (id) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return {};
          const completed = !task.completed;
          return {
            tasks: {
              ...state.tasks,
              [id]: { ...task, completed, completedAt: completed ? now() : null, updatedAt: now() },
            },
          };
        }),

      // Sub-tasks are archived with their parent under the same archivedAt stamp, which is
      // what lets restoreTask bring back exactly that group and not sub-tasks archived on
      // their own earlier.
      archiveTask: (id, reason) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task || task.archived) return {};
          const ts = now();
          const archiveReason = reason?.trim() || null;
          const stamp = { archived: true, archivedAt: ts, archiveReason, updatedAt: ts };
          const tasks: AppData['tasks'] = { ...state.tasks, [id]: { ...task, ...stamp } };
          for (const subId of task.subtaskIds ?? []) {
            const sub = tasks[subId];
            if (sub && !sub.archived) tasks[subId] = { ...sub, ...stamp };
          }
          return { tasks };
        }),

      restoreTask: (id) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task || !task.archived) return {};
          const ts = now();
          const clear = { archived: false, archivedAt: null, archiveReason: null, updatedAt: ts };
          const tasks: AppData['tasks'] = { ...state.tasks, [id]: { ...task, ...clear } };
          for (const subId of task.subtaskIds ?? []) {
            const sub = tasks[subId];
            if (sub?.archived && sub.archivedAt === task.archivedAt) tasks[subId] = { ...sub, ...clear };
          }
          return { tasks };
        }),

      deleteTask: (id) =>
        set((state) => {
          const task = state.tasks[id];
          const tasks = { ...state.tasks };
          delete tasks[id];

          // Remove from parent's subtaskIds
          if (task?.parentId && tasks[task.parentId]) {
            const parent = tasks[task.parentId];
            tasks[task.parentId] = {
              ...parent,
              subtaskIds: (parent.subtaskIds ?? []).filter((s) => s !== id),
              updatedAt: now(),
            };
          }
          return { tasks };
        }),

      // ── Tags ───────────────────────────────────────────────────────────────

      addTag: (tag) =>
        set((state) => ({ tags: { ...state.tags, [tag.id]: tag } })),

      updateTag: (id, changes) =>
        set((state) => {
          const tag = state.tags[id];
          if (!tag) return {};
          return { tags: { ...state.tags, [id]: { ...tag, ...changes } } };
        }),

      deleteTag: (id) =>
        set((state) => {
          const tags = { ...state.tags };
          delete tags[id];
          const tasks = Object.fromEntries(
            Object.entries(state.tasks).map(([tid, task]) => [
              tid,
              { ...task, tagIds: (task.tagIds ?? []).filter((t) => t !== id) },
            ])
          ) as AppData['tasks'];
          const collections = Object.fromEntries(
            Object.entries(state.collections).map(([cid, col]) => [
              cid,
              { ...col, tagIds: (col.tagIds ?? []).filter((t) => t !== id) },
            ])
          ) as AppData['collections'];
          return { tags, tasks, collections };
        }),

      // ── Collections ────────────────────────────────────────────────────────

      addCollection: (input) =>
        set((state) => {
          const ts = now();
          const collection: Collection = {
            id:           newCollectionId(),
            kind:         input.kind,
            name:         input.name.trim(),
            description:  input.description  ?? null,
            color:        input.color        ?? null,
            purposeIds:   input.purposeIds   ?? [],
            tagIds:       input.tagIds       ?? [],
            deadline:     input.deadline     ?? null,
            completed:    false,
            completedAt:  null,
            fieldSchema:  input.fieldSchema  ?? [],
            routineTasks: input.routineTasks ?? [],
            repeatConfig: input.repeatConfig ?? null,
            collectionId: input.collectionId ?? null,
            archivedAt:   null,
            createdAt:    ts,
            updatedAt:    ts,
          };
          return { collections: { ...state.collections, [collection.id]: collection } };
        }),

      updateCollection: (id, changes) =>
        set((state) => {
          const col = state.collections[id];
          if (!col) return {};
          return {
            collections: {
              ...state.collections,
              [id]: { ...col, ...changes, updatedAt: now() },
            },
          };
        }),

      deleteCollection: (id) => {
        // Delete tracker entries for this collection if it's a tracker
        useTrackerStore.getState().deleteEntriesForTracker(id as CollectionId);
        set((state) => {
          const collections = { ...state.collections };
          delete collections[id];
          // Detach tasks from deleted collection
          const tasks = Object.fromEntries(
            Object.entries(state.tasks).map(([tid, task]) => [
              tid,
              task.collectionId === id ? { ...task, collectionId: null } : task,
            ])
          ) as AppData['tasks'];
          return { collections, tasks };
        });
      },

      // ── Purposes ───────────────────────────────────────────────────────────

      addPurpose: (input) =>
        set((state) => {
          const ts = now();
          const purpose: Purpose = {
            id:          newPurposeId(),
            name:        input.name.trim(),
            description: input.description ?? null,
            color:       input.color       ?? null,
            archivedAt:  null,
            createdAt:   ts,
            updatedAt:   ts,
          };
          return { purposes: { ...state.purposes, [purpose.id]: purpose } };
        }),

      updatePurpose: (id, changes) =>
        set((state) => {
          const purpose = state.purposes[id];
          if (!purpose) return {};
          return { purposes: { ...state.purposes, [id]: { ...purpose, ...changes, updatedAt: now() } } };
        }),

      deletePurpose: (id) =>
        set((state) => {
          const purposes = { ...state.purposes };
          delete purposes[id];
          const tasks = Object.fromEntries(
            Object.entries(state.tasks).map(([tid, task]) => [
              tid,
              { ...task, purposeIds: (task.purposeIds ?? []).filter((p) => p !== id) },
            ])
          ) as AppData['tasks'];
          const collections = Object.fromEntries(
            Object.entries(state.collections).map(([cid, col]) => [
              cid,
              { ...col, purposeIds: (col.purposeIds ?? []).filter((p) => p !== id) },
            ])
          ) as AppData['collections'];
          return { purposes, tasks, collections };
        }),
    }),
    {
      name:    'todo-app-storage',
      storage: persistStorage(),
      version: 11,
      // The steps up to v10 each return early, so v11 is applied afterwards to whatever they
      // produce — otherwise a v9 store would return from its own step and never reach it.
      migrate: (persisted, fromVersion) => {
        const migrated = ((): AppData => {
        const state = persisted as AppData & TaskActions;
        if (fromVersion < 2) return EMPTY;
        // Apply all collection patches cumulatively
        if (fromVersion < 5 && state.collections) {
          const patched: AppData['collections'] = {} as AppData['collections'];
          for (const [id, col] of Object.entries(state.collections)) {
            const c = col as Collection & { fieldSchema?: FieldSchema[]; tagIds?: TagId[]; routineTasks?: RoutineTask[] };
            patched[id as CollectionId] = {
              ...c,
              fieldSchema:  c.fieldSchema  ?? [],
              tagIds:       c.tagIds       ?? [],
              routineTasks: c.routineTasks ?? [],
              repeatConfig: (c as Collection).repeatConfig ?? null,
            } as Collection;
          }
          return { ...state, collections: patched };
        }
        if (fromVersion < 6 && state.tasks) {
          const patched: AppData['tasks'] = {} as AppData['tasks'];
          for (const [id, task] of Object.entries(state.tasks)) {
            const t = task as Task & { scheduledAt?: string | null; scheduledTime?: string | null; calendarEventId?: unknown };
            patched[id as TaskId] = {
              ...t,
              scheduledAt:     t.scheduledAt     ?? null,
              scheduledTime:   t.scheduledTime   ?? null,
              calendarEventId: (t.calendarEventId ?? null) as Task['calendarEventId'],
            } as Task;
          }
          return { ...state, tasks: patched };
        }
        if (fromVersion < 7 && state.collections) {
          const patched: AppData['collections'] = {} as AppData['collections'];
          for (const [id, col] of Object.entries(state.collections)) {
            const c = col as Collection & { collectionId?: CollectionId | null };
            patched[id as CollectionId] = { ...c, collectionId: c.collectionId ?? null } as Collection;
          }
          return { ...state, collections: patched };
        }
        if (fromVersion < 8) {
          const collections: AppData['collections'] = {} as AppData['collections'];
          for (const [id, col] of Object.entries(state.collections ?? {})) {
            const c = col as Collection & { archivedAt?: string | null };
            collections[id as CollectionId] = { ...c, archivedAt: c.archivedAt ?? null } as Collection;
          }
          const purposes: AppData['purposes'] = {} as AppData['purposes'];
          for (const [id, purpose] of Object.entries(state.purposes ?? {})) {
            const p = purpose as Purpose & { archivedAt?: string | null };
            purposes[id as PurposeId] = { ...p, archivedAt: p.archivedAt ?? null } as Purpose;
          }
          return { ...state, collections, purposes };
        }
        if (fromVersion < 9 && state.tasks) {
          const patched: AppData['tasks'] = {} as AppData['tasks'];
          for (const [id, task] of Object.entries(state.tasks)) {
            const t = task as Task & { calendarReminderId?: unknown };
            patched[id as TaskId] = {
              ...t,
              calendarReminderId: (t.calendarReminderId ?? null) as Task['calendarReminderId'],
            } as Task;
          }
          return { ...state, tasks: patched };
        }
        if (fromVersion < 10 && state.tasks) {
          const patched: AppData['tasks'] = {} as AppData['tasks'];
          for (const [id, task] of Object.entries(state.tasks)) {
            const t = task as Task & { crossAppRefs?: unknown };
            patched[id as TaskId] = {
              ...t,
              crossAppRefs: (t.crossAppRefs ?? []) as Task['crossAppRefs'],
            } as Task;
          }
          return { ...state, tasks: patched };
        }
        return state;
        })();

        if (fromVersion >= 11 || !migrated.tasks) return migrated;
        const tasks: AppData['tasks'] = {} as AppData['tasks'];
        for (const [id, task] of Object.entries(migrated.tasks)) {
          const t = task as Task & { archivedAt?: string | null; archiveReason?: string | null };
          tasks[id as TaskId] = {
            ...t,
            archivedAt:    t.archivedAt ?? (t.archived ? t.updatedAt : null),
            archiveReason: t.archiveReason ?? null,
          } as Task;
        }
        return { ...migrated, tasks };
      },
    }
  )
);
