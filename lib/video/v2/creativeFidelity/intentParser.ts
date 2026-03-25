import type { ParsedIntentSignals } from "./types";

type SignalRule = { signal: string; pattern: RegExp };

const MOTION_RULES: SignalRule[] = [
  { signal: "subtle_breathing", pattern: /\b(breathe|breathing|still|sway|idle)\b/ },
  { signal: "walk", pattern: /\b(walk|walking|stride|step)\b/ },
  { signal: "turn", pattern: /\b(turn|turning|pivot|rotate)\b/ },
  { signal: "twirl_spin", pattern: /\b(twirl|spin|spinning)\b/ },
  { signal: "jump_fall", pattern: /\b(jump|leap|fall|drop|dive|plunge)\b/ },
  { signal: "run", pattern: /\b(run|running|sprint)\b/ },
  { signal: "sit_stand_transition", pattern: /\b(sit|stand|rise|seated-to-standing)\b/ },
  { signal: "choreography", pattern: /\b(choreography|dance|acrobatic)\b/ },
];

const CAMERA_RULES: SignalRule[] = [
  { signal: "static", pattern: /\b(static|locked|fixed framing|still camera)\b/ },
  { signal: "slow_push_pan", pattern: /\b(push-?in|pan|dolly|zoom)\b/ },
  { signal: "orbit_parallax", pattern: /\b(orbit|parallax|changing perspective|tracking)\b/ },
  { signal: "aggressive_cinematic", pattern: /\b(drone|rotating reveal|aggressive camera|multi-angle|cinematic ad shot|cinematic reveal)\b/ },
];

const SCENE_RULES: SignalRule[] = [
  { signal: "studio", pattern: /\b(studio|same room|same background)\b/ },
  { signal: "runway", pattern: /\b(runway|catwalk)\b/ },
  { signal: "beach", pattern: /\b(beach|shore)\b/ },
  { signal: "river", pattern: /\b(river|stream|waterfall)\b/ },
  { signal: "underwater", pattern: /\b(underwater|under water|submerged)\b/ },
  { signal: "alien_world", pattern: /\b(alien world|another planet|extraterrestrial)\b/ },
  { signal: "fantasy_surreal", pattern: /\b(fantasy|surreal|dreamlike|otherworldly)\b/ },
  { signal: "scene_transition", pattern: /\b(transition|location jump|from .* to .*|recontextualization)\b/ },
];

const GARMENT_RULES: SignalRule[] = [
  { signal: "back_design", pattern: /\b(back design|back reveal|open back)\b/ },
  { signal: "straps", pattern: /\b(strap|straps|halter)\b/ },
  { signal: "flowing_layer", pattern: /\b(flowing|layered|drape|cape|shrug|hijab)\b/ },
  { signal: "texture", pattern: /\b(texture|fabric detail|stitch|hem|close-up fabric)\b/ },
  { signal: "swimwear", pattern: /\b(swimwear|swimsuit|bikini|burkini)\b/ },
];

const ENVIRONMENT_RULES: SignalRule[] = [
  { signal: "water", pattern: /\b(water|river|underwater|pool|ocean)\b/ },
  { signal: "splash", pattern: /\b(splash|spray|water impact)\b/ },
  { signal: "wind", pattern: /\b(wind|breeze|gust)\b/ },
  { signal: "rain", pattern: /\b(rain|storm|drizzle)\b/ },
  { signal: "lighting_shift", pattern: /\b(neon|dramatic lighting|strong lighting|sunlight shift)\b/ },
  { signal: "smoke_sand_contact", pattern: /\b(smoke|fog|sand|dust|physical contact)\b/ },
];

const VIEW_RULES: SignalRule[] = [
  { signal: "back", pattern: /\b(back|rear|behind)\b/ },
  { signal: "side_profile", pattern: /\b(side|profile|left side|right side)\b/ },
  { signal: "rotation", pattern: /\b(turn|rotate|spin|twirl|reveal)\b/ },
  { signal: "closeup_detail", pattern: /\b(close-up|closeup|detail|texture)\b/ },
];

function collectSignals(normalizedPrompt: string, rules: SignalRule[]) {
  return rules.filter((rule) => rule.pattern.test(normalizedPrompt)).map((rule) => rule.signal);
}

export function parseCreativeIntent(prompt: string): ParsedIntentSignals {
  const normalizedPrompt = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  return {
    normalizedPrompt,
    motionSignals: collectSignals(normalizedPrompt, MOTION_RULES),
    cameraSignals: collectSignals(normalizedPrompt, CAMERA_RULES),
    sceneSignals: collectSignals(normalizedPrompt, SCENE_RULES),
    garmentSignals: collectSignals(normalizedPrompt, GARMENT_RULES),
    environmentSignals: collectSignals(normalizedPrompt, ENVIRONMENT_RULES),
    viewSignals: collectSignals(normalizedPrompt, VIEW_RULES),
  };
}
