// -----------------------------------------------------------------------------
// Countries where the integration is usable.
//
// The radio catalog is the one of the country picked in the configuration:
// the most listened stations of that country, its genres, its search. The
// list below is the integration's coverage — the same 20 codes as the
// manifest `countries` field (test/manifest.test.js keeps them in sync), the
// store maximum. They are the countries whose catalog is the richest in the
// community Radio Browser directory and whose languages the integration
// speaks, grouped by zone.
// -----------------------------------------------------------------------------

import { text } from './i18n.js';

export const ZONES = {
  WESTERN_EUROPE: text('Western Europe', "Europe de l'Ouest", 'Westeuropa', 'Europa occidental'),
  CENTRAL_EUROPE: text('Central Europe', 'Europe centrale', 'Mitteleuropa', 'Europa central'),
  SOUTHERN_EUROPE: text('Southern Europe', 'Europe du Sud', 'Südeuropa', 'Europa del sur'),
  NORTH_AMERICA: text('North America', 'Amérique du Nord', 'Nordamerika', 'América del Norte'),
  LATIN_AMERICA: text('Latin America', 'Amérique latine', 'Lateinamerika', 'América Latina'),
  OCEANIA: text('Oceania', 'Océanie', 'Ozeanien', 'Oceanía'),
};

// ISO 3166-1 alpha-2 code -> names + zone. The order is the order of the
// configuration select.
export const COUNTRIES = {
  FR: { name: text('France', 'France', 'Frankreich', 'Francia'), zone: 'WESTERN_EUROPE' },
  BE: { name: text('Belgium', 'Belgique', 'Belgien', 'Bélgica'), zone: 'WESTERN_EUROPE' },
  LU: { name: text('Luxembourg', 'Luxembourg', 'Luxemburg', 'Luxemburgo'), zone: 'WESTERN_EUROPE' },
  CH: { name: text('Switzerland', 'Suisse', 'Schweiz', 'Suiza'), zone: 'CENTRAL_EUROPE' },
  DE: { name: text('Germany', 'Allemagne', 'Deutschland', 'Alemania'), zone: 'CENTRAL_EUROPE' },
  AT: { name: text('Austria', 'Autriche', 'Österreich', 'Austria'), zone: 'CENTRAL_EUROPE' },
  NL: {
    name: text('Netherlands', 'Pays-Bas', 'Niederlande', 'Países Bajos'),
    zone: 'WESTERN_EUROPE',
  },
  GB: {
    name: text('United Kingdom', 'Royaume-Uni', 'Vereinigtes Königreich', 'Reino Unido'),
    zone: 'WESTERN_EUROPE',
  },
  IE: { name: text('Ireland', 'Irlande', 'Irland', 'Irlanda'), zone: 'WESTERN_EUROPE' },
  ES: { name: text('Spain', 'Espagne', 'Spanien', 'España'), zone: 'SOUTHERN_EUROPE' },
  PT: { name: text('Portugal', 'Portugal', 'Portugal', 'Portugal'), zone: 'SOUTHERN_EUROPE' },
  IT: { name: text('Italy', 'Italie', 'Italien', 'Italia'), zone: 'SOUTHERN_EUROPE' },
  CA: { name: text('Canada', 'Canada', 'Kanada', 'Canadá'), zone: 'NORTH_AMERICA' },
  US: {
    name: text('United States', 'États-Unis', 'Vereinigte Staaten', 'Estados Unidos'),
    zone: 'NORTH_AMERICA',
  },
  MX: { name: text('Mexico', 'Mexique', 'Mexiko', 'México'), zone: 'LATIN_AMERICA' },
  AR: { name: text('Argentina', 'Argentine', 'Argentinien', 'Argentina'), zone: 'LATIN_AMERICA' },
  CL: { name: text('Chile', 'Chili', 'Chile', 'Chile'), zone: 'LATIN_AMERICA' },
  CO: { name: text('Colombia', 'Colombie', 'Kolumbien', 'Colombia'), zone: 'LATIN_AMERICA' },
  PE: { name: text('Peru', 'Pérou', 'Peru', 'Perú'), zone: 'LATIN_AMERICA' },
  AU: { name: text('Australia', 'Australie', 'Australien', 'Australia'), zone: 'OCEANIA' },
};

export const COUNTRY_CODES = Object.keys(COUNTRIES);

export const DEFAULT_COUNTRY = 'FR';

/** The country name, in one language or as a multi-language text. */
export function countryName(code, language) {
  const country = COUNTRIES[code];
  if (!country) {
    return code;
  }
  return language ? (country.name[language] ?? country.name.en) : country.name;
}
