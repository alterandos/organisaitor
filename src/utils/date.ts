export const now = (): string => new Date().toISOString();

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const formatTime = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

export const formatDeadline = (date: string, time: string | null): string =>
  time ? `${formatDate(date)} ${formatTime(time)}` : formatDate(date);

export const isOverdue = (date: string, time: string | null = null): boolean => {
  const target = time ? new Date(`${date}T${time}`) : new Date(date);
  return target < new Date();
};

// Adds (or subtracts) minutes to a HH:MM string, clamped to 00:00–23:59.
export const timeAddMinutes = (time: string, minutes: number): string => {
  const [h, m] = time.split(':').map(Number);
  const total  = Math.max(0, Math.min(1439, h * 60 + m + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
