type Person = { seed?: string; cc: string; page?: string; place: { name: string; lat: number; lng: number } };
/** A pin on the globe: everyone at one place. */
type Place = { name: string; cc: string; lat: number; lng: number; count: number; people: Person[] };

export function preloadDotGlobe(): Promise<unknown>;
export function createDotGlobe(container: HTMLElement, options: {
  people?: Person[];
  face?: (country: string) => string;
  autoSpin?: boolean;
  quietIntro?: boolean;
  openOnFocus?: boolean;
  maxZoom?: number;
  radiusScale?: number;
  startZoom?: number;
  lookAt?: { lat: number; lng: number } | null;
  offsetX?: number;
  showFlags?: boolean;
  shiftY?: number;
  onInteract?: () => void;
  /** Clicking a pin: the globe flies in for `duration` ms; call `restore` to fly back out. */
  onExplore?: (place: Place, duration: number, restore: () => void, places: Place[]) => void;
}): {
  destroy(): void;
  setPeople(people: Person[]): void;
  ping(match: (person: Person) => boolean): void;
  focus(match: (person: Person) => boolean): void;
};
