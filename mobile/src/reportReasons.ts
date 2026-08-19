/**
 * Report reasons — pure TypeScript on purpose, like `taxonomy.ts`: the web
 * client imports this via the `@mobile/reportReasons` alias, so there is a
 * single copy of the keys and their Turkish labels. The keys must match the
 * backend's REASONS list and the SQL CHECK in 001_init.sql; adding a reason
 * means touching all three together.
 */
export type ReportTargetType = 'animal' | 'comment' | 'care_action' | 'user';
export type ReportReason = 'spam' | 'abuse' | 'wrong_info' | 'animal_welfare' | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam / alakasız' },
  { key: 'abuse', label: 'Hakaret veya taciz' },
  { key: 'wrong_info', label: 'Yanlış bilgi' },
  { key: 'animal_welfare', label: 'Hayvan refahına aykırı' },
  { key: 'other', label: 'Diğer' },
];
