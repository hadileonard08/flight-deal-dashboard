interface AirlineInfo {
  name: string;
  description?: string;
}

export const AIRLINE_INFO: Record<string, AirlineInfo> = {
  // North America
  AA: { name: 'American Airlines', description: 'Major US carrier, Oneworld member' },
  UA: { name: 'United Airlines', description: 'Major US carrier, Star Alliance member' },
  DL: { name: 'Delta Air Lines', description: 'Major US carrier, SkyTeam member' },
  AS: { name: 'Alaska Airlines', description: 'US West Coast carrier, Oneworld member' },
  B6: { name: 'JetBlue', description: 'US low-cost carrier' },
  AC: { name: 'Air Canada', description: 'Canadian flag carrier, Star Alliance member' },
  WS: { name: 'WestJet', description: 'Canadian low-cost carrier' },
  F9: { name: 'Frontier Airlines', description: 'US ultra-low-cost carrier' },
  NK: { name: 'Spirit Airlines', description: 'US ultra-low-cost carrier' },
  HA: { name: 'Hawaiian Airlines', description: 'Hawaii-based carrier' },

  // Mexico / Latin America
  AM: { name: 'Aeromexico', description: 'Mexican flag carrier, SkyTeam member' },
  VB: { name: 'VivaAerobus', description: 'Mexican low-cost carrier' },
  Y4: { name: 'Volaris', description: 'Mexican ultra-low-cost carrier' },
  AV: { name: 'Avianca', description: 'Colombian flag carrier, Star Alliance member' },
  CM: { name: 'Copa Airlines', description: 'Panama-based carrier, Star Alliance member' },
  LA: { name: 'LATAM', description: 'South American airline group' },
  AR: { name: 'Aerolineas Argentinas', description: 'Argentine flag carrier, SkyTeam member' },
  G3: { name: 'GOL', description: 'Brazilian low-cost carrier' },

  // Asia
  JL: { name: 'JAL', description: 'Japanese flag carrier, Oneworld member' },
  NH: { name: 'ANA', description: 'Japanese flag carrier, Star Alliance member' },
  KE: { name: 'Korean Air', description: 'South Korean flag carrier, SkyTeam member' },
  OZ: { name: 'Asiana Airlines', description: 'South Korean carrier, Star Alliance member' },
  TG: { name: 'Thai Airways', description: 'Thai flag carrier, Star Alliance member' },
  SQ: { name: 'Singapore Airlines', description: 'Singapore flag carrier, Star Alliance member' },
  CX: { name: 'Cathay Pacific', description: 'Hong Kong flag carrier, Oneworld member' },
  CI: { name: 'China Airlines', description: 'Taiwan-based carrier, SkyTeam member' },
  BR: { name: 'EVA Air', description: 'Taiwan-based carrier, Star Alliance member' },
  MH: { name: 'Malaysia Airlines', description: 'Malaysian flag carrier, Oneworld member' },
  PR: { name: 'Philippine Airlines', description: 'Philippine flag carrier' },
  VN: { name: 'Vietnam Airlines', description: 'Vietnamese flag carrier, SkyTeam member' },
  CA: { name: 'Air China', description: 'Chinese flag carrier, Star Alliance member' },
  MU: { name: 'China Eastern', description: 'Chinese carrier, SkyTeam member' },
  CZ: { name: 'China Southern', description: 'Chinese carrier' },
  HX: { name: 'Hong Kong Airlines', description: 'Hong Kong-based carrier' },
  '7C': { name: 'Jeju Air', description: 'South Korean low-cost carrier' },
  ZE: { name: 'Eastar Jet', description: 'South Korean low-cost carrier' },
  LJ: { name: 'Jin Air', description: 'South Korean low-cost carrier' },
  TW: { name: 'T\'way Air', description: 'South Korean low-cost carrier' },
  GK: { name: 'Jetstar Japan', description: 'Japanese low-cost carrier' },
  JX: { name: 'Starlux Airlines', description: 'Taiwanese boutique carrier' },

  // Middle East / Europe
  QR: { name: 'Qatar Airways', description: 'Qatari flag carrier, Oneworld member' },
  EK: { name: 'Emirates', description: 'UAE flag carrier based in Dubai' },
  EY: { name: 'Etihad Airways', description: 'UAE flag carrier based in Abu Dhabi' },
  BA: { name: 'British Airways', description: 'UK flag carrier, Oneworld member' },
  LH: { name: 'Lufthansa', description: 'German flag carrier, Star Alliance member' },
  AF: { name: 'Air France', description: 'French flag carrier, SkyTeam member' },
  KL: { name: 'KLM', description: 'Dutch flag carrier, SkyTeam member' },
  VS: { name: 'Virgin Atlantic', description: 'British long-haul carrier' },
  IB: { name: 'Iberia', description: 'Spanish flag carrier, Oneworld member' },
  TP: { name: 'TAP Air Portugal', description: 'Portuguese flag carrier, Star Alliance member' },
  AY: { name: 'Finnair', description: 'Finnish flag carrier, Oneworld member' },
  OS: { name: 'Austrian Airlines', description: 'Austrian flag carrier, Star Alliance member' },
  SK: { name: 'SAS', description: 'Scandinavian flag carrier, Star Alliance member' },
  LX: { name: 'Swiss', description: 'Swiss flag carrier, Star Alliance member' },
  TK: { name: 'Turkish Airlines', description: 'Turkish flag carrier, Star Alliance member' },
  SU: { name: 'Aeroflot', description: 'Russian flag carrier, SkyTeam member' },
  AI: { name: 'Air India', description: 'Indian flag carrier, Star Alliance member' },
  PK: { name: 'PIA', description: 'Pakistani flag carrier' },
  WY: { name: 'Oman Air', description: 'Omani flag carrier' },

  // Oceania
  QF: { name: 'Qantas', description: 'Australian flag carrier, Oneworld member' },
  JQ: { name: 'Jetstar', description: 'Australian low-cost carrier' },
  NZ: { name: 'Air New Zealand', description: 'New Zealand flag carrier, Star Alliance member' },
  FJ: { name: 'Fiji Airways', description: 'Fijian flag carrier, Oneworld member' },

  // Other common codes used by Seats.aero / data sources
  '2L': { name: 'Austrian Airlines', description: 'Austrian flag carrier, Star Alliance member' },
  '4Y': { name: 'Eurowings Discover', description: 'Leisure airline, Lufthansa Group' },
  BT: { name: 'Air Baltic', description: 'Latvian flag carrier' },
  DE: { name: 'Condor', description: 'German leisure airline' },
  EH: { name: 'ANA Wings', description: 'Regional subsidiary of ANA' }
};

export const AIRLINE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(AIRLINE_INFO).map(([code, info]) => [code, info.name])
);

export function resolveAirlineName(code: string): string {
  return AIRLINE_INFO[(code || '').trim()]?.name || (code || '').trim();
}

export function getAirlineDescription(code: string): string | undefined {
  return AIRLINE_INFO[(code || '').trim()]?.description;
}

export function getAirlineInfo(code: string): AirlineInfo {
  return AIRLINE_INFO[(code || '').trim()] || { name: (code || '').trim() };
}
