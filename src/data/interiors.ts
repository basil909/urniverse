/* What each planet is made of, from the centre out, for the cutaway view.
   `to` is the outer edge of the layer as a fraction of the planet's radius
   (approximate, from NASA planetary fact sheets and interior models). */

export type Layer = { to: number; color: string; name: string; hot?: boolean }

export const INTERIORS: Record<number, Layer[]> = {
  // Mercury: an iron core filling most of the planet
  0: [
    { to: 0.83, color: '#e0a052', name: 'Iron core', hot: true },
    { to: 0.97, color: '#8a6a52', name: 'Rocky mantle' },
    { to: 1, color: '#9a948c', name: 'Crust' },
  ],
  // Venus
  1: [
    { to: 0.5, color: '#f0b45a', name: 'Iron core', hot: true },
    { to: 0.97, color: '#b5643c', name: 'Rocky mantle' },
    { to: 1, color: '#c9b48c', name: 'Crust' },
  ],
  // Earth
  2: [
    { to: 0.19, color: '#ffe08a', name: 'Solid inner core', hot: true },
    { to: 0.55, color: '#ff9a3c', name: 'Liquid outer core', hot: true },
    { to: 0.985, color: '#c0532e', name: 'Mantle' },
    { to: 1, color: '#7f8f6a', name: 'Crust' },
  ],
  // Mars
  3: [
    { to: 0.54, color: '#f0a050', name: 'Liquid iron core', hot: true },
    { to: 0.98, color: '#a5482c', name: 'Mantle' },
    { to: 1, color: '#c1704a', name: 'Crust' },
  ],
  // Jupiter
  4: [
    { to: 0.15, color: '#f2c27a', name: 'Dense, fuzzy core', hot: true },
    { to: 0.8, color: '#8fa3c4', name: 'Metallic hydrogen' },
    { to: 1, color: '#dcc7a2', name: 'Hydrogen and helium' },
  ],
  // Saturn
  5: [
    { to: 0.2, color: '#f2c27a', name: 'Rocky core', hot: true },
    { to: 0.5, color: '#8fa3c4', name: 'Metallic hydrogen' },
    { to: 1, color: '#e3d2a8', name: 'Hydrogen and helium' },
  ],
  // Uranus
  6: [
    { to: 0.2, color: '#c99a6a', name: 'Rocky core', hot: true },
    { to: 0.75, color: '#4f9fc0', name: 'Icy mantle: water, ammonia, methane' },
    { to: 1, color: '#a7dfe3', name: 'Hydrogen, helium, methane' },
  ],
  // Neptune
  7: [
    { to: 0.25, color: '#c99a6a', name: 'Rocky core', hot: true },
    { to: 0.78, color: '#3f78c8', name: 'Icy mantle: water, ammonia, methane' },
    { to: 1, color: '#6f9be6', name: 'Hydrogen, helium, methane' },
  ],
}

/* chapter id -> planet index (orbit order) */
export const PLANET_INDEX: Record<string, number> = {
  mercury: 0,
  venus: 1,
  earth: 2,
  mars: 3,
  jupiter: 4,
  saturn: 5,
  uranus: 6,
  neptune: 7,
}
