import type { ScenePitch } from './types.js';

/** Period/place research handed to the writer so presets skip the era-brief LLM call. */
export interface EraBrief {
  era_label: string;
  period_anchors: string[];
  avoid: string[];
  local_texture: string[];
}

export interface PresetDef {
  id: string;
  pitch: ScenePitch;
  eraBrief: EraBrief;
}

// Hand-researched inputs for the demo presets. Qloo + the agent still do the scouting;
// these only replace the parse / contrast-city / era-brief model calls.
export const PRESETS: PresetDef[] = [
  // ── Localize ──────────────────────────────────────────────────────────
  {
    id: 'localize-tokyo-cyberpunk',
    pitch: {
      director_mode: 'localize',
      home_market: 'United States (Seattle)',
      target_market: 'Tokyo',
      genre: 'cyberpunk action RPG',
      reference_favorites: ['Cyberpunk 2077', 'Ghostwire: Tokyo'],
      source_world_pitch: 'Bounty hunters gather around late-night food trucks, listen to indie synth radio and live on black diner coffee and canned rations.',
    },
    eraBrief: {
      era_label: 'Present-day Tokyo',
      period_anchors: [
        'Konbini chains (7-Eleven, FamilyMart, Lawson) open 24 hours',
        'JR Yamanote loop line and Suica / PASMO IC cards',
        'Izakaya alleys such as Omoide Yokocho and Golden Gai',
        'Private karaoke boxes and pachinko parlours',
        'Last-train culture: crowds rushing for the final train around midnight',
        'Don Quijote discount stores and Akihabara electronics',
      ],
      avoid: [
        'Samurai, ninjas or geisha as everyday street figures',
        'Mocking "Engrish" signage as a joke',
        'Treating all of Japan as Tokyo (Kyoto temples, Mount Fuji views from every street)',
        'Diner-style bottomless coffee refills',
        'Tipping culture',
        'Loud phone calls on trains being normal',
      ],
      local_texture: [
        'Vending machines on almost every corner, hot and cold drinks',
        'Salarymen in suits on the last train',
        'Neon signage stacked up multi-storey buildings',
        'Quiet, orderly queues on platform markings',
        'Late-night ramen and gyudon counters with ticket machines',
        'Cash still common at small shops alongside IC cards',
      ],
    },
  },
  {
    id: 'localize-delhi-crime',
    pitch: {
      director_mode: 'localize',
      home_market: 'United States (Chicago)',
      target_market: 'Delhi',
      genre: 'open-world crime drama',
      reference_favorites: ['Sleeping Dogs'],
      source_world_pitch: 'An underground courier syndicate operates out of greasy-spoon diners, relying on muscle-car garages and sports-bar networks.',
    },
    eraBrief: {
      era_label: 'Present-day Delhi',
      period_anchors: [
        'Delhi Metro network across the city and NCR',
        'UPI QR-code payments at almost every stall',
        'Zomato and Swiggy delivery riders',
        'Battery e-rickshaws alongside CNG auto-rickshaws',
        'Winter smog season and AQI talk in November',
        'Chandni Chowk, Hauz Khas Village and Connaught Place as hubs',
      ],
      avoid: [
        'Snake charmers and elephants on city streets',
        'Bollywood dance numbers as Delhi culture (that is Mumbai)',
        'Generic "curry" instead of specific dishes',
        'Cows as the main street obstacle',
        'Everyone speaking formal English',
        'Desert or jungle backdrops',
      ],
      local_texture: [
        'Chai stalls (tapri) at every corner and market',
        'Hindi-English code-switching (Hinglish)',
        'Late-night parantha and kebab joints',
        'Gated residential colonies with guards',
        'Wedding processions blocking roads in season',
        'Heavy honking, especially at red lights',
      ],
    },
  },
  {
    id: 'localize-saopaulo-heist',
    pitch: {
      director_mode: 'localize',
      home_market: 'United Kingdom (London)',
      target_market: 'São Paulo',
      genre: 'street racing and heist',
      reference_favorites: ['Forza Horizon 5', 'Max Payne 3'],
      source_world_pitch: 'A getaway crew works rain-slicked industrial alleys, meets in pub back rooms and listens to underground UK garage.',
    },
    eraBrief: {
      era_label: 'Present-day São Paulo',
      period_anchors: [
        'Marginal Tietê and Marginal Pinheiros expressways and their traffic',
        'Motoboys weaving through traffic as couriers',
        'Avenida Paulista closed to cars on Sundays',
        'Padarias (bakeries) as all-day neighbourhood hubs',
        'Pastel de feira at street markets',
        'Pixação tag-style graffiti on tall buildings',
      ],
      avoid: [
        'Rio de Janeiro imagery (Christ the Redeemer, Copacabana beach)',
        'Spanish language — Brazil speaks Portuguese',
        'Amazon jungle backdrops',
        'Samba as the only music',
        'Carnival as year-round street life',
        'Pubs as the default social space',
      ],
      local_texture: [
        'Garoa: light persistent drizzle',
        'Helicopters over the skyline',
        'Baile funk from cars and parties in the periphery',
        'Lanchonetes with coxinha and pão de queijo',
        'Dense high-rise neighbourhoods and the Copan building',
        'Football club rivalries (Corinthians, Palmeiras, São Paulo FC)',
      ],
    },
  },

  // ── Build ─────────────────────────────────────────────────────────────
  {
    id: 'build-hangzhou-tang',
    pitch: {
      director_mode: 'build',
      city: 'Hangzhou',
      era_or_mood: 'Tang dynasty, Chinese mythology',
      genre: 'action RPG',
      contrast_city: 'Beijing',
      reference_favorites: ['Black Myth: Wukong', 'Wo Long: Fallen Dynasty'],
    },
    eraBrief: {
      era_label: 'Tang dynasty Hangzhou (618–907)',
      period_anchors: [
        'Southern end of the Grand Canal, a busy canal port',
        'West Lake works under poet-governor Bai Juyi (governed 822–824)',
        'Lingyin Temple (founded 328) as a major Buddhist site',
        'Tea drinking spreading, in the era of Lu Yu’s Classic of Tea',
        'Canal barges carrying grain and silk',
        'Daoist and Buddhist folk beliefs side by side',
      ],
      avoid: [
        'Hangzhou as imperial capital (that is the Southern Song, from 1138)',
        'Longjing tea fame (later, Ming–Qing)',
        'Chili peppers, potatoes or corn (arrived 16th century)',
        'Blue-and-white porcelain (Yuan dynasty onward)',
        'Firearms and gunpowder weapons',
        'Qing-style queues (braided hairstyles)',
      ],
      local_texture: [
        'Mist over West Lake and surrounding hills',
        'Silk weaving and sericulture',
        'Rice paddies and water buffalo outside the city',
        'Monks, pilgrims and incense at hillside temples',
        'Poetry recited at banquets',
        'Tile-roofed timber buildings along canals',
      ],
    },
  },
  {
    id: 'build-delhi-2000s-vn',
    pitch: {
      director_mode: 'build',
      city: 'Delhi',
      era_or_mood: 'early 2000s, monsoon, university and colony life',
      genre: 'visual novel',
      contrast_city: 'Mumbai',
    },
    eraBrief: {
      era_label: 'Delhi, early 2000s (about 2000–2004)',
      period_anchors: [
        'Delhi Metro’s first line opens in December 2002 (Shahdara–Tis Hazari)',
        'Supreme Court-ordered switch of buses and autos to CNG (2001–2002)',
        'Cyber cafés, dial-up internet and Yahoo Messenger',
        'STD/ISD/PCO phone booths; Nokia feature phones spreading',
        'Blueline private buses and DTC buses',
        'Maruti 800 cars; Nirula’s and Palika Bazaar in Connaught Place',
      ],
      avoid: [
        'Smartphones, WhatsApp, UPI or app cabs (Ola/Uber)',
        'Delhi Metro Airport Express (2011) or the full Metro network',
        'The 2010 Commonwealth Games and its flyovers',
        'Malls like Ambience or Select Citywalk (opened 2007)',
        'Zomato or Swiggy delivery',
        'Present-day slang from social media',
      ],
      local_texture: [
        'North Campus (Delhi University) and college fest culture',
        'Monsoon waterlogging and power cuts with inverters',
        'Cassettes and early CDs; FM radio stations launching',
        'Chai and Maggi at college canteens',
        'Colony rooftops, parks and RWA aunties',
        'Exam pressure and coaching centres',
      ],
    },
  },
  {
    id: 'build-lagos-1990s',
    pitch: {
      director_mode: 'build',
      city: 'Lagos',
      era_or_mood: '1990s, military-era noir',
      genre: 'detective adventure',
      contrast_city: 'Abuja',
    },
    eraBrief: {
      era_label: 'Lagos, 1990s',
      period_anchors: [
        'Military rule, including the Abacha years (1993–1998)',
        'Third Mainland Bridge (opened 1990)',
        'Danfo minibuses and molue buses; okada motorbike taxis spreading',
        'NEPA power cuts and generator noise',
        'Fela Kuti’s original Afrika Shrine (Fela died in 1997)',
        'Home-video films on VHS after Living in Bondage (1992)',
      ],
      avoid: [
        'The New Afrika Shrine (opened 2000)',
        'Smartphones, mobile money or ride-hailing apps',
        'BRT buses (2008) and the Lekki toll gate',
        'Calling it "Afrobeats" (2010s pop); Fela’s genre is Afrobeat',
        'Eko Atlantic and present-day Lekki skyline',
        'Abuja as a sleepy village (it became capital in 1991)',
      ],
      local_texture: [
        'Fuel queues during scarcity',
        'Conductors shouting bus routes',
        'Pidgin English on the street',
        'Owambe parties with aso ebi outfits',
        'Roadside suya and buka food spots',
        'Area boys and checkpoints',
      ],
    },
  },
  {
    id: 'build-neworleans-1970s',
    pitch: {
      director_mode: 'build',
      city: 'New Orleans',
      era_or_mood: '1970s bayou summer',
      genre: 'horror adventure',
      contrast_city: 'Atlanta',
      reference_favorites: ['Resident Evil 7: Biohazard', 'Mafia III'],
    },
    eraBrief: {
      era_label: 'New Orleans, 1970s',
      period_anchors: [
        'New Orleans Jazz & Heritage Festival (started 1970)',
        'Louisiana Superdome opens in 1975',
        'Claiborne Avenue overpass (I-10) over Tremé, completed late 1960s',
        'St. Charles Avenue streetcar',
        'Preservation Hall traditional jazz (opened 1961)',
        'Mardi Gras krewes and second-line parades',
      ],
      avoid: [
        'Hurricane Katrina and post-2005 imagery',
        'Mobile phones or internet',
        'Harrah’s casino (1999) and modern casino culture',
        'Treating voodoo as only horror-movie cliché',
        'Mixing Cajun country and city Creole culture without care',
        'Present-day bounce music as era-accurate',
      ],
      local_texture: [
        'Humid summer storms and ceiling fans',
        'Shotgun houses and wrought-iron balconies',
        'Chicory coffee and beignets',
        'Po’boys and crawfish boils',
        'Brass bands and funeral second lines',
        'Swamp tours and bayou fishing camps outside the city',
      ],
    },
  },

  // ── Refresh ───────────────────────────────────────────────────────────
  {
    id: 'refresh-mexicocity-muertos',
    pitch: {
      director_mode: 'refresh',
      target_region: 'Mexico City',
      seasonal_event: 'Día de Muertos (1–2 November)',
      genre: 'open-world racing',
      reference_favorites: ['Forza Horizon 5'],
    },
    eraBrief: {
      era_label: 'Día de Muertos in present-day Mexico City',
      period_anchors: [
        'Ofrendas (altars) with photos, food and cempasúchil marigolds',
        'Pan de muerto and sugar skulls',
        'The Mexico City Day of the Dead parade (held since 2016)',
        'La Catrina skeleton figure (from José Guadalupe Posada’s work)',
        'Calaveritas literarias: humorous rhyming epitaphs',
        'Cemetery vigils such as in Mixquic',
      ],
      avoid: [
        'Calling it "Mexican Halloween"',
        'Sombreros and ponchos as standard dress',
        'Desert landscapes for the capital',
        'Treating Catrina face paint as only a costume gag',
        'Spanish from Spain instead of Mexican Spanish',
        'Tequila as the only drink',
      ],
      local_texture: [
        'Marigold petals and papel picado over streets',
        'Copal incense smoke',
        'Families cleaning and decorating graves',
        'Street food: tamales, atole, tacos al pastor',
        'Traffic around Reforma and the Zócalo during the parade',
        'Mariachi and banda music at gatherings',
      ],
    },
  },
  {
    id: 'refresh-delhi-diwali',
    pitch: {
      director_mode: 'refresh',
      target_region: 'Delhi',
      seasonal_event: 'Diwali and the winter bazaar season',
      genre: 'action adventure',
    },
    eraBrief: {
      era_label: 'Diwali season in present-day Delhi',
      period_anchors: [
        'Dhanteras shopping for gold, steel utensils and electronics',
        'Crowded Chandni Chowk, Sadar Bazaar and Lajpat Nagar markets',
        'Boxes of mithai and dry fruits as gifts',
        'Diyas, rangoli and fairy lights on balconies',
        'Firecracker restrictions and "green crackers" debates',
        'Card parties (teen patti) during the festival',
      ],
      avoid: [
        'Diwali as a single-day event (it spans several days)',
        'Holi colours (a different festival)',
        'Generic "Indian music" with no specifics',
        'Ignoring the post-Diwali smog season',
        'Everyone celebrating identically regardless of community',
        'Fireworks free-for-all without restrictions',
      ],
      local_texture: [
        'Traffic jams around markets in the evening',
        'Lakshmi puja on the main night',
        'Office Diwali gifts and corporate hampers',
        'Smoke and haze in early November',
        'Sweet shop queues (halwais)',
        'Lights on gated colony gates and RWA decorations',
      ],
    },
  },
  {
    id: 'refresh-taipei-lunarnewyear',
    pitch: {
      director_mode: 'refresh',
      target_region: 'Taipei',
      seasonal_event: 'Lunar New Year and the Lantern Festival',
      genre: 'urban fantasy RPG',
    },
    eraBrief: {
      era_label: 'Lunar New Year in present-day Taipei',
      period_anchors: [
        'Dihua Street New Year market for snacks and dried goods',
        'Red envelopes (hongbao) for children and elders',
        'Family reunion dinner on New Year’s Eve',
        'Temple visits, e.g. Longshan Temple at midnight',
        'Lantern Festival on the 15th day; sky lanterns at Pingxi',
        'Spring couplets (chunlian) on doorways',
      ],
      avoid: [
        'Taipei 101 fireworks (those are for 31 December, not Lunar New Year)',
        'Mainland China-specific customs presented as Taiwanese',
        'Japanese festival imagery',
        'Dragons as the only decoration',
        'Business-as-usual shops (many close for days)',
        'Snow in Taipei',
      ],
      local_texture: [
        'Night markets busy before the holiday',
        'Scooters packed with gifts heading home',
        'Mahjong at family gatherings',
        'Pineapple cakes and new-year cakes (niangao)',
        'Firecrackers at temples',
        'Cold, damp winter weather',
      ],
    },
  },
];

export function getPreset(id?: string): PresetDef | undefined {
  return id ? PRESETS.find(p => p.id === id) : undefined;
}
