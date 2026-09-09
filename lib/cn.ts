import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class lists so a caller-supplied class always wins over a
 * component's default for the same utility group.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
