/**
 * A small badge shown on any surface that displays seeded demo data.
 * Driven by the `isDemoData` flag on the Firestore document — never a
 * hardcoded string, so real data is never tagged.
 */
export function DemoBadge({ isDemoData }: { isDemoData?: boolean }) {
  if (!isDemoData) return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground"
      title="This number comes from seeded demo data, not real assessments."
    >
      Demo data
    </span>
  );
}
