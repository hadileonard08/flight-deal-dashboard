export const AIRLINE_NAMES: Record<string, string> = {
  // North America
  AA: 'American', UA: 'United', DL: 'Delta', AS: 'Alaska Airlines', B6: 'JetBlue',
  AC: 'Air Canada', WS: 'WestJet', F9: 'Frontier', NK: 'Spirit', HA: 'Hawaiian Airlines',
  // Asia
  JL: 'JAL', NH: 'ANA', KE: 'Korean Air', OZ: 'Asiana', TG: 'Thai Airways',
  SQ: 'Singapore Airlines', CX: 'Cathay Pacific', CI: 'China Airlines', BR: 'EVA Air',
  MH: 'Malaysia Airlines', PR: 'Philippine Airlines', VN: 'Vietnam Airlines',
  CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern', HX: 'Hong Kong Airlines',
  '7C': 'Jeju Air', ZE: 'Eastar Jet', LJ: 'Jin Air', TW: 'T\'way Air', GK: 'Jetstar Japan', JX: 'Starlux Airlines',
  // Middle East / Europe
  QR: 'Qatar Airways', EK: 'Emirates', EY: 'Etihad Airways', BA: 'British Airways',
  LH: 'Lufthansa', AF: 'Air France', KL: 'KLM', VS: 'Virgin Atlantic', IB: 'Iberia',
  TP: 'TAP Air Portugal', AY: 'Finnair', OS: 'Austrian Airlines', SK: 'SAS', LX: 'Swiss',
  TK: 'Turkish Airlines', SU: 'Aeroflot', AI: 'Air India', PK: 'PIA', WY: 'Oman Air',
  // Oceania
  QF: 'Qantas', JQ: 'Jetstar', NZ: 'Air New Zealand', FJ: 'Fiji Airways',
  // Other common codes used by Seats.aero / data sources
  '2L': 'Austrian Airlines', '4Y': 'Eurowings Discover', BT: 'Air Baltic',
  DE: 'Condor', EH: 'ANA Wings'
};

export function resolveAirlineName(code: string): string {
  const trimmed = (code || '').trim();
  return AIRLINE_NAMES[trimmed] || trimmed;
}
