-- Tentative events: CalendarEvent.status ('confirmed' | 'tentative'), see CLAUDE.md
-- "Tentative events". Default 'confirmed' so every existing row keeps its current meaning.
alter table calendar_events
  add column status text not null default 'confirmed';
