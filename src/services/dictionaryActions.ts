import { addToDictionary, cleanWord } from '@/services/dictionary';
import { useListStore } from '@/store/listStore';
import { showToast } from '@/components/Toast/showToast';
import { LABELS } from '@/config/labels';

// "Add to dictionary" on selected text (the `\` selection menu): adds the word, then says whether
// its meaning was found, with Undo while it's new.
export async function addWordFromSelection(text: string): Promise<void> {
  const word = cleanWord(text);
  if (!word) return;
  const L = LABELS.dictionary;
  const result = await addToDictionary(word);
  if (!result) return;
  if (result.existed) { showToast({ message: L.already(word) }); return; }
  showToast({
    message: L.added(word),
    detail: result.found ? undefined : L.notFound,
    actions: [{ label: LABELS.taskLinks.toastUndo, onClick: () => useListStore.getState().deleteListItem(result.itemId) }],
  });
}
