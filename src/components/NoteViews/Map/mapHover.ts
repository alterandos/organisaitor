import { createContext } from 'react';

// What the pointer is over on the Map, shared by its nodes and links: a blob (its notes fan out
// with their titles) or a note (its links light up, the notes it links to show their names, the
// rest fades). `linked` is each node's neighbours by key (`note:<id>`, `<type>:<id>`).
export interface MapHoverState {
  blobId:    string | null;
  setBlobId: (id: string | null) => void;
  noteKey:   string | null;
  setNoteKey: (key: string | null) => void;
  linked:    Map<string, Set<string>>;
}

export const MapHover = createContext<MapHoverState>({ blobId: null, setBlobId: () => {}, noteKey: null, setNoteKey: () => {}, linked: new Map() });
