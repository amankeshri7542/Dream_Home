import type {
  ComponentRef,
  EditIssue,
  IssueFix,
  IssueSeverity,
  Rect,
} from "./types";

export type IssueExtra = {
  severity?: IssueSeverity;
  source?: ComponentRef;
  blockers?: ComponentRef[];
  floorIds?: string[];
  attempted?: Rect;
  fixes?: IssueFix[];
};
export function makeIssue(
  code: string,
  message: string,
  extra: IssueExtra = {},
): EditIssue {
  return {
    code,
    severity: extra.severity ?? "error",
    message,
    ...(extra.source ? { source: extra.source } : {}),
    blockers: extra.blockers ?? [],
    floorIds: extra.floorIds ?? [],
    ...(extra.attempted ? { attempted: extra.attempted } : {}),
    fixes: extra.fixes ?? [],
  };
}
export type IssueSink = (code: string, message: string, extra?: IssueExtra) => void;
export const sameRef = (a?: ComponentRef, b?: ComponentRef) =>
  !!a && !!b && a.kind === b.kind && a.id === b.id;
/** Re-orients an issue so the edited component is the source, not a blocker. */
export function focusIssues(issues: EditIssue[], subjectId?: string): EditIssue[] {
  if (!subjectId) return issues;
  const focused = issues.map((issue) => {
    if (!issue.source || issue.source.id === subjectId) return issue;
    const index = issue.blockers.findIndex((b) => b.id === subjectId);
    if (index < 0) return issue;
    const blockers = [...issue.blockers];
    const [subject] = blockers.splice(index, 1, issue.source);
    return { ...issue, source: subject, blockers };
  });
  return [
    ...focused.filter((i) => i.source?.id === subjectId),
    ...focused.filter((i) => i.source?.id !== subjectId),
  ];
}
