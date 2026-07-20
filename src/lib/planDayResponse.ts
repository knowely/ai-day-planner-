export function sanitizePlanDayResponse(
  raw: unknown,
  validIds: Set<string>
): string[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { taskIds?: unknown }).taskIds)
  ) {
    return [];
  }

  const rawIds = (raw as { taskIds: unknown[] }).taskIds;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of rawIds) {
    if (typeof id !== "string") continue;
    if (!validIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}
