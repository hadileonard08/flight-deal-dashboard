import { NextRequest, NextResponse } from 'next/server';
import { searchFlights } from '@/agents/travelpayouts';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const origin = searchParams.get('origin')?.toUpperCase();
  const destination = searchParams.get('destination')?.toUpperCase();
  const departureDate = searchParams.get('departureDate');
  const returnDate = searchParams.get('returnDate') || undefined;
  const cabin = (searchParams.get('cabin') || 'ECONOMY').toUpperCase();
  const adults = Math.min(Math.max(parseInt(searchParams.get('adults') || '1', 10) || 1, 1), 9);
  const children = Math.min(Math.max(parseInt(searchParams.get('children') || '0', 10) || 0, 0), 9);
  const infants = Math.min(Math.max(parseInt(searchParams.get('infants') || '0', 10) || 0, 0), 9);

  if (!origin || !destination || !departureDate) {
    return NextResponse.json({
      success: false,
      error: 'Missing required parameters: origin, destination, departureDate'
    }, { status: 400 });
  }

  const result = await searchFlights({
    origin,
    destination,
    departureDate,
    returnDate,
    cabin,
    adults,
    children,
    infants
  });

  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
