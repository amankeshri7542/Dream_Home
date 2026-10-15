// The one gate every edit command passes through: reconcile decorative layers
// (openings, furniture, landscape) against structural changes, then validate.
import { focusIssues } from "./issues";
import { validateProjectIssues } from "./validate";
import type { EditIssue, EditResult, Project } from "./types";

export type Reconciler = (
  before: Project,
  after: Project,
  notices: EditIssue[],
) => Project;
const reconcilers: Reconciler[] = [];
/** Feature modules register structural-change reconcilers (run in order). */
export function registerReconciler(reconcile: Reconciler) {
  if (!reconcilers.includes(reconcile)) reconcilers.push(reconcile);
}

export function finalizeEdit(
  before: Project,
  after: Project,
  opts: { focusId?: string; subject?: string; notices?: EditIssue[] } = {},
): EditResult {
  // Commands may pass notices about their own adjustments (e.g. furniture
  // refitted after a use swap); reconcilers append theirs.
  const notices: EditIssue[] = [...(opts.notices ?? [])];
  let next = after;
  for (const reconcile of reconcilers) next = reconcile(before, next, notices);
  const errors = validateProjectIssues(next, { baseline: before }).filter(
    (i) => i.severity === "error",
  );
  if (errors.length) {
    // Lead with the problem of the thing being edited, not whichever came first.
    const issues = focusIssues(errors, opts.subject);
    return { ok: false, error: issues[0].message, issues };
  }
  return {
    ok: true,
    project: next,
    ...(opts.focusId ? { focusId: opts.focusId } : {}),
    ...(notices.length ? { notices } : {}),
  };
}

/** Validation-only result for a project with no `before` (generators, imports). */
export const checkedProject = (project: Project): EditResult =>
  finalizeEdit(project, project);
