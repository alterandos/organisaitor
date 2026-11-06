// Features switched off for now, kept in the code (CLAUDE.md "Sunset features"). Turning one back on
// is flipping its flag here: every screen and behaviour that belongs to it checks the flag, and its
// stored data was never removed.

// Types (CLAUDE.md "Types", docs/features/endeavours.md "Phase 3 as built"): sunset 2026-11-04 at the
// user's request ("types have overcomplicated things"), to revisit later. Off: no Type picker, Type
// fields or Manage → Types; templates and the outline reader make nothing typed (an Endeavour's Type
// fields become details of its own; an assessment's worth goes in its notes); a birthday or journey
// from an import or old data gets its icon and Show quieter without a Type. Types and the values on
// items stay stored and synced.
export const TYPES_ENABLED = false;
