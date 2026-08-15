import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/flight_tracker';
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });
