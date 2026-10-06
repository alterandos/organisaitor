// "Open this item's list of dates when its pane next shows": set by a click on a repeating item's
// date in the inline pane (artifactGroups.ts, which then expands it), read once by WhenLine as the
// expanded pane mounts. Keyed "<targetType>:<targetId>".
const requests = new Set<string>();

export function requestOccurrenceList(key: string): void { requests.add(key); }
export function takeOccurrenceListRequest(key: string): boolean { return requests.delete(key); }
