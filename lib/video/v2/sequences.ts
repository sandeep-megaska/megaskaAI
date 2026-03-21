import type { ExportPreparationView, SequenceContinuitySignal, SequenceTimelineClip, SequenceTimelineView, VideoSequence } from "@/lib/video/v2/types";

function compareTextSignal(
  signal: SequenceContinuitySignal["signal"],
  label: string,
  previousValue: string | null,
  nextValue: string | null,
): SequenceContinuitySignal {
  if (!previousValue || !nextValue) {
    return {
      signal,
      status: "warning",
      label,
      details: `${label} missing metadata on one or both clips.`,
    };
  }

  if (previousValue === nextValue) {
    return {
      signal,
      status: "good",
      label,
      details: `${label} is consistent across clips.`,
    };
  }

  return {
    signal,
    status: signal === "aspect_ratio" ? "major_mismatch" : "warning",
    label,
    details: `${label} changed between clips.`,
  };
}

export function buildSequenceTimelineView(sequence: VideoSequence, clips: SequenceTimelineClip[]): SequenceTimelineView {
  const sortedClips = [...clips].sort((a, b) => a.order_index - b.order_index);
  const continuity = sortedClips.slice(1).map((clip, index) => {
    const previous = sortedClips[index];

    const signals: SequenceContinuitySignal[] = [
      compareTextSignal("model", "Model", previous.provider_model, clip.provider_model),
      compareTextSignal("garment", "Garment pack", previous.selected_pack_id, clip.selected_pack_id),
      compareTextSignal("scene", "Scene mode", previous.mode_selected, clip.mode_selected),
      compareTextSignal("aspect_ratio", "Aspect ratio", previous.aspect_ratio, clip.aspect_ratio),
    ];

    const lineageGood = clip.lineage.extension_from_run_id === previous.run_id || clip.lineage.branched_from_run_id === previous.run_id;
    signals.push({
      signal: "lineage",
      status: lineageGood ? "good" : "warning",
      label: "Lineage continuity",
      details: lineageGood ? "Clip lineage connects to previous clip." : "Clip is not directly extended/branched from previous clip.",
    });

    const hasMajor = signals.some((entry) => entry.status === "major_mismatch");
    const hasWarning = signals.some((entry) => entry.status === "warning");

    const overall: "good" | "warning" | "major_mismatch" = hasMajor ? "major_mismatch" : hasWarning ? "warning" : "good";

    return {
      from_run_id: previous.run_id,
      to_run_id: clip.run_id,
      signals,
      overall,
    };
  });

  return {
    sequence,
    clips: sortedClips,
    continuity,
  };
}

export function buildExportPreparationView(timeline: SequenceTimelineView): ExportPreparationView {
  const clips = timeline.clips
    .filter((clip) => clip.order_index >= 0)
    .sort((a, b) => a.order_index - b.order_index)
    .map((clip) => ({
      run_id: clip.run_id,
      output_url: clip.output_url,
      duration: clip.duration_seconds,
      order_index: clip.order_index,
    }));

  const issues: string[] = [];

  const missingOutput = timeline.clips.filter((clip) => !clip.output_url);
  if (missingOutput.length) issues.push(`${missingOutput.length} clip(s) are missing output video URLs.`);

  const inactiveOrUnaccepted = timeline.clips.filter((clip) => !clip.accepted_for_sequence);
  if (inactiveOrUnaccepted.length) issues.push(`${inactiveOrUnaccepted.length} clip(s) are not accepted for sequence use.`);

  const expected = Array.from({ length: timeline.clips.length }, (_, i) => i);
  const actual = timeline.clips.map((clip) => clip.order_index).sort((a, b) => a - b);
  if (expected.some((value, index) => actual[index] !== value)) {
    issues.push("Order indexes are not contiguous (missing gapless ordering).");
  }

  const majorContinuity = timeline.continuity.filter((entry) => entry.overall === "major_mismatch");
  if (majorContinuity.length) {
    issues.push(`${majorContinuity.length} clip transition(s) have major continuity mismatches.`);
  }

  const totalDuration = clips.reduce((sum, clip) => sum + (clip.duration ?? 0), 0);

  return {
    sequence_id: timeline.sequence.id,
    clips,
    total_duration: totalDuration,
    ready_for_export: issues.length === 0 && clips.length > 0,
    issues,
  };
}
