/* ============================================================
   SAMPLES OF THE GROUND (F, on foot)
   What a scoop of each world's surface would hold, and what it tells of
   the world: from the samples brought home (Apollo, Luna), what landers
   and rovers measured where they stood, and what orbiters see. Each
   world's list is taken in turn, then round again.
============================================================ */

const SAMPLES: Record<number, string[]> = {
  // Mercury (MESSENGER)
  0: [
    'Dark crust · its darkness may be graphite, left from Mercury’s first crust',
    'Regolith rich in sulphur and poor in iron, unlike the Moon’s',
    'Volcanic plains rock · lava once flooded much of Mercury',
  ],
  // Earth
  2: [
    'Soil · alive: a teaspoonful holds billions of microbes',
    'Granite · continental crust; it seems to need water and moving plates to form',
    'Sandstone · grains laid down by water or wind, then pressed into rock',
    'Basalt · the rock of the ocean floors, under most of Earth’s surface',
  ],
  // Mars (the rovers, the orbiters)
  3: [
    'Dust · fine as flour and red with iron oxide: rust colours the planet',
    'Basalt · volcanic rock, the stuff of most of Mars’s crust',
    'Hematite spherules · the “blueberries” Opportunity found, grown in water long ago',
    'Mudstone · Curiosity drilled it in Gale crater, the floor of an old lake',
    'Sulphate salts · left where water pooled and dried away',
  ],
  // the Moon (Apollo, Luna)
  12: [
    'Regolith · grey soil ground fine by four billion years of meteorites',
    'Mare basalt · dark lava that flooded the great basins some 3 to 3.9 billion years ago',
    'Anorthosite · pale highland rock, crust that floated up on an ocean of magma',
    'Breccia · rock shattered by impacts and welded back together',
    'Glass beads · sprayed out by fire fountains (Apollo 17 found orange ones)',
  ],
  // Io
  13: [
    'Sulphur frost · fallen from the plumes of Io’s volcanoes, the busiest anywhere',
    'Fresh silicate lava · Io’s eruptions run hotter than any on Earth today',
  ],
  // Europa
  14: [
    'Water ice · hard as rock at −160 °C; an ocean lies kilometres beneath it',
    'Reddish salts in the ice · perhaps welled up from the ocean below',
  ],
  // Ganymede
  15: [
    'Ice and dark rock · Ganymede is the largest moon there is, bigger than Mercury',
    'Bright grooved ice · the crust here was pulled apart and refrozen',
  ],
  // Callisto
  16: [
    'Dark dusty ice · Callisto’s surface is among the most cratered known',
    'Ice and rock barely sorted · its insides never fully melted apart',
  ],
  // Titan (Huygens)
  17: [
    'Pebbles of water ice · rounded by flowing methane, as Huygens saw them',
    'Organic sand · hydrocarbon grains, the stuff of Titan’s great dunes',
  ],
  // Phobos, Deimos
  18: ['Dusty regolith · whether Phobos was captured or born of an impact is still unknown'],
  19: ['Smooth dusty regolith · Deimos’s craters are half-filled with it'],
}

/** the nth sample from a world (1 first), and what it is */
export function sampleFor(body: number, n: number) {
  const list = SAMPLES[body] ?? ['A scoop of the ground']
  return `Sample ${n}\n${list[(n - 1) % list.length]}`
}
