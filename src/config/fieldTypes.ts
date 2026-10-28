import type { FieldType } from '@/types';

// The kinds of FieldSchema field a person can choose (a tracker's columns, a Type's fields), in
// the order they're offered. FieldInput (components/FieldInput) fills each one in.
export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Text' },
  { value: 'number',   label: 'Number' },
  { value: 'duration', label: 'Duration (h/m/s)' },
  { value: 'boolean',  label: 'Checkbox' },
  { value: 'rating',   label: 'Rating' },
  { value: 'select',   label: 'Select' },
  { value: 'date',     label: 'Date' },
  { value: 'url',      label: 'URL' },
];
