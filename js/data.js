/* ==========================================================================
   EMOTION 26 — SCHEDULE DATA
   --------------------------------------------------------------------------
   This is the ONLY file you need to edit to fix a time, add an artist,
   rename a stage, or change the festival dates.

   HOW A SET LIST WORKS
   --------------------
   Each stage/day is a list of ["HH:MM", "Artist Name"] pairs in 24-hour time.

     ["21:00", "Bassculprit"]     -> Bassculprit starts at 9:00 PM
     ["06:00", null]              -> stage closed / nothing on from here

   An optional THIRD item is a note shown under the name — use it for a
   different location, a host, or a prerequisite:

     ["11:00", "Guided Paint Experience", "At Art N' Groove"]

   A set runs until the NEXT entry in the list. So to make a set shorter,
   add a `null` entry at the time it ends. To make it longer, delete the
   entry after it.

   KEEP EACH LIST IN RUNNING ORDER — that is how after-midnight sets work.
   Any time that isn't later than the one above it rolls over to the next
   morning, so on Friday ["23:00", ...] then ["02:30", "Billy B"] puts Billy B
   at 2:30 AM on Saturday. You never have to write a date.

   Always finish a list with a `null` entry at the time the stage closes,
   otherwise the last set is assumed to be one hour long.
   ========================================================================== */

const FESTIVAL = {
  name: 'Emotion 26',
  tagline: 'Three days. Five stages. Plus workshops.',

  /* ---- BUMP THESE TWO WHENEVER YOU CHANGE ANYTHING ------------------
     The version is shown in Settings so people can confirm they're on the
     newest copy, and the service worker uses it to name its cache — so
     bumping it is also what pushes the update out to phones.
     `updated` is UTC (the trailing Z matters); each phone shows it in
     local time. -------------------------------------------------------- */
  version: '1.9',
  updated: '2026-07-31T23:50:00Z',

  /* ---- CHANGE THE DATES HERE ---------------------------------------- */
  days: [
    { id: 'fri', label: 'Friday',   short: 'FRI', date: '2026-07-31' },
    { id: 'sat', label: 'Saturday', short: 'SAT', date: '2026-08-01' },
    { id: 'sun', label: 'Sunday',   short: 'SUN', date: '2026-08-02' }
  ],

  /* ---- ANNOUNCEMENTS --------------------------------------------------
     Timed messages for everyone, not tied to a starred set. Each one fires a
     notification at `at` (only for people who have notifications switched on)
     and shows as a banner on the schedule from `at` until `until`, which is
     what most people will actually see.

     `at` and `until` are 24-hour times on the given day. Give each one a
     unique `id` — it's what stops a message firing twice.
     -------------------------------------------------------------------- */
  announcements: [
    {
      id: 'notown-open-sat',
      day: 'sat', at: '14:00', until: '17:45',
      title: 'Notown is open',
      body: 'More rye, less pants.',
      image: 'assets/notown-wide.jpg',
      icon: 'assets/notown-square.jpg'
    },
    {
      id: 'notown-open-sun',
      day: 'sun', at: '14:00', until: '17:45',
      title: 'Notown is open',
      body: 'More rye, less pants.',
      image: 'assets/notown-wide.jpg',
      icon: 'assets/notown-square.jpg'
    }
  ],

  /* ---- STAGES -------------------------------------------------------- */
  stages: [
    { id: 'main',  name: 'Main Stage',       short: 'Main',     color: '#ff7eb6' },
    { id: 'tree',  name: 'Treehouse',        short: 'Treehouse', color: '#5ccfee' },
    { id: 'ocul',  name: 'The Oculary',      short: 'Oculary',  color: '#b28dff' },
    { id: 'noto',  name: 'Notown',           short: 'Notown',   color: '#6ee7a8' },
    { id: 'oil',   name: 'The Midnight Oil', short: 'Midnight', color: '#ffc45c' },
    {
      id: 'wksp', name: 'Workshops', short: 'Workshops', color: '#ff9a6c',
      venue: 'The Glow Lounge',
      unit: 'workshops',      // shown instead of "sets" in the stage header
      note: 'Workshops meet at The Glow Lounge unless a location is given below. ' +
            'The Good Vibes Games Grounds run all weekend at the Emotion Sign.'
    }
  ],

  /* ---- THE SCHEDULE -------------------------------------------------- */
  schedule: {
    main: {
      fri: [
        ['12:00', 'Squirrly J'],
        ['13:00', 'Charles Simpson'],
        ['14:00', 'Just Amber'],
        ['15:00', 'Donut Jones Jr.'],
        ['16:00', "Don't Call Me Steven"],
        ['17:00', 'DJ All Love'],
        ['18:00', 'Moonraaker'],
        ['19:00', 'Plains'],
        ['20:00', 'Adam Scott'],
        ['21:00', 'Jonny Love Drunk'],
        ['22:00', 'Alan Flava'],
        ['23:00', 'Koji Aiken'],
        ['00:00', 'RUST'],
        ['01:30', 'Flatland Funk'],
        ['02:30', 'Billy B'],
        ['03:30', 'Emilio Del Canto'],
        ['05:00', 'DJ US Marshall'],
        ['06:00', null]
      ],
      sat: [
        ['12:00', 'Fractal Flow Yoga'],
        ['13:00', 'MissMomentum'],
        ['14:00', 'Miss Laurain'],
        ['15:00', 'Dr. J — History of House'],
        ['17:00', 'HappyCat / HappyBuzz'],
        ['18:00', 'Baszo'],
        ['19:00', 'goodiesmooth'],
        ['20:00', 'Devon Dare'],
        ['21:00', 'Bassculprit'],
        ['22:30', 'AKASHAH'],
        ['23:30', 'Digaboo'],
        ['01:00', 'Vie Sauvage'],
        ['02:00', 'Shael B2B Mark Grimace'],
        ['03:30', 'DJ Dopamine'],
        ['05:00', 'Jeff Incarnate'],
        ['06:00', null]
      ],
      sun: [
        ['12:00', 'DJ Rizzo'],
        ['13:00', 'Dr Dust'],
        ['14:30', 'Wyldshark'],
        ['15:30', 'Scotty Buckets'],
        ['16:30', 'Keith Kelly'],
        ['17:30', 'Lumen8'],
        ['18:30', 'Groove Tactics'],
        ['19:30', 'Strategik'],
        ['20:30', 'Gumby'],
        ['21:30', 'J.A.DJ'],
        ['23:00', 'DJ Webb'],
        ['00:30', 'Craze'],
        ['02:00', 'RUMPUS'],
        ['03:30', 'Civillian'],
        ['05:00', 'Mikhail'],
        ['06:00', null]
      ]
    },

    tree: {
      fri: [
        ['12:00', 'Judge WT'],
        ['13:00', 'Tim Damage'],
        ['15:00', 'Switch Rhythym'],
        ['16:00', 'Evotek'],
        ['17:00', 'XPedite'],
        ['18:00', 'FirstNationsensation'],
        ['19:00', 'NotMYAuthority'],
        ['20:00', 'DJ Woo'],
        ['21:00', 'Smash Cox'],
        ['22:00', 'Stellar Mat'],
        ['23:00', 'FUNKENICKIE'],
        ['00:00', 'DJ Robin Mang'],
        ['01:00', 'Toshiinlove'],
        ['02:00', 'Marko Dynamo'],
        ['03:00', 'CakeBaby'],
        ['04:00', 'A-Jacked'],
        ['05:30', null]
      ],
      sat: [
        ['12:00', 'Betty Rumbles'],
        ['13:00', 'actcasual'],
        ['14:00', "Megan & Jim's Wedding"],
        ['15:00', 'Lurch'],
        ['16:00', 'PeachyKief'],
        ['17:00', 'NUMZ'],
        ['18:00', 'OWIU'],
        ['20:00', 'Swayze'],
        ['21:00', 'Glowing Embers'],
        ['23:00', 'elle fast'],
        ['00:00', 'Provoke'],
        ['01:00', 'Toast'],
        ['02:00', "S'Moore"],
        ['03:00', 'Wätermelt'],
        ['04:00', 'The Degenerates'],
        ['05:30', null]
      ],
      sun: [
        ['12:00', 'BXTR'],
        ['13:00', 'DJ Tarabytes'],
        ['14:00', 'ROMANTEK'],
        ['15:00', '$oul$istas'],
        ['16:00', 'Tonika'],
        ['17:00', 'Trav Is Not'],
        ['18:00', 'steereo'],
        ['19:00', 'EhAchilles'],
        ['20:00', 'Earth Bound Collective'],
        ['21:00', 'Rezdint Funk'],
        ['22:30', 'Eddie Santini'],
        ['00:00', 'Mike Conradi'],
        ['01:00', 'Rubix'],
        ['02:00', 'DJ ME&R'],
        ['03:00', 'SCØØCH'],
        ['04:00', 'Hold The Lettuce'],
        ['05:30', null]
      ]
    },

    ocul: {
      fri: [
        ['12:00', 'Film'],
        ['14:00', 'Sierra Doe'],
        ['15:30', null],
        ['19:00', 'OWIU'],
        ['20:30', null],
        ['21:00', 'Peazy'],
        ['22:30', 'Scatterpattern'],
        ['23:30', null]
      ],
      sat: [
        ['12:00', 'Film'],
        ['14:00', 'High Tea'],
        ['17:00', null],
        ['17:30', 'Donut Jones Jr.'],
        ['19:30', 'Evotek'],
        ['21:00', 'Mikhail'],
        ['23:00', 'Dig.It.All'],
        ['01:00', 'Squirrly J'],
        ['02:30', null]
      ],
      sun: [
        ['12:00', 'Film'],
        ['14:00', 'Guidewire'],
        ['15:00', 'Plains'],
        ['17:00', 'Whitley360'],
        ['19:00', 'Billy B'],
        ['21:30', null],
        ['22:00', 'Scatterpattern'],
        ['23:30', null],
        ['00:30', 'Admiral Isocellator'],
        ['02:30', null]
      ]
    },

    noto: {
      fri: [],
      sat: [
        ['14:00', 'Glen Bain'],
        ['15:15', 'FUNKENICKIE'],
        ['16:30', 'Top Pocket Fiend'],
        ['17:45', null]
      ],
      sun: [
        ['14:00', 'Doc Irock'],
        ['15:15', 'Brent P'],
        ['16:30', 'Big Orange Dan'],
        ['17:45', null]
      ]
    },

    oil: {
      fri: [
        ['13:00', 'Open Decks'],
        ['14:00', 'Open Mic'],
        ['15:00', 'DJ Webb'],
        ['16:00', 'Robin Mang'],
        ['17:30', 'Arek3XSL'],
        ['19:30', 'Mikhail'],
        ['21:00', null]
      ],
      sat: [
        ['13:00', 'Open Decks'],
        ['14:00', 'Open Mic'],
        ['15:00', 'Billy B'],
        ['18:00', 'Alex Tha Rippa'],
        ['19:00', 'DJ ME&R'],
        ['21:00', null]
      ],
      sun: [
        ['13:00', 'Open Decks'],
        ['14:00', 'Open Mic'],
        ['15:00', 'Emilio Del Canto'],
        ['18:00', 'Evotek'],
        ['19:00', 'Geosphere'],
        ['21:00', null]
      ]
    },

    wksp: {
      fri: [
        ['11:00', 'Guided Paint Experience', "At Art N' Groove"],
        ['12:00', 'Ignite Your Flow: Beginner Hoop Isolations & Mini Combo', 'With FENIX'],
        ['13:00', 'LENS LAB', 'By Zoie Topia'],
        ['14:00', 'Poi Playground', 'With NEENR'],
        ['15:00', 'Making Giant Bubbles', 'With Sprout'],
        ['16:00', 'Fire Flow Safety 101',
          "By Elementa, featuring Spinja & J's. Prerequisite FAI fire safety course for Saturday's Flow Jam."],
        ['17:00', null]
      ],
      sat: [
        ['12:00', 'Fractal Flow Yoga', 'At Main Stage'],
        ['13:00', 'Keep Growing', 'By Paper Doll. Ongoing all weekend.'],
        ['14:00', 'The Cypher Lab', 'A community hip-hop writing and freestyle'],
        ['15:00', 'Sacred Self Love Rituals & Potions', 'By Lacey'],
        ['16:00', 'Ecstatic Dance', 'With Nicole Rose'],
        ['17:00', null],
        ['20:00', 'Fire Flow Jam', 'Hosted by Elementa. At the Emotion Sign.'],
        ['21:00', null]
      ],
      sun: [
        ['11:00', 'Rubber Duck Costume Contest & Water Fight', "At Art N' Groove"],
        ['12:00', 'Rest & Reset: Yoga & Soundbath'],
        ['13:00', 'Beginner Floorwork & Flow',
          'With Suumii, featuring Miss Maple Munroe & Erika the Duchess of PLUR'],
        ['14:00', 'Circus Arts', 'With Juggler Joel & Friends'],
        ['15:00', 'Intro to Club Contact / Manipulation Juggles', 'With Moderately Amazing Eli'],
        ['16:00', null]
      ]
    }
  }
};
