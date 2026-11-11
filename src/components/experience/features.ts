/* ============================================================
   NAMED FEATURES
   Flying low, quiet labels for real features as they come into view.
   Positions are planetocentric latitude and east longitude (degrees),
   from the IAU Gazetteer of Planetary Nomenclature and, for Earth,
   standard geographic coordinates. Body ids as in orbit.ts.
============================================================ */
export type Feature = { body: number; name: string; lat: number; lon: number }

export const FEATURES: readonly Feature[] = [
  // Earth
  { body: 2, name: 'Mount Everest', lat: 27.988, lon: 86.925 },
  { body: 2, name: 'Grand Canyon', lat: 36.1, lon: -112.1 },
  { body: 2, name: 'Matterhorn', lat: 45.976, lon: 7.658 },
  { body: 2, name: 'Kilimanjaro', lat: -3.068, lon: 37.356 },
  { body: 2, name: 'Uluru', lat: -25.345, lon: 131.036 },
  { body: 2, name: 'Lake Baikal', lat: 53.5, lon: 108.0 },
  { body: 2, name: 'Nile Delta', lat: 30.9, lon: 31.2 },
  { body: 2, name: 'Amazon River', lat: -3.1, lon: -60.0 },
  { body: 2, name: 'Great Barrier Reef', lat: -18.3, lon: 147.7 },
  { body: 2, name: 'Aconcagua', lat: -32.653, lon: -70.011 },
  { body: 2, name: 'Mount Fuji', lat: 35.361, lon: 138.727 },
  { body: 2, name: 'Iceland', lat: 64.9, lon: -18.6 },
  { body: 2, name: 'Sahara', lat: 23.4, lon: 12.0 },
  { body: 2, name: 'Okavango Delta', lat: -19.3, lon: 22.9 },
  // Mars
  { body: 3, name: 'Olympus Mons', lat: 18.65, lon: -133.8 },
  { body: 3, name: 'Valles Marineris', lat: -13.9, lon: -59.2 },
  { body: 3, name: 'Arsia Mons', lat: -8.26, lon: -120.09 },
  { body: 3, name: 'Pavonis Mons', lat: 1.48, lon: -112.96 },
  { body: 3, name: 'Ascraeus Mons', lat: 11.92, lon: -104.08 },
  { body: 3, name: 'Gale Crater (Curiosity)', lat: -5.4, lon: 137.8 },
  { body: 3, name: 'Jezero Crater (Perseverance)', lat: 18.38, lon: 77.58 },
  { body: 3, name: 'Hellas Planitia', lat: -42.4, lon: 70.5 },
  { body: 3, name: 'Elysium Mons', lat: 25.02, lon: 147.21 },
  { body: 3, name: 'Utopia Planitia', lat: 46.7, lon: 117.5 },
  // the Moon
  { body: 12, name: 'Tycho', lat: -43.31, lon: -11.36 },
  { body: 12, name: 'Copernicus', lat: 9.62, lon: -20.08 },
  { body: 12, name: 'Tranquility Base (Apollo 11)', lat: 0.674, lon: 23.473 },
  { body: 12, name: 'Apollo 17', lat: 20.19, lon: 30.77 },
  { body: 12, name: 'Mare Imbrium', lat: 32.8, lon: -15.6 },
  { body: 12, name: 'Mare Serenitatis', lat: 28.0, lon: 17.5 },
  { body: 12, name: 'Oceanus Procellarum', lat: 18.4, lon: -57.4 },
  { body: 12, name: 'Aristarchus', lat: 23.7, lon: -47.4 },
  { body: 12, name: 'Shackleton', lat: -89.9, lon: 0 },
  // Mercury
  { body: 0, name: 'Caloris Basin', lat: 30.5, lon: -170.2 },
  { body: 0, name: 'Rachmaninoff', lat: -27.6, lon: 57.6 },
]
