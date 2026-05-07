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
import { useTrackerStore } from '@/store/trackerStore';

const EMPTY: AppData = {
  version:     2,
  tasks:       {} as AppData['tasks'],
  tags:        {} as AppData['tags'],
  collections: {} as AppData['collections'],
  purposes:    {} as AppData['purposes'],
};

export interface TaskActions {
  // Tasks
  addTask:     (input: CreateTaskInput) => void;
  updateTask:  (id: TaskId, changes: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
  toggleTask:  (id: TaskId) => void;
  deleteTask:  (id: TaskId) => void;
  archiveTask: (id: TaskId) => void;

  // Tags
  addTag:    (tag: Tag) => void;
  updateTag: (id: TagId, changes: Partial<Pick<Tag, 'name' | 'color' | 'notes'>>) => void;
  deleteTag: (id: TagId) => void;

  // Collections (projects, lists, trackers …)
  addCollection:    (input: CreateCollectionInput) => void;
  updateCollection: (id: CollectionId, changes: Partial<Pick<Collection, 'name' | 'color' | 'description' | 'deadline' | 'completed' | 'completedAt' | 'purposeIds' | 'tagIds' | 'fieldSchema' | 'routineTasks' | 'repeatConfig'>>) => void;
  deleteCollection: (id: CollectionId) => void;

  // Purposes
  addPurpose:    (input: CreatePurposeInput) => void;
  updatePurpose: (id: PurposeId, changes: Partial<Pick<Purpose, 'name' | 'color'>>) => void;
  deletePurpose: (id: PurposeId) => void;
}

type TaskStore = AppData & TaskActions;

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      ...EMPTY,

      // ── Tasks ──────────────────────────────────────────────────────────────

      addTask: (input) =>
        set((state) => {
          const task = createTask(input, Object.keys(state.tasks).length);
          const tasks: AppData['tasks'] = { ...state.tasks, [task.id]: task };

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
        }),

      updateTask: (id, changes) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return {};
          return {
            tasks: {
              ...state.tasks,
              [id]: { ...task, ...changes, updatedAt: now() },
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

      archiveTask: (id) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return {};
          return { tasks: { ...state.tasks, [id]: { ...task, archived: true, updatedAt: now() } } };
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
      version: 5,
      migrate: (persisted, fromVersion) => {
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
        return state;
      },
    }
  )
);
