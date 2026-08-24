export function getAirlineBookingUrl(
  airline: string,
  origin: string,
  destination: string,
  departureDate: string | Date
): string {
  const date =
    typeof departureDate === 'string'
      ? departureDate.split('T')[0]
      : departureDate.toISOString().split('T')[0];

  const name = airline.toLowerCase();

  // Best-effort direct booking links. Award booking deep-links vary by program,
  // so we use the airline's search page when the format is known, otherwise the homepage.
  if (name.includes('alaska')) {
    return `https://www.alaskaair.com/search?O=${origin}&D=${destination}&DD=${date}&AW=1&TT=1&CA=1&UP=0&AS=1&NA=0`;
  }
  if (name.includes('american')) {
    return `https://www.aa.com/booking/search?origin=${origin}&destination=${destination}&departure=${date}&cabin=ECONOMY&tripType=ONE_WAY&adults=1`;
  }
  if (name.includes('delta')) {
    return `https://www.delta.com/booking/search?origin=${origin}&destination=${destination}&departure=${date}&cabin=ECONOMY&tripType=ONE_WAY&adults=1`;
  }
  if (name.includes('united')) {
    return `https://www.united.com/en/us/fsr/choose?origin=${origin}&destination=${destination}&departure=${date}&cabin=ECONOMY&tripType=ONE_WAY&adults=1`;
  }
  if (name.includes('qatar')) {
    return `https://www.qatarairways.com/en-us/booking.html?origin=${origin}&destination=${destination}&departure=${date}&cabin=ECONOMY&tripType=ONE_WAY&adults=1`;
  }
  if (name.includes('air france') || name.includes('klm')) {
    return `https://www.airfrance.com/en-us/booking?origin=${origin}&destination=${destination}&departure=${date}&cabin=ECONOMY&tripType=ONE_WAY&adults=1`;
  }
  if (name.includes('british')) {
    return `https://www.britishairways.com/travel/fx/public/en-us?from=${origin}&to=${destination}&departure=${date}&cabin=ECONOMY&tripType=ONE_WAY&adults=1`;
  }
  if (name.includes('singapore')) {
    return `https://www.singaporeair.com/en_UK/us/booking/bookflight/?origin=${origin}&destination=${destination}&departure=${date}&cabin=ECONOMY&tripType=ONE_WAY&adults=1`;
  }
  if (name.includes('cathay')) {
    return `https://www.cathaypacific.com/cx/en_US/booking.html?origin=${origin}&destination=${destination}&departure=${date}&cabin=ECONOMY&tripType=ONE_WAY&adults=1`;
  }
  if (name.includes('hawaiian')) {
    return `https://www.hawaiianairlines.com/book/flight?origin=${origin}&destination=${destination}&departure=${date}`;
  }
  if (name.includes('jetblue')) {
    return `https://www.jetblue.com/booking/flights?from=${origin}&to=${destination}&depart=${date}`;
  }
  if (name.includes('southwest')) {
    return `https://www.southwest.com/air/booking/select.html?originationAirportCode=${origin}&destinationAirportCode=${destination}&departureDate=${date}`;
  }
  if (name.includes('japan airlines') || name.includes('jal')) {
    return `https://www.jal.co.jp/ar/en/`;
  }
  if (name.includes('ana') || name.includes('all nippon')) {
    return `https://www.ana.co.jp/en/us/`;
  }
  if (name.includes('korean')) {
    return `https://www.koreanair.com/booking/booking-gate?origin=${origin}&destination=${destination}&departureDate=${date}`;
  }
  if (name.includes('emirates')) {
    return `https://www.emirates.com/booking/english/ibe/aoa/availability/roundTrip.aspx?origin=${origin}&destination=${destination}&departure=${date}`;
  }
  if (name.includes('etihad')) {
    return `https://www.etihad.com/en-us/booking?origin=${origin}&destination=${destination}&departure=${date}`;
  }
  if (name.includes('turkish')) {
    return `https://www.turkishairlines.com/en-us/flights/booking/?origin=${origin}&destination=${destination}&departure=${date}`;
  }
  if (name.includes('lufthansa')) {
    return `https://www.lufthansa.com/xx/en/flight-search?origin=${origin}&destination=${destination}&departure=${date}`;
  }
  if (name.includes('swiss')) {
    return `https://www.swiss.com/xx/en/flight-search?origin=${origin}&destination=${destination}&departure=${date}`;
  }
  if (name.includes('air canada')) {
    return `https://www.aircanada.com/booking/availability?origin=${origin}&destination=${destination}&departureDate=${date}`;
  }

  // Fallback to Seats.aero award search for the route/date.
  return `https://www.seats.aero/search?origin=${origin}&destination=${destination}&date=${date}`;
}
