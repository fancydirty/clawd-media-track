import type { AcquisitionPlan, ResourceCandidate, ResourceSnapshot } from "./domain.js";

export interface ValidatedMoviePlan {
  selectedSnapshot: ResourceSnapshot | null;
  /** The single chosen film, or null on an honest no-coverage outcome. */
  selectedCandidate: ResourceCandidate | null;
}

/**
 * Output contract for the movie planning agent. Like the series validator it
 * forbids referencing unobserved candidates and silent omission, but a movie
 * is a single file: it selects AT MOST ONE candidate and never checks episode
 * coverage (there are no episodes — the anchor's synthetic S01E01 is implicit).
 */
export function validateMoviePlan(input: {
  plan: AcquisitionPlan;
  snapshots: ResourceSnapshot[];
}): ValidatedMoviePlan {
  const { plan } = input;
  const observed = new Map<string, ResourceCandidate>();
  for (const snapshot of input.snapshots) {
    for (const candidate of snapshot.candidates) {
      observed.set(candidate.id, candidate);
    }
  }

  const seen = new Set<string>();
  for (const disposition of plan.candidateDispositions) {
    if (seen.has(disposition.candidateId)) {
      throw new Error(`Movie plan gave more than one disposition for ${disposition.candidateId}`);
    }
    seen.add(disposition.candidateId);
    if (!observed.has(disposition.candidateId)) {
      throw new Error(`Movie plan referenced candidate ${disposition.candidateId} that was not observed in this run`);
    }
  }

  if (plan.selectedSnapshotId === null) {
    if (plan.candidateDispositions.some((disposition) => disposition.disposition === "selected")) {
      throw new Error("A no-coverage movie plan must not contain selected dispositions");
    }
    return { selectedSnapshot: null, selectedCandidate: null };
  }

  const selectedSnapshot = input.snapshots.find((snapshot) => snapshot.id === plan.selectedSnapshotId);
  if (selectedSnapshot === undefined) {
    throw new Error(`Movie plan selected snapshot ${plan.selectedSnapshotId} that was not observed in this run`);
  }

  const snapshotCandidateIds = new Set(selectedSnapshot.candidates.map((candidate) => candidate.id));

  // At most one SELECTED candidate, and it must live in the selected snapshot
  // (no cross-snapshot selection). Rejected/uncertain dispositions for
  // candidates seen in earlier searches are harmless and ignored — a live agent
  // legitimately explains why it passed over results from other keywords.
  const selectedDispositions = plan.candidateDispositions.filter(
    (disposition) => disposition.disposition === "selected",
  );
  if (selectedDispositions.length > 1) {
    throw new Error("A movie plan must select at most one candidate (a movie is a single file)");
  }
  const selectedDisposition = selectedDispositions[0];
  if (selectedDisposition !== undefined && !snapshotCandidateIds.has(selectedDisposition.candidateId)) {
    throw new Error(
      `Movie plan selected ${selectedDisposition.candidateId} outside the selected snapshot ${selectedSnapshot.id}`,
    );
  }

  const missingDispositions = selectedSnapshot.candidates.filter((candidate) => !seen.has(candidate.id));
  if (missingDispositions.length > 0) {
    throw new Error(
      `Movie plan must give a disposition for every candidate in the selected snapshot; missing: ${missingDispositions
        .map((candidate) => candidate.id)
        .join(", ")}`,
    );
  }

  const selectedCandidate =
    selectedDisposition !== undefined
      ? selectedSnapshot.candidates.find((candidate) => candidate.id === selectedDisposition.candidateId) ?? null
      : null;
  return { selectedSnapshot, selectedCandidate };
}
