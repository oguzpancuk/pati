import { apiClient } from './client';
import type { ReportReason, ReportTargetType } from '../reportReasons';

export type { ReportReason, ReportTargetType };

// One open report per user per target; the server answers a repeat with 409
// and a friendly message, which the sheet shows as-is.
export async function createReport(
  targetType: ReportTargetType,
  targetId: number,
  reason: ReportReason,
  details?: string
): Promise<{ id: number }> {
  const { data } = await apiClient.post<{ id: number }>('/reports', {
    targetType,
    targetId,
    reason,
    details,
  });
  return data;
}
