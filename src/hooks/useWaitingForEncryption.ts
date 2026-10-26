import { useNoteStore } from '@/store/noteStore';
import { useTaskStore } from '@/store/taskStore';
import { isWaitingForEncryption, type EncryptableKind } from '@/services/encryption/kinds';

// Encryption by scope: whether this note or list is covered by an encrypted notebook or Endeavour
// but not encrypted yet (the vault is locked), for the "waiting to be encrypted" badge.
export function useWaitingForEncryption(kind: EncryptableKind['id'], record: unknown): boolean {
  const noteTags = useNoteStore((s) => s.noteTags);
  const collections = useTaskStore((s) => s.collections);
  return !!record && isWaitingForEncryption(kind, record, { noteTags, collections });
}
