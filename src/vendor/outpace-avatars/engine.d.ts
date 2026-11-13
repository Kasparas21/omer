export function toSeed(seed: string | number): number;
export function gradientToDataURL(seed: string, options?: {
  size?: number;
  displaySize?: number;
  colors?: string[];
  p3?: boolean;
  type?: string;
  quality?: number;
}): string;
