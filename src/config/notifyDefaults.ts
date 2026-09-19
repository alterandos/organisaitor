// A reminder with a date but no time has no natural moment to fire at, so it carries its own:
// N days before its date (0 = on the day itself), at a time of day. Default: the evening before.
export const DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE = 1;
export const DEFAULT_ALLDAY_NOTIFY_AT_TIME = '17:00';
