import { nanoid } from 'nanoid';
import type { TaskId, TagId, CollectionId, PurposeId, CalendarEventId, CalendarReminderId } from '@/types';

export const newTaskId             = (): TaskId             => nanoid() as TaskId;
export const newTagId              = (): TagId              => nanoid() as TagId;
export const newCollectionId       = (): CollectionId       => nanoid() as CollectionId;
export const newPurposeId          = (): PurposeId          => nanoid() as PurposeId;
export const newCalendarEventId    = (): CalendarEventId    => nanoid() as CalendarEventId;
export const newCalendarReminderId = (): CalendarReminderId => nanoid() as CalendarReminderId;
