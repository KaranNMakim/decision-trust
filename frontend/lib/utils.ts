import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Zone = "green" | "yellow" | "red";

export const zoneColor: Record<Zone, string> = {
  green: "#15803d",
  yellow: "#b45309",
  red: "#b91c1c",
};

export const zoneLabel: Record<Zone, string> = {
  green: "Trusted",
  yellow: "Use with caution",
  red: "Untrusted",
};

export function zoneOf(score: number | null | undefined): Zone | null {
  if (score == null) return null;
  return score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
}
