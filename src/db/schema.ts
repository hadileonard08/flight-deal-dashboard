import { pgTable, uuid, varchar, integer, decimal, timestamp, boolean, pgEnum, text } from 'drizzle-orm/pg-core';

export const dealCategoryEnum = pgEnum('deal_category', ['GOOD_DEAL', 'MAYBE_GOOD_DEAL', 'OKAY_DEAL', 'BAD_DEAL']);
export const fareTypeEnum = pgEnum('fare_type', ['CASH', 'POINTS']);
export const cabinClassEnum = pgEnum('cabin_class', ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']);
export const regionEnum = pgEnum('origin_region', ['WEST_COAST', 'CENTRAL', 'EAST_COAST']);
export const occasionEnum = pgEnum('occasion', ['HONEYMOON', 'BUSINESS', 'LEISURE', 'FAMILY', 'FRIENDS', 'SOLO', 'OTHER']);
export const tripTypeEnum = pgEnum('trip_type', ['ONE_WAY', 'ROUND_TRIP']);

export const flights = pgTable('flights', {
  id: uuid('id').primaryKey().defaultRandom(),
  originCode: varchar('origin_code', { length: 5 }).notNull(),
  originRegion: regionEnum('origin_region').notNull(),
  destinationCode: varchar('destination_code', { length: 5 }).notNull(),
  airline: varchar('airline', { length: 100 }).notNull(),
  departureDate: timestamp('departure_date').notNull(),
  returnDate: timestamp('return_date'),
  cabin: cabinClassEnum('cabin').notNull().default('ECONOMY'),
  fareType: fareTypeEnum('fare_type').notNull().default('CASH'),
  tripType: tripTypeEnum('trip_type').notNull().default('ROUND_TRIP'),
  cashPrice: decimal('cash_price', { precision: 10, scale: 2 }),
  pointsRequired: integer('points_required'),
  taxesAndFees: decimal('taxes_and_fees', { precision: 10, scale: 2 }),
  bookingUrl: varchar('booking_url', { length: 1000 }),
  isSimulated: boolean('is_simulated').default(false).notNull(),
  scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
  // Representative cash-flight details for the modal (not the exact award itinerary)
  cashAirline: varchar('cash_airline', { length: 100 }),
  duration: integer('duration'),
  stops: integer('stops'),
  layoverAirport: varchar('layover_airport', { length: 5 }),
  layoverDuration: integer('layover_duration'),
  aircraftType: varchar('aircraft_type', { length: 100 }),
  segments: text('segments'), // JSON string of representative flight segments
});

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  flightId: uuid('flight_id').references(() => flights.id, { onDelete: 'cascade' }).notNull(),
  category: dealCategoryEnum('category').notNull(),
  reasoning: varchar('reasoning', { length: 1000 }).notNull(),
  itinerary: text('itinerary'), // Stores the LangGraph output
  occasion: occasionEnum('occasion').notNull().default('LEISURE'),
  isNotified: boolean('is_notified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
