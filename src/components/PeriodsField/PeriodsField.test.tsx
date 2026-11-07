// @vitest-environment jsdom
//
// The editor of named periods (components/PeriodsField): a period added runs during it if nothing
// does yet, else pauses; its dates are kept as typed; one from above can be used or left.
import '@testing-library/jest-dom/vitest';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PeriodsField } from './PeriodsField';
import { LABELS } from '@/config/labels';
import type { DateUse, FieldSchema } from '@/types';

afterEach(cleanup);
const L = LABELS.periods;

const last: { fields: FieldSchema[]; values: Record<string, unknown>; use: DateUse | null } = { fields: [], values: {}, use: null };
function Host() {
  const [fields, setFields] = useState<FieldSchema[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [use, setUse] = useState<DateUse | null>(null);
  useEffect(() => { Object.assign(last, { fields, values, use }); });
  return <PeriodsField fields={fields} values={values} onFields={(f, v) => { setFields(f); setValues(v); }} inherited={[]} use={use} above={null} onUse={setUse} fromName={() => ''} />;
}

function typeDate(group: HTMLElement, day: string, month: string, year: string) {
  const [d, m, y] = within(group).getAllByRole('textbox');
  fireEvent.focus(d); fireEvent.change(d, { target: { value: day } });
  fireEvent.focus(m); fireEvent.change(m, { target: { value: month } });
  fireEvent.focus(y); fireEvent.change(y, { target: { value: year } });
  fireEvent.blur(y);
}

describe('PeriodsField', () => {
  it('keeps the dates typed, and the first period added runs during it, the next pauses', () => {
    render(<Host />);
    fireEvent.click(screen.getByText(L.add));
    fireEvent.change(screen.getByRole('textbox', { name: L.name }), { target: { value: 'Teaching' } });
    typeDate(screen.getByRole('group', { name: `${L.from}: Teaching` }), '27', '07', '2026');
    typeDate(screen.getByRole('group', { name: `${L.to}: Teaching` }), '30', '10', '2026');
    const id = last.fields[0].id;
    // Both sides kept (each starts from the other's latest change), the end never before the start.
    const r = last.values[id] as { from: string; to: string };
    expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.to >= r.from).toBe(true);
    expect(last.use).toEqual({ runs: [id], pauses: [] });
    fireEvent.click(screen.getByText(L.add));
    expect(last.use?.pauses).toEqual([last.fields[1].id]);
  });
});
