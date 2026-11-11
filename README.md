# urniverse — You Are Here

An interactive, scroll-driven 3D journey from the Sun, past all eight planets, out to our place in the Milky Way.

Scroll (or use the arrow keys) and the camera flies from world to world. Each planet arrives centre-screen with its story, key numbers and a scale model, and the journey ends by zooming out until the whole Solar System is a single dot on a spiral arm: **you are here**.

## Features

- **An opening entrance.** As the loading screen lifts, the camera sweeps in from far above the planets' plane, past the Milky Way, into the opening view.
- **A generative soundtrack (off by default).** The small button beside the title turns on a quiet ambient score made live in the browser (Web Audio, no audio files): a soft chord that glides to a new one in every chapter, a breath of space wind and distant bells.
- **Cinematic camera journey.** Thirteen sections (intro, the Sun, eight planets, the Pale Blue Dot, the Milky Way, return), with the camera flying between them as you scroll.
- **Fly it yourself.** The small button (top right) pauses the journey and hands you NASA's Space Shuttle. Steer with the mouse (its offset from the faint centre ring sets how fast you turn), the arrow keys, a drag on touch screens, or a gamepad's left stick; W, a held click, the Thrust button or the right trigger speeds up and the speed holds, S slows, Q and E roll; the scroll wheel or C pulls the camera back until the Shuttle is a glowing speck against the planet. Every world has a quiet marker with its name and distance (an arrow at the screen's edge when it is off screen), its mark and tint telling its kind at a glance: the Sun rayed and gold, planets a white ring, asteroids a stone-coloured diamond, moons a silver crescent, spacecraft a mint tracking bracket, stars a pale blue glint; hovering one says what it is ("Ice giant · tipped on its side"), and arriving names it. Click one, press 1–8 (0 for the Sun), or open the Go to list (G), every world grouped by kind, to warp there: the ship climbs clear, crosses at warp (round the Sun if it is in the way) and arrives a few radii out on the sunlit side, the goal growing from a point to a world; S drops out of warp. Speed tops out at the speed of light (Mars is then minutes away, Neptune hours); Shift is a warp of up to 40 times light speed, and the HUD gives your true speed; Esc or Land returns you exactly where you were. The ship turns with a little weight and momentum, banks into turns, levels its wings to the horizon of the planet below, and eases its nose up rather than flying into the ground. It is drawn at its true size, 37 m against a 12,742 km Earth (some 340,000 ship-lengths across), in a render layer of its own; you can come down to the edge of space, 100 km above Earth, where the sky is black, the air a thin blue line on a curved horizon, and the clouds lie low over the ground; the HUD shows your altitude, and speed adapts to the nearest surface.
- **Living close-ups.** While you read, the camera slowly swings a little way round the planet and back, so moons, rings and stars shift with real depth.
- **Text that waits for the camera.** Each chapter's text appears only once the camera has arrived, and stays pinned while you read.
- **Real positions and motion.** Planets sit where they actually are on the visitor's date, on correctly oriented and tilted orbits (JPL orbital elements, Kepler's laws). In the wide views time runs at a few days per second so you can watch the orbits; Venus and Uranus spin backwards, as they really do.
- **A real sky.** The Milky Way panorama surrounds the scene, turned to its true ~60° angle to the planets' plane, with every star visible to the naked eye (the 9,096 stars of the Yale Bright Star Catalogue) at its true position, brightness and colour (the very brightest with soft diffraction spikes), a luminous Milky Way band with dark dust rifts, golden towards the galactic centre, and real deep-sky objects at their true positions and true apparent sizes: the Orion, Carina, Lagoon, Eagle, Rosette and North America nebulae, the Andromeda Galaxy and the Magellanic Clouds, each as bright as it is to the eye under a dark sky (the telescope-only ones faint), in long-exposure colours; the band's dark rifts (the Great Rift, the Coalsack) and bright star clouds (Sagittarius, Scutum, Cygnus, Carina) are where they really are; constellations and a few star names show faintly in the opening view.
- **Real light and shadow.** Planets spin about their real IAU poles (true tilts and seasons). Saturn's rings and the planet shadow each other, moons cast shadows on their planets, and the Sun has granulation, limb darkening and a soft corona.
- **Real planet surfaces.** Photographic texture maps for every planet, Saturn's rings with real gaps, Earth with clouds, city lights and its Moon. Each planet has a hand-written shader fallback.
- **Sharp close-ups.** Once the camera arrives at a planet, 4K maps of it are decoded off the main thread and swapped in, one upload at a time; they are released when you move on, so only one planet's sharp maps are ever in memory. Phones keep the lighter 2K maps.
- **Drawn to scale.** The panel shows each world beside Earth (Earth beside the Moon) to scale, and the Solar System from above with where it and Earth are today.
- **Deep dives.** "More about" opens a panel for the Sun and each planet: key figures, what it is made of, what makes it unusual, and a timeline of the missions that explored it.
- **A sense of scale.** Every planet chapter shrinks the Sun to a 2 m door and tells you how big that planet would be and how far away, with a track showing true relative distances.
- **A Pale Blue Dot finale.** From beyond Neptune the camera looks back through a long lens at Earth, a single speck beside the Sun's glare, as Voyager 1 saw it in 1990. Then a long pull-back: the lens opens, the Solar System collapses to a point, and a "You are here" marker appears on a spiral arm of the Milky Way.
- **Quiet, editorial interface.** Two typefaces, a slim chapter rail and a hairline progress bar; the planet is always the hero.
- **Relief and living detail.** Mercury and Mars are shaded from real elevation maps, so craters and volcanoes catch the light; Jupiter's and Saturn's cloud bands flow and the Great Red Spot turns; the Sun has prominences; Jupiter's large moons show their real surfaces; the asteroid belt (with Jupiter's Trojans) and the Kuiper belt orbit at their true rates; a comet with ion and dust tails rounds the Sun during the opening view; the Milky Way glows with a bright core, spiral arms and dust lanes.
- **See inside.** From a planet's "More about" panel, "See inside" swaps the planet for a cut-open model: a quarter wedge removed, its layers (core, mantle, crust, or the giants' hydrogen and ice) painted on the cut faces and numbered to a key in the panel.
- **Backlit light.** In the backlit Venus, Earth and Saturn shots, soft rays fan out from the planet's sunlit rim.
- **Hands-on planets.** Drag to rotate the planet in focus; small markers on real features (Olympus Mons, the Great Red Spot, the Himalayas and more) reveal a short note on hover.
- **Works on phones.** On portrait screens the planet moves to the top half and the text to the bottom.
- **Accessible.** All chapter text is available to screen readers, there is keyboard navigation, and the OS "reduce motion" setting turns off smooth scrolling and camera drift.
- **Fast first load.** The first load needs only the 2K WebP textures (about 2 MB), self-hosted fonts and a loading screen that tracks real progress.

## What is real, and what is simplified

**Real**
- Planet positions and orbits for the simulated date (JPL orbital elements), their spin axes and tilts (IAU), relative rotation rates and directions.
- Planet sizes relative to each other (Jupiter is 11 Earths wide, Saturn 9).
- Earth's orientation: it is turned by sidereal time, so the day and night sides (and the city lights) match the simulated moment.
- The Moon's position and phase (a short lunar series, good to about a degree), with its near side always facing Earth.
- Jupiter's four large moons at their real orbital longitudes (Lieske's E5 mean longitudes); every moon at its real period on the same clock.
- The bright stars (positions and colours), the Milky Way's angle across the sky, Neptune in true colour.
- Figures and facts in the text and panels (NASA fact sheets; dated where they change).

**Simplified**
- In the journey, distances are compressed so everything fits on screen (in flight they are true: see below); the Sun is drawn much smaller than its true 109 Earth-widths; moons are enlarged and drawn closer to their planets. The text gives the true scale model.
- By default the motion is calm: the planets drift along their real orbits from today's positions (faster in the wide views, slowly in close-ups), while spins and moons turn at a gentle pace of their own. The **Real motion** button (top right) puts everything on one clock from this moment, at 1 hour, 1 day or 1 week per second, so orbits, Earth's day and night, the Moon's phases and the moons all keep true time together; the clock is shown beside it.
- The comet is illustrative, not a real comet. Saturn's, Mars's and Uranus's moons have real periods but not real positions. The Milky Way model is a stylised barred spiral, shown only in the finale (from inside the galaxy it can never appear as a spiral in our sky). 
- Weather details (Jupiter's flowing bands, Neptune's dark spot, Mars's dust storm) are artistic, based on what spacecraft have seen.
- In flight, everything is at true scale: the 37 m Shuttle, the planets' sizes, their distances (1 AU is 150 million km; Neptune is 4.5 billion km out) and the Sun, 109 Earths wide and half a degree across seen from Earth. The Solar System holds still while you fly (Earth alone moves 30 km a second and turns 465 m a second at the equator), so you can stand on it. The asteroid belt, Jupiter's Trojans and the Kuiper belt stand at their true distances, far apart as they really are (shown as a faint dust of points); the four largest asteroids, Ceres, Vesta, Pallas and Hygiea, are at their real positions (JPL orbits) and true sizes, shaped from noise since no maps of them are bundled. The comet, which is illustrative, is hidden in flight.
- Real air on Earth and Mars: sunlight scattered once on its way through the air, worked out along every line of sight (Rayleigh scattering by the gas, Mie by haze and dust). Earth's sky is blue and its sunsets orange-red; Mars's sky is the butterscotch of its dust, and round the setting Sun it turns blue, because the dust throws blue light further forward. The sky from the ground, the sunset and the thin blue edge seen from orbit are one calculation. From far off the air is drawn thicker (its colour unchanged) so that it shows.
- Landing (Mercury, Earth, the Moon, Mars and the large moons): press L anywhere within a few radii of a solid world and the Shuttle lands itself, as the real one did: it comes down (glowing through the air where there is air), flies a steep glide, flares a few tens of metres up, touches down at about 300 km/h and rolls out to a stop; W before touchdown goes round again, L again calls it off. Holding W takes off: a roll along the ground, rotation at about 300 km/h, a climb, and the controls are yours again 300 m up. The ground's large shapes are real (Mars's and Mercury's elevation maps, Earth's coastlines, with the sea flat), its colours the maps and NASA's streamed imagery; relief below a few km is generated. The sky lights up as you come down into the air (blue on Earth, butterscotch on Mars, black on airless Mercury). Venus (hidden under its clouds) and the giants (no surface) cannot be landed on.
- Earth, flying low: the ground is real. Its elevation streams from AWS Open Data Terrain Tiles (mostly NASA SRTM; mountains, valleys and coasts as they are) and its imagery from Sentinel-2 cloudless 2016 at about 10 m a pixel; a little generated roughness is added below their resolution.
- In flight: diving fast into a world's air wraps the ship in re-entry plasma (orange at the hull, violet at the edge, with a glowing wake and a shaking camera), driven by the air's density and the speed. The ship goes dark in a planet's shadow and is lit red through the air at orbital sunrise and sunset, when the Sun breaks over the limb in a burst of rays; low over the ground, the Shuttle casts its shadow. V cycles the camera (chase, fly-by, orbit); P is photo mode, with no HUD, and K saves the view as a picture.
- Also in flight: sound (with the sound switch on: engines, wind only where there is air, the roar and crackle of re-entry, warp's rising whine, touchdown); streaks of air racing past low down, and buffeting; Earth's cities lit on the night side from the ground; Earth's cloud deck (about 10 km up) to fly through, in mist; the Moon at its true size and distance, to land on (LRO elevation and imagery); the giants and Venus, to sink into: their haze darkens with depth, the pressure is shown (from the temperature's rise with depth) until it turns you back. The large moons stand at their true sizes and distances in flight, at their real positions, and can be landed on: Io, Europa (with its reddish cracks, generated), Ganymede, Callisto, Titan (under its orange haze), Phobos and Deimos (drawn round; generated relief). Near Saturn's ring plane, chunks of ice from pebbles to boulders tumble past, as dense as the ring map says (none in the Cassini Division), and the rings become the horizon. O puts the Shuttle into a circular orbit at its height, at the true orbital speed (93 minutes round Earth at the Space Station's height); T runs time (held still, real time, ×60, ×600, ×3,600) so worlds turn and moons move, and a ship standing on a world is carried with it. Flying low, real features are named as they come into view (Olympus Mons, Tycho, the Matterhorn, Gale Crater...). Fly to the Sun: granules a thousand km across resolve as you come in, sunspots show their umbra and penumbra, prominences rise off the limb, and the hull temperature climbs until the heat holds you back. Leave the Solar System: out past about 2,000 AU the sky is handed to 11,398 stars at their true 3D places (HYG database), so the constellations shift as you travel; warp to twenty named stars (Alpha Centauri, Sirius, Betelgeuse...), each drawn at its size and colour, and look back at the Sun as a bright star; crossing the heliopause (about 120 AU) is marked. Visit spacecraft at their true sizes (NASA models): the Space Station and Hubble on their real orbits (not their live places along them), Webb near L2, Voyager 1 (a light-day out) and 2 in their real directions and distances, Perseverance in Jezero crater. Close to Io, Europa, Ganymede and Titan, NASA's Galileo/Voyager and Cassini mosaics stream in (NASA Trek). A first flight is guided in three steps; each planet's chapter has a Fly there button; the picture quality steps down by itself if frames run long. Speed scales with the distance to the nearest world, so the planets are seconds apart.
- In flight, low over Earth, Mars or Mercury, the ground beneath you is NASA's own imagery, streamed tile by tile while you fly (Blue Marble and the VIIRS city lights at about 500 m a pixel, Viking's Mars mosaic, MESSENGER's Mercury basemap); Mars and Mercury are colour-matched to the maps. Detail finer than any data, the eddies on the giants and the finest ringlets are generated texture. Lightning in Earth's night-side clouds and the airglow line on its night limb are real phenomena, drawn illustratively.

## Tech stack

| | |
|---|---|
| Framework | [Next.js](https://nextjs.org/) 16 (App Router), React 19, TypeScript |
| 3D | [three.js](https://threejs.org/), [React Three Fiber](https://r3f.docs.pmnd.rs/), [drei](https://drei.docs.pmnd.rs/), [postprocessing](https://github.com/pmndrs/postprocessing) (bloom, vignette, grain) |
| Motion | [Framer Motion](https://www.framer.com/motion/) for interface transitions, [Lenis](https://lenis.darkroom.engineering/) for smooth scrolling |
| Fonts | Instrument Serif and Inter, self-hosted with `next/font` |

## Getting started

Requires **Node.js 20.9 or newer**.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

| Script | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |

## Project structure

```
src/
├─ app/
│  ├─ layout.tsx          Fonts, page metadata
│  ├─ page.tsx            Renders <Journey />
│  ├─ globals.css         All styles (design tokens, layout, HUD, responsive)
│  └─ icon.svg            Favicon
└─ components/
   ├─ Journey.tsx         Chapter content, scroll model, pinned text stage, HUD
   ├─ ui/
   │  ├─ Loader.tsx       Loading screen (tracks three.js texture loading)
   │  └─ DetailPanel.tsx  The "More about" deep-dive panel
   └─ experience/
      ├─ UniverseCanvas.tsx  Canvas, camera choreography, post-processing
      ├─ SolarSystem.tsx     Sun, planets, rings, Moon, shaders, drag-to-rotate, markers
      ├─ Galaxy.tsx          Procedural Milky Way and the "You are here" marker
      ├─ Starfield.tsx       Background stars
      ├─ sharpMaps.ts        4K maps for the planet in focus (load, upload, release)
      ├─ orbit.ts            Planet data, JPL orbital elements, Kepler positions
      └─ simClock.ts         Shared simulation date (starts today)
src/data/worlds.ts        Facts, science and missions for the deep-dive panel
public/textures/          Earth, Moon and planet texture maps (WebP; hd/ holds the 4K set)
```

### How the scroll works

The page is a tall empty scroll track; nothing visible scrolls. Scroll position becomes a single `progress` number (section index plus how far into it you are), which drives everything:

- **The camera** (`UniverseCanvas.tsx`) has a rest pose per section and eases between them during the first 18% of each section.
- **The text** (`Journey.tsx`) is shown only between 16% and 93% of a section, after the camera has arrived and before it leaves.
- **Planets** follow their orbits as progress advances; non-focused planets shrink to dots so they never crowd a close-up.

To add or remove a chapter, edit the `JOURNEY` array in `Journey.tsx` and add a matching camera pose in `getRestPose` in `UniverseCanvas.tsx`. Section counts, the chapter rail and the progress bar update automatically.

## Credits

- **Planet textures** (Mercury, Venus, Mars, Jupiter, Saturn and its rings, Uranus, Neptune, the 4K set in `hd/`), **Earth's day map, clouds and city lights**, the **Moon** and the **Milky Way sky**: [Solar System Scope](https://www.solarsystemscope.com/textures/), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Converted to WebP. See `public/textures/planets/CREDITS.txt`. The site also credits them on its closing screen.
- **Stars**: the Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991), from the Smithsonian Astrophysical Observatory's Telescope Data Center. See `public/data/CREDITS.txt`.
- **Earth's ground, flying low**: elevation from [Terrain Tiles on AWS Open Data](https://registry.opendata.aws/terrain-tiles/) (SRTM and other sources; see their attribution); imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH ([s2maps.eu](https://s2maps.eu), CC BY 4.0, contains modified Copernicus Sentinel data 2016). Both streamed only while flying low over Earth; credited on screen while shown.
- **Stars in 3D**: HYG Database v4.1 (astronexus, CC BY-SA), an extract in `public/data/stars-3d.bin`. **Spacecraft models**: NASA 3D Resources (ISS, Hubble, Webb, Voyager, Perseverance); see `public/models/CREDITS.txt`.
- **Streamed imagery in flight**: NASA's Global Imagery Browse Services (GIBS): Blue Marble Next Generation and VIIRS City Lights 2012; NASA Solar System Treks: Viking MDIM 2.1 colour mosaic (Mars), MESSENGER MDIS basemap (Mercury). Fetched live from NASA's servers only while flying low; nothing is bundled.
- **Space Shuttle** (the ship in flight mode): NASA's "Space Shuttle (A)" model from [NASA 3D Resources](https://nasa3d.arc.nasa.gov/), free of copyright; only the orbiter is used, recoloured as flown. It is Draco-compressed, read with the Draco decoder that ships with three.js (`public/draco/`). See `public/models/CREDITS.txt`.
- **Relief and moon surfaces** (public domain): Mars and Mercury elevation from USGS Astrogeology (MGS MOLA, MESSENGER); the Moon's elevation from the LRO LOLA data in NASA's Scientific Visualization Studio CGI Moon Kit; Io, Europa, Ganymede and Callisto from USGS Galileo / Voyager mosaics. Details in `public/textures/planets/CREDITS.txt`.
- **Earth's normal and specular maps** in `public/textures/`: the source and licence of these files are not recorded in this repository. Confirm them before publishing the site.

## Status

- Developed and tested with the development server. A production build (`npm run build`) has not been verified yet.
- Performance has been measured on one desktop machine only. Lower-end phones and laptops are untested.
