/* ============================================================
   DEEP-DIVE CONTENT
   Figures from the NASA Planetary Fact Sheet / Sun Fact Sheet; mission
   history from NASA and ESA mission pages. Counts that change over
   time (moons) are dated. Keyed by chapter id.
============================================================ */

export type WorldDetail = {
  glance: { label: string; value: string }[]
  sections: { heading: string; body: string }[]
  missions: { year: string; name: string; note: string }[]
}

export const DETAIL_SOURCE =
  'Figures: NASA Planetary and Sun fact sheets. Missions: NASA and ESA.'

export const WORLD_DETAILS: Record<string, WorldDetail> = {
  sun: {
    glance: [
      { label: 'Type', value: 'Yellow dwarf star (G2V)' },
      { label: 'Age', value: 'About 4.6 billion years' },
      { label: 'Diameter', value: '1.39 million km (109 Earths)' },
      { label: 'Mass', value: '333,000 Earths' },
      { label: 'Surface', value: 'About 5,500 °C' },
      { label: 'Core', value: 'About 15 million °C' },
      { label: 'Rotation', value: '~25 days at the equator, ~35 at the poles' },
      { label: 'Made of', value: '73% hydrogen, 25% helium (by mass)' },
    ],
    sections: [
      {
        heading: 'Inside',
        body: 'In the core, hydrogen nuclei fuse into helium, releasing the energy that powers the Sun. That energy takes many thousands of years to work its way out through the radiative zone, then rises through the convection zone in churning cells: the granulation you can see on the surface.',
      },
      {
        heading: 'Surface and corona',
        body: 'The visible surface, the photosphere, is about 5,500 °C. The faint corona above it is, puzzlingly, far hotter: over a million degrees. It streams outward as the solar wind, which fills the whole Solar System.',
      },
      {
        heading: 'Activity',
        body: 'The Sun’s magnetic activity rises and falls in a cycle of about 11 years, bringing sunspots, flares and coronal mass ejections that can light up auroras on Earth.',
      },
    ],
    missions: [
      { year: '1995', name: 'SOHO', note: 'Watching the Sun nonstop from a point between it and Earth.' },
      { year: '2010', name: 'Solar Dynamics Observatory', note: 'Imaging the Sun in many wavelengths every few seconds.' },
      { year: '2018', name: 'Parker Solar Probe', note: 'Flies through the corona: the closest any spacecraft has come to the Sun.' },
      { year: '2020', name: 'Solar Orbiter', note: 'Took the first images of the Sun’s poles.' },
    ],
  },

  mercury: {
    glance: [
      { label: 'Diameter', value: '4,879 km (0.38 Earths)' },
      { label: 'Mass', value: '0.055 Earths' },
      { label: 'Gravity', value: '3.7 m/s² (0.38 g)' },
      { label: 'Day', value: '176 Earth days, sunrise to sunrise' },
      { label: 'Year', value: '88 Earth days' },
      { label: 'Temperature', value: '−180 °C to 430 °C' },
      { label: 'Moons', value: 'None' },
      { label: 'Axial tilt', value: '0.03°' },
    ],
    sections: [
      {
        heading: 'Inside',
        body: 'Mercury has an enormous iron core, about 85% of its radius, wrapped in a thin rocky mantle and crust. Part of the core is still molten, giving Mercury a weak magnetic field.',
      },
      {
        heading: 'Surface',
        body: 'With almost no atmosphere to soften impacts or hold heat, the surface is covered in craters and long cliffs called scarps, which formed as the planet cooled and shrank. The Caloris Basin, about 1,550 km across, is one of the largest impact craters in the Solar System.',
      },
      {
        heading: 'Ice in the shadows',
        body: 'Despite the heat, water ice survives in permanently shadowed craters near the poles, where sunlight never reaches.',
      },
    ],
    missions: [
      { year: '1974', name: 'Mariner 10', note: 'First flybys; mapped about 45% of the surface.' },
      { year: '2011', name: 'MESSENGER', note: 'First orbiter (2011–2015); mapped the whole planet.' },
      { year: '2018', name: 'BepiColombo', note: 'European–Japanese mission, due to enter orbit in late 2026.' },
    ],
  },

  venus: {
    glance: [
      { label: 'Diameter', value: '12,104 km (0.95 Earths)' },
      { label: 'Mass', value: '0.82 Earths' },
      { label: 'Gravity', value: '8.9 m/s² (0.9 g)' },
      { label: 'Day', value: '117 Earth days, sunrise to sunrise' },
      { label: 'Spin', value: 'Once every 243 days, backwards' },
      { label: 'Year', value: '225 Earth days' },
      { label: 'Surface', value: '464 °C, 92 times Earth’s pressure' },
      { label: 'Moons', value: 'None' },
    ],
    sections: [
      {
        heading: 'Atmosphere',
        body: 'An atmosphere of about 96% carbon dioxide traps heat in a runaway greenhouse effect, making Venus hotter than Mercury despite being nearly twice as far from the Sun. Clouds of sulfuric acid hide the surface completely.',
      },
      {
        heading: 'Surface',
        body: 'Radar shows a young, volcanic world of vast lava plains, more than a thousand volcanoes and few craters. In 2023, scientists found a volcanic vent that had changed shape between images: evidence Venus may still be active.',
      },
      {
        heading: 'Backwards and slow',
        body: 'Venus spins backwards, so the Sun rises in the west, and so slowly that one full turn takes longer than its year.',
      },
    ],
    missions: [
      { year: '1962', name: 'Mariner 2', note: 'First successful flyby of another planet.' },
      { year: '1970', name: 'Venera 7', note: 'First spacecraft to send data from another planet’s surface.' },
      { year: '1982', name: 'Venera 13', note: 'First colour photos from the surface; survived 127 minutes.' },
      { year: '1990', name: 'Magellan', note: 'Mapped 98% of the surface by radar.' },
      { year: '2006', name: 'Venus Express', note: 'Studied the atmosphere until 2014.' },
    ],
  },

  earth: {
    glance: [
      { label: 'Diameter', value: '12,742 km' },
      { label: 'Mass', value: '5.97 × 10²⁴ kg' },
      { label: 'Gravity', value: '9.8 m/s² (1 g)' },
      { label: 'Day', value: '24 hours' },
      { label: 'Year', value: '365.25 days' },
      { label: 'Average temperature', value: '15 °C' },
      { label: 'Moons', value: '1' },
      { label: 'Axial tilt', value: '23.4°' },
    ],
    sections: [
      {
        heading: 'Inside',
        body: 'A solid inner core and a liquid outer core of iron and nickel generate a magnetic field that shields the surface from the solar wind. Above them, the slowly churning mantle drives plate tectonics, recycling the crust over hundreds of millions of years.',
      },
      {
        heading: 'Water and air',
        body: 'Liquid water covers about 71% of the surface. The atmosphere, 78% nitrogen and 21% oxygen, was made breathable by life itself, through photosynthesis.',
      },
      {
        heading: 'The Moon',
        body: 'The Moon, about a quarter of Earth’s width, steadies Earth’s tilt and raises the tides. It is slowly drifting away, by about 3.8 cm a year.',
      },
    ],
    missions: [
      { year: '1968', name: 'Apollo 8', note: 'Earthrise: the first photo of Earth rising over the Moon.' },
      { year: '1972', name: 'Apollo 17', note: 'The Blue Marble: Earth fully lit, from 29,000 km.' },
      { year: '1990', name: 'Voyager 1', note: 'The Pale Blue Dot, from 6 billion km.' },
      { year: '2000', name: 'International Space Station', note: 'People have lived in orbit continuously ever since.' },
    ],
  },

  mars: {
    glance: [
      { label: 'Diameter', value: '6,779 km (0.53 Earths)' },
      { label: 'Mass', value: '0.11 Earths' },
      { label: 'Gravity', value: '3.7 m/s² (0.38 g)' },
      { label: 'Day', value: '24 h 40 min' },
      { label: 'Year', value: '687 Earth days' },
      { label: 'Average temperature', value: 'About −65 °C' },
      { label: 'Moons', value: '2 (Phobos, Deimos)' },
      { label: 'Axial tilt', value: '25.2°' },
    ],
    sections: [
      {
        heading: 'Surface',
        body: 'Mars is home to Olympus Mons, the tallest volcano in the Solar System, and Valles Marineris, a canyon system over 4,000 km long. Its red colour comes from iron oxide, rust, in the dust.',
      },
      {
        heading: 'Water, then and now',
        body: 'Dry river valleys, ancient deltas and minerals that only form in water show Mars was once much wetter. Today its water survives as ice, in the polar caps and below the surface.',
      },
      {
        heading: 'Thin air',
        body: 'Its carbon dioxide atmosphere is less than 1% as dense as Earth’s and holds little heat. Dust storms can grow to cover the whole planet for weeks.',
      },
    ],
    missions: [
      { year: '1965', name: 'Mariner 4', note: 'First close-up photos of another planet.' },
      { year: '1976', name: 'Viking 1 & 2', note: 'First successful landers; searched for signs of life.' },
      { year: '1997', name: 'Sojourner', note: 'First rover on Mars.' },
      { year: '2004', name: 'Spirit & Opportunity', note: 'Twin rovers; Opportunity kept going for 14 years.' },
      { year: '2012', name: 'Curiosity', note: 'Found that ancient Gale Crater could have supported microbes.' },
      { year: '2021', name: 'Perseverance & Ingenuity', note: 'Collecting samples; Ingenuity made the first powered flight on another planet.' },
    ],
  },

  jupiter: {
    glance: [
      { label: 'Diameter', value: '139,820 km (11 Earths)' },
      { label: 'Mass', value: '318 Earths' },
      { label: 'Gravity', value: '24.8 m/s² (2.5 g)' },
      { label: 'Day', value: '9 h 56 min' },
      { label: 'Year', value: '11.9 Earth years' },
      { label: 'Cloud tops', value: 'About −110 °C' },
      { label: 'Moons', value: '95 known' },
      { label: 'Axial tilt', value: '3.1°' },
    ],
    sections: [
      {
        heading: 'Inside',
        body: 'Jupiter is mostly hydrogen and helium. Deep inside, pressure squeezes hydrogen into a liquid metal that conducts electricity, generating the strongest magnetic field of any planet. Juno found its core is large and diffuse rather than compact.',
      },
      {
        heading: 'Storms',
        body: 'Its stripes are bands of cloud driven by powerful jet streams. The Great Red Spot is a storm wider than Earth, though it has been shrinking for more than a century.',
      },
      {
        heading: 'Moons',
        body: 'Its four largest moons, discovered by Galileo in 1610, are worlds of their own: volcanic Io; Europa, with an ocean beneath its ice; Ganymede, the largest moon in the Solar System; and heavily cratered Callisto.',
      },
    ],
    missions: [
      { year: '1973', name: 'Pioneer 10', note: 'First spacecraft to fly past Jupiter.' },
      { year: '1979', name: 'Voyager 1 & 2', note: 'Discovered Io’s volcanoes and Jupiter’s faint rings.' },
      { year: '1995', name: 'Galileo', note: 'First orbiter (1995–2003); dropped a probe into the atmosphere.' },
      { year: '2016', name: 'Juno', note: 'Orbiting over the poles, mapping the interior.' },
      { year: '2024', name: 'Europa Clipper', note: 'On its way to study Europa’s ocean; arrives in 2030.' },
    ],
  },

  saturn: {
    glance: [
      { label: 'Diameter', value: '116,460 km (9 Earths)' },
      { label: 'Mass', value: '95 Earths' },
      { label: 'Gravity', value: '10.4 m/s² (1.1 g)' },
      { label: 'Day', value: '10 h 34 min' },
      { label: 'Year', value: '29.4 Earth years' },
      { label: 'Cloud tops', value: 'About −140 °C' },
      { label: 'Moons', value: '274 known (2025)' },
      { label: 'Axial tilt', value: '26.7°' },
    ],
    sections: [
      {
        heading: 'Rings',
        body: 'The main rings span about 270,000 km yet are mostly only around 10 metres thick. They are made of countless pieces of water ice, from grains to boulders, and may be much younger than Saturn itself.',
      },
      {
        heading: 'Light and fast',
        body: 'Saturn is the least dense planet, less dense than water. Its fast spin flattens it: it is about 10% wider at the equator than from pole to pole.',
      },
      {
        heading: 'Moons',
        body: 'Titan, larger than Mercury, has a thick nitrogen atmosphere and lakes of liquid methane. Enceladus sprays jets of water into space from an ocean under its icy crust.',
      },
    ],
    missions: [
      { year: '1979', name: 'Pioneer 11', note: 'First flyby of Saturn.' },
      { year: '1980', name: 'Voyager 1 & 2', note: 'Revealed the intricate structure of the rings.' },
      { year: '2004', name: 'Cassini–Huygens', note: 'Orbited for 13 years; Huygens landed on Titan in 2005.' },
      { year: '2028', name: 'Dragonfly', note: 'A rotorcraft planned to launch in 2028 to fly across Titan.' },
    ],
  },

  uranus: {
    glance: [
      { label: 'Diameter', value: '50,724 km (4 Earths)' },
      { label: 'Mass', value: '14.5 Earths' },
      { label: 'Gravity', value: '8.9 m/s² (0.9 g)' },
      { label: 'Day', value: '17 h 14 min, backwards' },
      { label: 'Year', value: '84 Earth years' },
      { label: 'Cloud tops', value: 'About −195 °C' },
      { label: 'Moons', value: '29 known (2025)' },
      { label: 'Axial tilt', value: '97.8°' },
    ],
    sections: [
      {
        heading: 'On its side',
        body: 'Uranus is tipped over by about 98°, probably by an ancient giant impact. Each pole spends about 42 years in continuous sunlight, then 42 years in darkness.',
      },
      {
        heading: 'An ice giant',
        body: 'Beneath its hydrogen–helium atmosphere lies a thick mantle of water, ammonia and methane ices. Methane absorbs red light, giving Uranus its pale cyan colour.',
      },
      {
        heading: 'Rings and moons',
        body: 'It has 13 known faint, dark rings. Its moons are named after characters from Shakespeare and Alexander Pope, such as Miranda, Ariel and Titania.',
      },
    ],
    missions: [
      { year: '1781', name: 'William Herschel', note: 'Discovered Uranus: the first planet found with a telescope.' },
      { year: '1986', name: 'Voyager 2', note: 'The only spacecraft to visit; found 10 new moons and 2 new rings.' },
    ],
  },

  neptune: {
    glance: [
      { label: 'Diameter', value: '49,244 km (3.9 Earths)' },
      { label: 'Mass', value: '17.1 Earths' },
      { label: 'Gravity', value: '11.0 m/s² (1.1 g)' },
      { label: 'Day', value: '16 h 6 min' },
      { label: 'Year', value: '165 Earth years' },
      { label: 'Cloud tops', value: 'About −200 °C' },
      { label: 'Moons', value: '16 known' },
      { label: 'Axial tilt', value: '28.3°' },
    ],
    sections: [
      {
        heading: 'Found by mathematics',
        body: 'Neptune was the first planet predicted before it was seen: small tugs on Uranus’s orbit pointed to it, and in 1846 it was found within about a degree of the predicted spot.',
      },
      {
        heading: 'Weather',
        body: 'Neptune has the fastest winds in the Solar System, over 2,000 km/h. Voyager 2 saw a Great Dark Spot, a storm about as wide as Earth, which had vanished by the time Hubble looked a few years later.',
      },
      {
        heading: 'Triton',
        body: 'Its largest moon, Triton, orbits backwards, a sign it was captured from the Kuiper Belt. Voyager 2 saw plumes erupting from its frozen nitrogen surface.',
      },
    ],
    missions: [
      { year: '1846', name: 'Johann Galle', note: 'Discovered Neptune using Urbain Le Verrier’s prediction.' },
      { year: '1989', name: 'Voyager 2', note: 'The only spacecraft to visit; found 6 new moons and confirmed its rings.' },
    ],
  },
}
