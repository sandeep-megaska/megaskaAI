/**
 * Bring the results region into view after a generation completes.
 *
 * Below the `xl` breakpoint the controls and the results are stacked, so a
 * finished generation would otherwise land off-screen below a long form. Above
 * it the two columns sit side by side and the results are already visible, so
 * scrolling would only be disorienting.
 */
export function revealResults(elementId: string) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(min-width: 1280px)").matches) return;

  window.requestAnimationFrame(() => {
    document.getElementById(elementId)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  });
}
