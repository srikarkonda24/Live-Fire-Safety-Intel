/** West, south, east, north in degrees (FIRMS / MapLibre fitBounds). */
export type MapFocusBBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type MapFocusRegion = {
  id: string;
  label: string;
  bbox: MapFocusBBox;
};

export type MapFocusCountry = {
  id: string;
  label: string;
  /** Whole-country extent when “Entire country” is selected. */
  bbox: MapFocusBBox;
  regions: MapFocusRegion[];
};

export const MAP_FOCUS_COUNTRIES: MapFocusCountry[] = [
  {
    id: "us",
    label: "United States",
    bbox: { west: -125.2, south: 24.0, east: -66.5, north: 49.6 },
    regions: [
      {
        id: "us-west",
        label: "West Coast",
        bbox: { west: -125.0, south: 32.2, east: -114.0, north: 49.2 },
      },
      {
        id: "us-east",
        label: "East Coast",
        bbox: { west: -84.5, south: 24.5, east: -66.5, north: 47.5 },
      },
      {
        id: "us-gulf",
        label: "Gulf & Southeast",
        bbox: { west: -100.5, south: 25.5, east: -80.0, north: 37.5 },
      },
      {
        id: "us-midwest",
        label: "Midwest",
        bbox: { west: -97.5, south: 35.5, east: -82.0, north: 48.5 },
      },
      {
        id: "us-southwest",
        label: "Southwest",
        bbox: { west: -116.5, south: 31.0, east: -103.0, north: 42.5 },
      },
    ],
  },
  {
    id: "ca",
    label: "Canada",
    bbox: { west: -141.2, south: 41.5, east: -52.5, north: 69.8 },
    regions: [
      {
        id: "ca-west",
        label: "British Columbia & Yukon",
        bbox: { west: -139.5, south: 48.0, east: -114.0, north: 60.5 },
      },
      {
        id: "ca-prairies",
        label: "Prairies",
        bbox: { west: -115.0, south: 48.5, east: -94.0, north: 55.5 },
      },
      {
        id: "ca-central",
        label: "Ontario & Québec",
        bbox: { west: -95.5, south: 42.5, east: -74.0, north: 51.5 },
      },
      {
        id: "ca-east",
        label: "Atlantic",
        bbox: { west: -68.5, south: 43.5, east: -52.5, north: 52.5 },
      },
    ],
  },
  {
    id: "mx",
    label: "Mexico",
    bbox: { west: -117.5, south: 14.2, east: -86.2, north: 32.9 },
    regions: [
      {
        id: "mx-baja",
        label: "Baja & Northwest",
        bbox: { west: -117.5, south: 22.5, east: -109.0, north: 32.9 },
      },
      {
        id: "mx-central",
        label: "Central & South",
        bbox: { west: -105.0, south: 14.2, east: -92.0, north: 24.5 },
      },
      {
        id: "mx-yucatan",
        label: "Gulf & Yucatán",
        bbox: { west: -98.5, south: 17.5, east: -86.2, north: 22.5 },
      },
    ],
  },
  {
    id: "br",
    label: "Brazil",
    bbox: { west: -74.2, south: -33.8, east: -34.2, north: 5.4 },
    regions: [
      {
        id: "br-amazon",
        label: "Amazon & North",
        bbox: { west: -68.0, south: -16.0, east: -44.0, north: 5.0 },
      },
      {
        id: "br-northeast",
        label: "Northeast",
        bbox: { west: -46.0, south: -18.0, east: -34.5, north: -2.0 },
      },
      {
        id: "br-south",
        label: "South & São Paulo",
        bbox: { west: -54.0, south: -33.8, east: -47.5, north: -22.0 },
      },
    ],
  },
  {
    id: "au",
    label: "Australia",
    bbox: { west: 112.5, south: -43.9, east: 153.8, north: -10.5 },
    regions: [
      {
        id: "au-east",
        label: "East Coast",
        bbox: { west: 148.0, south: -38.5, east: 153.8, north: -26.0 },
      },
      {
        id: "au-south",
        label: "South & Victoria",
        bbox: { west: 140.5, south: -39.5, east: 149.5, north: -33.5 },
      },
      {
        id: "au-west",
        label: "Western Australia",
        bbox: { west: 113.0, south: -35.5, east: 129.5, north: -22.0 },
      },
    ],
  },
  {
    id: "in",
    label: "India",
    bbox: { west: 68.0, south: 6.4, east: 97.5, north: 35.9 },
    regions: [
      {
        id: "in-north",
        label: "North & Plains",
        bbox: { west: 73.5, south: 26.0, east: 88.5, north: 35.5 },
      },
      {
        id: "in-west",
        label: "West & Deccan",
        bbox: { west: 68.0, south: 15.5, east: 78.5, north: 24.5 },
      },
      {
        id: "in-south",
        label: "South & Peninsula",
        bbox: { west: 74.0, south: 8.0, east: 82.5, north: 14.5 },
      },
    ],
  },
  {
    id: "cn",
    label: "China",
    bbox: { west: 73.3, south: 18.0, east: 134.9, north: 53.7 },
    regions: [
      {
        id: "cn-east",
        label: "East & Yangtze",
        bbox: { west: 114.0, south: 28.0, east: 123.5, north: 41.0 },
      },
      {
        id: "cn-south",
        label: "South & Pearl",
        bbox: { west: 103.0, south: 18.0, east: 118.0, north: 26.5 },
      },
      {
        id: "cn-north",
        label: "North & Northeast",
        bbox: { west: 113.5, south: 38.0, east: 126.5, north: 47.5 },
      },
    ],
  },
  {
    id: "ru",
    label: "Russia (sample extent)",
    bbox: { west: 27.0, south: 41.0, east: 170.0, north: 72.0 },
    regions: [
      {
        id: "ru-europe",
        label: "European Russia",
        bbox: { west: 27.0, south: 41.0, east: 60.0, north: 70.0 },
      },
      {
        id: "ru-siberia",
        label: "Siberia & Far East (west of 180°)",
        bbox: { west: 95.0, south: 50.0, east: 140.0, north: 72.0 },
      },
    ],
  },
  {
    id: "gb",
    label: "United Kingdom",
    bbox: { west: -10.9, south: 49.7, east: 2.1, north: 60.9 },
    regions: [
      {
        id: "gb-england",
        label: "England & Wales",
        bbox: { west: -6.0, south: 49.8, east: 2.0, north: 55.9 },
      },
      {
        id: "gb-scotland",
        label: "Scotland",
        bbox: { west: -7.5, south: 54.5, east: -0.5, north: 60.9 },
      },
    ],
  },
  {
    id: "fr",
    label: "France",
    bbox: { west: -5.4, south: 41.2, east: 9.8, north: 51.3 },
    regions: [
      {
        id: "fr-north",
        label: "North & Paris basin",
        bbox: { west: -5.0, south: 47.8, east: 5.5, north: 51.2 },
      },
      {
        id: "fr-south",
        label: "South & Mediterranean",
        bbox: { west: -2.0, south: 41.2, east: 9.5, north: 45.5 },
      },
    ],
  },
  {
    id: "de",
    label: "Germany",
    bbox: { west: 5.5, south: 47.1, east: 15.2, north: 55.2 },
    regions: [
      {
        id: "de-west",
        label: "West & Rhineland",
        bbox: { west: 5.5, south: 47.5, east: 10.5, north: 52.0 },
      },
      {
        id: "de-east",
        label: "East & Berlin area",
        bbox: { west: 10.0, south: 50.5, east: 15.0, north: 54.5 },
      },
    ],
  },
  {
    id: "jp",
    label: "Japan",
    bbox: { west: 128.8, south: 30.6, east: 145.9, north: 45.7 },
    regions: [
      {
        id: "jp-kanto",
        label: "Kantō & Tokyo",
        bbox: { west: 138.5, south: 34.8, east: 141.2, north: 36.5 },
      },
      {
        id: "jp-kyushu",
        label: "Kyūshū",
        bbox: { west: 129.0, south: 31.0, east: 132.0, north: 34.2 },
      },
      {
        id: "jp-kansai",
        label: "Kansai",
        bbox: { west: 134.8, south: 33.8, east: 136.2, north: 35.8 },
      },
    ],
  },
  {
    id: "za",
    label: "South Africa",
    bbox: { west: 16.2, south: -34.9, east: 33.0, north: -22.0 },
    regions: [
      {
        id: "za-cape",
        label: "Western Cape",
        bbox: { west: 17.5, south: -34.9, east: 23.5, north: -31.5 },
      },
      {
        id: "za-gauteng",
        label: "Gauteng & interior",
        bbox: { west: 25.5, south: -27.0, east: 31.5, north: -24.5 },
      },
    ],
  },
];

export function getMapFocusCountry(
  countryId: string,
): MapFocusCountry | undefined {
  return MAP_FOCUS_COUNTRIES.find((c) => c.id === countryId);
}

/** `regionId` empty means whole-country bbox. */
export function getMapFocusBbox(
  countryId: string,
  regionId: string,
): MapFocusBBox | null {
  if (!countryId) return null;
  const c = getMapFocusCountry(countryId);
  if (!c) return null;
  if (!regionId) return c.bbox;
  const r = c.regions.find((x) => x.id === regionId);
  return r?.bbox ?? c.bbox;
}
