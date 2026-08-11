// Deterministic (non-AI) completeness checks over an incident and its
// related records. Per the Assignment 6 spec (Section 11): the app computes
// blank-field / open-item / overdue signals with plain code, and only hands
// AI the job of interpreting narrative completeness and thematic patterns --
// never the arithmetic itself.
export interface DeterministicSignals {
  missingFields: string[];
  openCorrectiveActions: number;
  openCorrectiveActionsWithoutOwner: number;
  openCorrectiveActionsWithoutDueDate: number;
  overdueCorrectiveActions: number;
  verificationIncomplete: boolean;
  handoffReceiptMissing: boolean;
  sdsNotConfirmed: boolean;
}

export function computeDeterministicSignals(
  incident: any,
  correctiveActions: any[],
  latestHandoff: any | null
): DeterministicSignals {
  const missingFields: string[] = [];
  if (!incident.scene_notes) missingFields.push('scene_notes');
  if (!incident.final_route) missingFields.push('final_route (no response route selected yet)');
  if (incident.product_known && !incident.product_name) missingFields.push('product_name');
  if (!incident.container_condition) missingFields.push('container_condition');

  const openActions = (correctiveActions || []).filter((a) => !['Complete', 'Cancelled'].includes(a.status));
  const now = Date.now();

  return {
    missingFields,
    openCorrectiveActions: openActions.length,
    openCorrectiveActionsWithoutOwner: openActions.filter((a) => !a.owner).length,
    openCorrectiveActionsWithoutDueDate: openActions.filter((a) => !a.due_date).length,
    overdueCorrectiveActions: openActions.filter((a) => a.due_date && new Date(a.due_date).getTime() < now).length,
    verificationIncomplete: incident.verification_status !== 'Verified',
    handoffReceiptMissing: !latestHandoff || latestHandoff.status !== 'Received',
    sdsNotConfirmed: !incident.selected_sds_id,
  };
}

// Deterministic (non-AI) days-open / overdue status for a single corrective
// action -- used by the Corrective Actions view. Per spec Section 4: "Use
// deterministic application logic... Do not ask AI to calculate these values."
export function correctiveActionAging(action: { created_at: string; due_date: string | null; status: string }) {
  const isOpen = !['Complete', 'Cancelled'].includes(action.status);
  const daysOpen = Math.floor((Date.now() - new Date(action.created_at).getTime()) / 86400000);
  const overdue = isOpen && !!action.due_date && new Date(action.due_date).getTime() < Date.now();
  const dueSoon =
    isOpen && !!action.due_date && !overdue && new Date(action.due_date).getTime() - Date.now() < 3 * 86400000;
  return { daysOpen, overdue, dueSoon };
}
