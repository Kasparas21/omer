type Person = { seed?: string; cc: string; place: { name: string; lat: number; lng: number } };

export function preloadDotGlobe(): Promise<unknown>;
export function createDotGlobe(container: HTMLElement, options: {
  people?: Person[];
  face?: (country: string) => string;
  autoSpin?: boolean;
  quietIntro?: boolean;
  openOnFocus?: boolean;
  maxZoom?: number;
  radiusScale?: number;
}): {
  destroy(): void;
  setPeople(people: Person[]): void;
  ping(match: (person: Person) => boolean): void;
  focus(match: (person: Person) => boolean): void;
};
