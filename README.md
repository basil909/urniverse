# urniverse — You Are Here

An interactive, scroll-driven 3D journey from the Sun, past all eight planets, out to our place in the Milky Way.

Scroll (or use the arrow keys) and the camera flies from world to world. Each planet arrives centre-screen with its story, key numbers and a scale model, and the journey ends by zooming out until the whole Solar System is a single dot on a spiral arm: **you are here**.

## Features

- **Cinematic camera journey.** Thirteen sections (intro, the Sun, eight planets, the Pale Blue Dot, the Milky Way, return), with the camera flying between them as you scroll.
- **Text that waits for the camera.** Each chapter's text appears only once the camera has arrived, and stays pinned while you read.
- **Real positions and motion.** Planets sit where they actually are on the visitor's date, on correctly oriented and tilted orbits (JPL orbital elements, Kepler's laws). In the wide views time runs at a few days per second so you can watch the orbits; Venus and Uranus spin backwards, as they really do.
- **A real sky.** The Milky Way panorama surrounds the scene, turned to its true ~60° angle to the planets' plane.
- **Real light and shadow.** Planets spin about their real IAU poles (true tilts and seasons). Saturn's rings and the planet shadow each other, moons cast shadows on their planets, and the Sun has granulation, limb darkening and a soft corona.
- **Real planet surfaces.** Photographic texture maps for every planet, Saturn's rings with real gaps, Earth with clouds, city lights and its Moon. Each planet has a hand-written shader fallback.
- **Sharp close-ups.** Once the camera arrives at a planet, 4K maps of it are decoded off the main thread and swapped in, one upload at a time; they are released when you move on, so only one planet's sharp maps are ever in memory. Phones keep the lighter 2K maps.
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
- **Relief and moon surfaces** (public domain): Mars and Mercury elevation from USGS Astrogeology (MGS MOLA, MESSENGER); the Moon's elevation from the LRO LOLA data in NASA's Scientific Visualization Studio CGI Moon Kit; Io, Europa, Ganymede and Callisto from USGS Galileo / Voyager mosaics. Details in `public/textures/planets/CREDITS.txt`.
- **Earth's normal and specular maps** in `public/textures/`: the source and licence of these files are not recorded in this repository. Confirm them before publishing the site.

## Status

- Developed and tested with the development server. A production build (`npm run build`) has not been verified yet.
- Performance has been measured on one desktop machine only. Lower-end phones and laptops are untested.
