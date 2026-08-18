// Cash price lookups now use the Travelpayouts affiliate API.
// Duffel and fast-flights-ts have been removed in favor of a free,
// search-only architecture.
export type {
  FlightDetails,
  Segment,
  FlightSearchParams
} from './travelpayouts';

export {
  prefetchCashPrices,
  getLiveCashPrice,
  getFlightDetails,
  searchFlights
} from './travelpayouts';
