// Choosing tags (services/tags.ts): a tag typed that doesn't exist is a draft until the form saves,
// so a form closed without saving makes nothing; an existing one of that name is reused, whatever
// its case.
import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { commitTags, findTag, isDraftTag, tagByName, tagLabel, tagsByName } from './tags';

beforeEach(() => useTaskStore.setState(useTaskStore.getInitialState(), true));

describe('tag drafts', () => {
  it('a new name is a draft, named, until committed; then it’s a tag', () => {
    const id = tagByName('Reading');
    expect(isDraftTag(id)).toBe(true);
    expect(tagLabel(id)).toBe('Reading');
    expect(Object.keys(useTaskStore.getState().tags)).toHaveLength(0);
    expect(commitTags([id])).toEqual([id]);
    expect(useTaskStore.getState().tags[id]).toMatchObject({ name: 'Reading', icon: null, archivedAt: null });
    expect(isDraftTag(id)).toBe(false);
  });

  it('an existing tag of that name is used, in any case; the same name twice is one draft', () => {
    useTaskStore.getState().addTag({ id: 'u' as never, name: 'University' });
    expect(tagByName('university')).toBe('u');
    expect(tagByName('Later')).toBe(tagByName('later'));
    expect(findTag('UNIVERSITY')?.id).toBe('u');
  });

  it('tags by name are made at once (a template’s, on Create)', () => {
    const [id] = tagsByName(['Training', ' ']);
    expect(useTaskStore.getState().tags[id].name).toBe('Training');
  });
});
