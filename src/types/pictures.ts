// The picture library (services/pictures.ts): each picture is stored once and referred to by id
// wherever it's used (a note's or notebook's backdrop today). Synced (`pictures`).

export type PictureId = string & { readonly _brand: 'PictureId' };

// Where a picture was added: only backdrop pictures are offered in the backdrop picker; one pasted
// into a note's text or put on a Glossary card belongs to that note or card; an icon (a small
// square, components/IconPicker) is offered under "Your icons" wherever an icon is picked.
export type PictureOrigin = 'backdrop' | 'note' | 'card' | 'icon';

export interface Picture {
  id:        PictureId;
  // A compressed data URL; '' while encrypted (the data URL then lives only in encryptedPayload).
  src:       string;
  // Encrypted pictures belong to encrypted notes: readable only while the vault is unlocked.
  isEncrypted:      boolean;
  encryptedPayload: string | null;
  // An encrypted picture made from a plain one (choosing it for an encrypted note): that plain
  // picture, so one encrypted copy serves every encrypted note that chose it.
  copyOf:    PictureId | null;
  origin:    PictureOrigin;
  createdAt: string;
  updatedAt: string;
}
