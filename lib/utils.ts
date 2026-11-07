import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function pct(n: number) { return `${Math.round(n * 100)}%`; }
export function fmtGBP(n: number) { return n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${Math.round(n)}`; }
