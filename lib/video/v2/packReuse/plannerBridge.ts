import { buildAnchorExpansionContext } from "@/lib/video/v2/anchorExpansion/plannerBridge";
import type { PackReuseContext } from "@/lib/video/v2/packReuse/types";

export async function buildPackReuseContext(clipIntentId: string): Promise<PackReuseContext> {
  return buildAnchorExpansionContext(clipIntentId);
}
