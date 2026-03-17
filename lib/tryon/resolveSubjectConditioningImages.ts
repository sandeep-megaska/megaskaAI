import type { TryOnAdapterPayload } from "@/lib/tryon/runTryOnJob";

type SubjectConditioningImage = {
  url: string;
  role: "subject_primary" | "subject_secondary";
  assetId?: string;
};

export function resolveSubjectConditioningImages(input: {
  subject?: TryOnAdapterPayload["subject"];
  selectedReferences?: TryOnAdapterPayload["selectedReferences"];
}) {
  const sourceMode = String(input.subject?.sourceMode ?? "manual_upload");
  const manualUploadUrl = typeof input.subject?.personAssetUrl === "string" ? input.subject.personAssetUrl : null;
  const modelLibraryUrls = Array.isArray(input.selectedReferences?.subjectModelAssetUrls)
    ? input.selectedReferences?.subjectModelAssetUrls.filter((value): value is string => Boolean(value))
    : [];

  const subjectImages: SubjectConditioningImage[] = [];

  if (sourceMode === "manual_upload" && manualUploadUrl) {
    subjectImages.push({ url: manualUploadUrl, role: "subject_primary" });
  }

  if (sourceMode === "model_library") {
    for (const [index, url] of modelLibraryUrls.slice(0, 2).entries()) {
      subjectImages.push({
        url,
        role: index === 0 ? "subject_primary" : "subject_secondary",
      });
    }
  }

  return {
    subjectImages,
    debug: {
      sourceMode,
      manualUploadUrlPresent: Boolean(manualUploadUrl),
      modelLibraryImageCandidates: modelLibraryUrls.length,
      resolvedCount: subjectImages.length,
    },
  };
}
