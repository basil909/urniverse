/* ============================================================
   DEEP-DIVE CONTENT
   Figures from the NASA Planetary Fact Sheet / Sun Fact Sheet; mission
   history from NASA and ESA mission pages. Counts that change over
   time (moons) are dated. Keyed by chapter id.
============================================================ */

export type WorldDetail = {
  glance: { label: string; value: string }[]
  sections: { heading: string; body: string }[]
  /* the largest or most remarkable moons */
  moons?: { name: string; note: string }[]
  missions: { year: string; name: string; note: string }[]
  /* the timeline's heading (default "Exploration") */
  missionsHeading?: string
  /* a live figure: how far it has moved since the page opened, at a mean
     speed in km/s ({km} is filled in) */
  travel?: { kmPerSecond: number; sentence: string }
  source?: string
}

export const DETAIL_SOURCE =
  'Figures: NASA Planetary and Sun fact sheets. Missions: NASA and ESA.'

export const WORLD_DETAILS: Record<string, WorldDetail> = {
  sun: {
    travel: { kmPerSecond: 230, sentence: 'The Sun has carried the whole Solar System {km} around the galaxy since you opened this page.' },
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
    travel: { kmPerSecond: 47.4, sentence: 'Mercury has moved {km} along its orbit since you opened this page.' },
    glance: [
      { label: 'Diameter', value: '4,879 km (0.38 Earths)' },
      { label: 'Mass', value: '0.055 Earths' },
      { label: 'Gravity', value: '3.7 m/s² (0.38 g)' },
      { label: 'Day', value: '176 Earth days, sunrise to sunrise' },
      { label: 'Year', value: '88 Earth days' },
      { label: 'Temperature', value: '−180 °C to 430 °C' },
      { label: 'Moons', value: 'None' },
      { label: 'Axial tilt', value: '0.03°' },
      { label: 'Atmosphere', value: 'Almost none: a thin exosphere' },
      { label: 'From the Sun', value: '46–70 million km' },
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
    travel: { kmPerSecond: 35.0, sentence: 'Venus has moved {km} along its orbit since you opened this page.' },
    glance: [
      { label: 'Diameter', value: '12,104 km (0.95 Earths)' },
      { label: 'Mass', value: '0.82 Earths' },
      { label: 'Gravity', value: '8.9 m/s² (0.9 g)' },
      { label: 'Day', value: '117 Earth days, sunrise to sunrise' },
      { label: 'Spin', value: 'Once every 243 days, backwards' },
      { label: 'Year', value: '225 Earth days' },
      { label: 'Surface', value: '464 °C, 92 times Earth’s pressure' },
      { label: 'Moons', value: 'None' },
      { label: 'Atmosphere', value: '96.5% carbon dioxide, 3.5% nitrogen' },
      { label: 'From the Sun', value: '107–109 million km' },
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
    travel: { kmPerSecond: 29.8, sentence: 'Earth has moved {km} along its orbit since you opened this page.' },
    glance: [
      { label: 'Diameter', value: '12,742 km' },
      { label: 'Mass', value: '5.97 × 10²⁴ kg' },
      { label: 'Gravity', value: '9.8 m/s² (1 g)' },
      { label: 'Day', value: '24 hours' },
      { label: 'Year', value: '365.25 days' },
      { label: 'Average temperature', value: '15 °C' },
      { label: 'Moons', value: '1' },
      { label: 'Axial tilt', value: '23.4°' },
      { label: 'Atmosphere', value: '78% nitrogen, 21% oxygen' },
      { label: 'From the Sun', value: '147–152 million km' },
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
    travel: { kmPerSecond: 24.1, sentence: 'Mars has moved {km} along its orbit since you opened this page.' },
    glance: [
      { label: 'Diameter', value: '6,779 km (0.53 Earths)' },
      { label: 'Mass', value: '0.11 Earths' },
      { label: 'Gravity', value: '3.7 m/s² (0.38 g)' },
      { label: 'Day', value: '24 h 40 min' },
      { label: 'Year', value: '687 Earth days' },
      { label: 'Average temperature', value: 'About −65 °C' },
      { label: 'Moons', value: '2 (Phobos, Deimos)' },
      { label: 'Axial tilt', value: '25.2°' },
      { label: 'Atmosphere', value: '95% carbon dioxide, a little nitrogen and argon' },
      { label: 'From the Sun', value: '207–249 million km' },
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
    moons: [
      { name: 'Phobos', note: 'About 22 km across, it circles Mars three times a day and is slowly spiralling inwards: in some 50 million years it will break apart or crash.' },
      { name: 'Deimos', note: 'About 12 km across and farther out, it takes 30 hours to go round. Both moons may be captured asteroids, or debris from an ancient impact.' },
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
    travel: { kmPerSecond: 13.1, sentence: 'Jupiter has moved {km} along its orbit since you opened this page.' },
    glance: [
      { label: 'Diameter', value: '139,820 km (11 Earths)' },
      { label: 'Mass', value: '318 Earths' },
      { label: 'Gravity', value: '24.8 m/s² (2.5 g)' },
      { label: 'Day', value: '9 h 56 min' },
      { label: 'Year', value: '11.9 Earth years' },
      { label: 'Cloud tops', value: 'About −110 °C' },
      { label: 'Moons', value: '95+ known' },
      { label: 'Axial tilt', value: '3.1°' },
      { label: 'Atmosphere', value: 'About 90% hydrogen, 10% helium' },
      { label: 'From the Sun', value: '741–817 million km' },
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
    ],
    moons: [
      { name: 'Io', note: 'The most volcanically active world known: Jupiter’s tides knead its interior, feeding hundreds of active volcanoes. It is one of the four large moons Galileo found in 1610.' },
      { name: 'Europa', note: 'An ice shell over a salty ocean holding perhaps twice the water of Earth’s oceans; one of the best places to look for life.' },
      { name: 'Ganymede', note: 'The largest moon in the Solar System, 5,268 km across: bigger than Mercury, and the only moon with its own magnetic field.' },
      { name: 'Callisto', note: 'Its ancient surface is the most heavily cratered in the Solar System, almost unchanged for 4 billion years.' },
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
    travel: { kmPerSecond: 9.7, sentence: 'Saturn has moved {km} along its orbit since you opened this page.' },
    glance: [
      { label: 'Diameter', value: '116,460 km (9 Earths)' },
      { label: 'Mass', value: '95 Earths' },
      { label: 'Gravity', value: '10.4 m/s² (1.1 g)' },
      { label: 'Day', value: '10 h 34 min' },
      { label: 'Year', value: '29.4 Earth years' },
      { label: 'Cloud tops', value: 'About −140 °C' },
      { label: 'Moons', value: '274 known (2025)' },
      { label: 'Axial tilt', value: '26.7°' },
      { label: 'Atmosphere', value: 'About 96% hydrogen, 3% helium' },
      { label: 'From the Sun', value: '1.35–1.51 billion km' },
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
    ],
    moons: [
      { name: 'Titan', note: '5,150 km across, with a thick nitrogen atmosphere, methane rain and lakes of liquid methane and ethane. Huygens landed there in 2005.' },
      { name: 'Enceladus', note: 'Only about 500 km across, it sprays jets of water from an ocean beneath its ice; the spray feeds Saturn’s E ring.' },
      { name: 'Mimas', note: 'A giant crater, Herschel, a third of its width across, makes it look like the Death Star.' },
      { name: 'Iapetus', note: 'Two-toned: one side as dark as coal, the other bright as snow.' },
    ],
    missions: [
      { year: '1979', name: 'Pioneer 11', note: 'First flyby of Saturn.' },
      { year: '1980', name: 'Voyager 1 & 2', note: 'Revealed the intricate structure of the rings.' },
      { year: '2004', name: 'Cassini–Huygens', note: 'Orbited for 13 years; Huygens landed on Titan in 2005.' },
      { year: '2028', name: 'Dragonfly', note: 'A rotorcraft planned to launch in 2028 to fly across Titan.' },
    ],
  },

  uranus: {
    travel: { kmPerSecond: 6.8, sentence: 'Uranus has moved {km} along its orbit since you opened this page.' },
    glance: [
      { label: 'Diameter', value: '50,724 km (4 Earths)' },
      { label: 'Mass', value: '14.5 Earths' },
      { label: 'Gravity', value: '8.9 m/s² (0.9 g)' },
      { label: 'Day', value: '17 h 14 min, backwards' },
      { label: 'Year', value: '84 Earth years' },
      { label: 'Cloud tops', value: 'About −195 °C' },
      { label: 'Moons', value: '29 known (2025)' },
      { label: 'Axial tilt', value: '97.8°' },
      { label: 'Atmosphere', value: '83% hydrogen, 15% helium, 2% methane' },
      { label: 'From the Sun', value: '2.74–3.00 billion km' },
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
    moons: [
      { name: 'Miranda', note: 'A patchwork of grooves and ridges, with cliffs some 20 km tall: perhaps the steepest in the Solar System.' },
      { name: 'Ariel', note: 'The brightest of Uranus’s large moons, with a young surface cut by valleys.' },
      { name: 'Titania', note: 'The largest moon of Uranus, 1,578 km across, scarred by huge canyons.' },
      { name: 'Oberon', note: 'The outermost of the large moons: old, dark and heavily cratered.' },
    ],
    missions: [
      { year: '1781', name: 'William Herschel', note: 'Discovered Uranus: the first planet found with a telescope.' },
      { year: '1986', name: 'Voyager 2', note: 'The only spacecraft to visit; found 10 new moons and 2 new rings.' },
    ],
  },

  neptune: {
    travel: { kmPerSecond: 5.4, sentence: 'Neptune has moved {km} along its orbit since you opened this page.' },
    glance: [
      { label: 'Diameter', value: '49,244 km (3.9 Earths)' },
      { label: 'Mass', value: '17.1 Earths' },
      { label: 'Gravity', value: '11.0 m/s² (1.1 g)' },
      { label: 'Day', value: '16 h 6 min' },
      { label: 'Year', value: '165 Earth years' },
      { label: 'Cloud tops', value: 'About −200 °C' },
      { label: 'Moons', value: '16 known (2024)' },
      { label: 'Axial tilt', value: '28.3°' },
      { label: 'Atmosphere', value: '80% hydrogen, 19% helium, 1.5% methane' },
      { label: 'From the Sun', value: '4.44–4.55 billion km' },
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
    ],
    moons: [
      { name: 'Triton', note: '2,707 km across, it orbits backwards, a sign it was captured from the Kuiper Belt. Voyager 2 saw plumes erupting from its frozen nitrogen surface.' },
      { name: 'Proteus', note: 'About 420 km across and dark as soot, one of the largest bodies in the Solar System that is not round.' },
      { name: 'Nereid', note: 'On one of the most stretched orbits of any moon, swinging between 1.4 and 9.6 million km from Neptune.' },
    ],
    missions: [
      { year: '1846', name: 'Johann Galle', note: 'Discovered Neptune using Urbain Le Verrier’s prediction.' },
      { year: '1989', name: 'Voyager 2', note: 'The only spacecraft to visit; found 6 new moons and confirmed its rings.' },
    ],
  },

  beyond: {
    travel: { kmPerSecond: 17, sentence: 'Voyager 1 has travelled {km} farther from home since you opened this page.' },
    glance: [
      { label: 'Taken', value: '14 February 1990' },
      { label: 'From', value: 'About 6 billion km (40 AU) from the Sun' },
      { label: 'Earth in the photo', value: '0.12 of a pixel' },
      { label: 'Camera', value: 'Voyager 1’s narrow-angle camera' },
      { label: 'Voyager 1 launched', value: '5 September 1977' },
      { label: 'Speed', value: 'About 17 km/s (61,000 km/h)' },
      { label: 'Left the heliosphere', value: 'August 2012' },
      { label: 'Power', value: 'Plutonium, fading about 4 watts a year' },
    ],
    sections: [
      {
        heading: 'The family portrait',
        body: 'The Pale Blue Dot is one of 60 frames Voyager 1 took that day to make a portrait of the Solar System, catching six planets. Mercury was lost in the Sun’s glare and Mars was too faint. They were the last pictures it ever took: soon afterwards its cameras were switched off to save power.',
      },
      {
        heading: 'Beyond the planets',
        body: 'Past Neptune lies the Kuiper Belt, a ring of icy bodies that includes Pluto. Farther out, the solar wind meets the gas between the stars at the heliopause, which Voyager 1 crossed in 2012 and Voyager 2 in 2018. Beyond that, the Oort Cloud of comets may reach a third of the way to the nearest star.',
      },
      {
        heading: 'Voyager today',
        body: 'Both Voyagers still send data home, though their instruments are being switched off one by one as their power fades. Each carries a Golden Record of sounds and images from Earth, in case anyone ever finds it.',
      },
    ],
    missionsHeading: 'Milestones',
    missions: [
      { year: '1977', name: 'Voyager 1 & 2', note: 'Launched sixteen days apart, Voyager 2 first.' },
      { year: '1990', name: 'The Pale Blue Dot', note: 'Voyager 1’s last pictures: a portrait of the Solar System.' },
      { year: '2012', name: 'Interstellar space', note: 'Voyager 1 crosses the heliopause, the first spacecraft to do so.' },
      { year: '2015', name: 'New Horizons', note: 'The first close look at Pluto.' },
      { year: '2018', name: 'Voyager 2', note: 'Follows Voyager 1 into interstellar space.' },
      { year: '2019', name: 'Arrokoth', note: 'New Horizons visits the most distant object ever explored up close.' },
    ],
    source: 'Figures: NASA Voyager and New Horizons mission pages.',
  },

  galaxy: {
    travel: { kmPerSecond: 230, sentence: 'You have moved {km} around the centre of the galaxy since you opened this page.' },
    glance: [
      { label: 'Type', value: 'Barred spiral galaxy' },
      { label: 'Disc', value: 'About 100,000 light-years across' },
      { label: 'Stars', value: '100 to 400 billion' },
      { label: 'Age', value: 'About 13.6 billion years' },
      { label: 'Mass', value: 'About a trillion Suns, mostly dark matter' },
      { label: 'Sun to centre', value: 'About 26,000 light-years' },
      { label: 'Sun’s orbit', value: 'About 230 million years, at 230 km/s' },
      { label: 'At the centre', value: 'Sagittarius A*, a black hole of 4 million Suns' },
    ],
    sections: [
      {
        heading: 'Its shape',
        body: 'A bulge of old stars and a bar sit at the centre of a thin, flat disc, where spiral arms of gas and young stars wind outward. Around it all is a faint halo of ancient stars, globular clusters and the dark matter that holds the galaxy together.',
      },
      {
        heading: 'Our place',
        body: 'The Sun lies in the Orion Spur, a minor arm between two major ones, about halfway from the centre to the edge. We see the disc edge-on from inside it: the band of light across a dark night sky. Dust hides the centre from our eyes, but not from infrared and radio telescopes.',
      },
      {
        heading: 'The centre',
        body: 'Stars near the centre whip round an unseen mass of about 4 million Suns. Tracking them for decades proved it is a black hole, Sagittarius A*, work that won the 2020 Nobel Prize in Physics. In 2022 the Event Horizon Telescope released the first image of it.',
      },
      {
        heading: 'Neighbours',
        body: 'The Milky Way belongs to the Local Group of galaxies. The Large and Small Magellanic Clouds orbit it and can be seen from the southern hemisphere. The Andromeda Galaxy, 2.5 million light-years away, is approaching; recent studies give about even odds that the two merge within 10 billion years.',
      },
    ],
    missionsHeading: 'Milestones',
    missions: [
      { year: '1610', name: 'Galileo Galilei', note: 'His telescope showed the Milky Way is made of countless faint stars.' },
      { year: '1785', name: 'William Herschel', note: 'Mapped it by counting stars, and put the Sun near the centre.' },
      { year: '1918', name: 'Harlow Shapley', note: 'Globular clusters showed the Sun is far from the centre.' },
      { year: '1925', name: 'Edwin Hubble', note: 'Andromeda is another galaxy: the universe is far larger than ours.' },
      { year: '2013', name: 'Gaia', note: 'ESA’s survey mapped nearly 2 billion stars in 3D before retiring in 2025.' },
      { year: '2022', name: 'Event Horizon Telescope', note: 'The first image of the black hole at the centre.' },
    ],
    source: 'Figures: NASA, ESA (Gaia) and the Event Horizon Telescope collaboration.',
  },

  'local-group': {
    travel: { kmPerSecond: 110, sentence: 'The Milky Way and Andromeda have drawn {km} closer since you opened this page.' },
    glance: [
      { label: 'Members', value: 'More than 80 galaxies, mostly dwarfs' },
      { label: 'Size', value: 'About 10 million light-years across' },
      { label: 'Largest', value: 'Andromeda, then the Milky Way, then Triangulum' },
      { label: 'Andromeda', value: '2.5 million light-years away, about 220,000 across' },
      { label: 'Closing speed', value: 'About 110 km/s, Andromeda towards us' },
      { label: 'Triangulum', value: '2.7 million light-years away' },
      { label: 'Magellanic Clouds', value: '163,000 and 206,000 light-years away' },
      { label: 'Part of', value: 'The Laniakea Supercluster' },
    ],
    sections: [
      {
        heading: 'Andromeda',
        body: 'The largest galaxy of the group, a spiral of perhaps a trillion stars. On a dark night it is a faint, elongated smudge in the constellation Andromeda: the most distant thing most people can see with their own eyes. The light reaching you tonight left it 2.5 million years ago.',
      },
      {
        heading: 'Drawing closer',
        body: 'Andromeda and the Milky Way are approaching at about 110 km/s. Recent measurements with Gaia and Hubble give about even odds that the two merge within the next 10 billion years into one large galaxy. Even then, stars are so far apart that almost none would collide.',
      },
      {
        heading: 'Our satellites',
        body: 'The Large and Small Magellanic Clouds, visible from the southern hemisphere, orbit the Milky Way, trailing a stream of gas. The Large Cloud is massive enough to tug the Milky Way’s disc. Closer still, the Sagittarius dwarf galaxy is being torn apart and absorbed.',
      },
      {
        heading: 'Beyond',
        body: 'The Local Group lies on the outskirts of the Virgo Supercluster, itself part of the Laniakea Supercluster of about 100,000 galaxies, one of millions of such structures in a universe of hundreds of billions of galaxies.',
      },
    ],
    missionsHeading: 'Milestones',
    missions: [
      { year: '964', name: 'Abd al-Rahman al-Sufi', note: 'Records Andromeda as a “little cloud” in his Book of Fixed Stars.' },
      { year: '1519', name: 'Magellan’s voyage', note: 'Its chronicler describes the two Clouds of the southern sky.' },
      { year: '1925', name: 'Edwin Hubble', note: 'Shows Andromeda is a galaxy far beyond the Milky Way.' },
      { year: '1936', name: 'The Local Group', note: 'Hubble names our family of galaxies.' },
      { year: '2012', name: 'Hubble Space Telescope', note: 'Measures Andromeda’s sideways motion: it is heading for us.' },
      { year: '2025', name: 'Gaia and Hubble', note: 'A fresh study puts the odds of a merger at about one in two.' },
    ],
    source: 'Figures: NASA, ESA and published surveys of the Local Group.',
  },
}
