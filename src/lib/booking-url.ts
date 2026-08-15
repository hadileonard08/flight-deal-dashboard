const AIRLINE_BOOKING_URLS: Record<string, string> = {
  'Alaska Airlines': 'https://www.alaskaair.com',
  'American': 'https://www.aa.com',
  'American Airlines': 'https://www.aa.com',
  'Cathay Pacific': 'https://www.cathaypacific.com',
  'Delta': 'https://www.delta.com',
  'Delta Air Lines': 'https://www.delta.com',
  'United': 'https://www.united.com',
  'United Airlines': 'https://www.united.com',
  'AC': 'https://www.aircanada.com',
  'Air Canada': 'https://www.aircanada.com',
  'Korean Air': 'https://www.koreanair.com',
  'Korean Airlines': 'https://www.koreanair.com',
  'Asiana Airlines': 'https://www.flyasiana.com',
  'JAL': 'https://www.jal.co.jp',
  'Japan Airlines': 'https://www.jal.co.jp',
  'ANA': 'https://www.ana.co.jp',
  'All Nippon Airways': 'https://www.ana.co.jp',
  'Lufthansa': 'https://www.lufthansa.com',
  'Singapore Airlines': 'https://www.singaporeair.com',
  'EVA Air': 'https://www.evaair.com',
  'Qatar Airways': 'https://www.qatarairways.com',
  'Emirates': 'https://www.emirates.com',
  'Etihad Airways': 'https://www.etihad.com',
  'Turkish Airlines': 'https://www.turkishairlines.com',
  'Hawaiian Airlines': 'https://www.hawaiianairlines.com',
  'Air France': 'https://www.airfrance.com',
  'KLM': 'https://www.klm.com',
  'British Airways': 'https://www.britishairways.com',
};

export function getBookingUrl(deal: { airline?: string; bookingUrl?: string | null; originCode: string; destinationCode: string }): string {
  const airline = (deal.airline || '').trim();
  const mapped = AIRLINE_BOOKING_URLS[airline];
  if (mapped && (!deal.bookingUrl || deal.bookingUrl.includes('seats.aero'))) {
    return mapped;
  }
  return deal.bookingUrl || `https://www.google.com/travel/flights?q=flights%20from%20${deal.originCode}%20to%20${deal.destinationCode}`;
}
