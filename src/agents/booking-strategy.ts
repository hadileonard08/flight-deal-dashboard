import { getChatModel, hasAIProvider } from '../lib/ai-provider';
import { getTransferOptions } from '../lib/transfer-partners';

export interface BookingStrategyInput {
  airline: string;
  pointsRequired: number;
  taxesAndFees: number;
  cabin: string;
  originCode: string;
  destinationCode: string;
  departureDate: string;
  bookingUrl?: string | null;
}

export async function getBookingStrategy(input: BookingStrategyInput): Promise<string> {
  if (!hasAIProvider) {
    return 'AI provider is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to generate a booking strategy.';
  }

  const model = getChatModel(0.4);
  if (!model) {
    return 'Unable to load an AI model for the booking strategy.';
  }

  const transferOptions = getTransferOptions(input.airline);
  const transferContext = transferOptions
    ? `Direct transfer options for ${input.airline} (use these exact options; do not invent others):\n${transferOptions
        .map(o => `- ${o.program}: ${o.ratio} (transfer time: ${o.time})${o.notes ? ` — ${o.notes}` : ''}`)
        .join('\n')}`
    : `No direct 1:1 transfer partners are recorded for ${input.airline} in our reference data. If this is a partner award, the user likely needs to transfer to a partner airline's program or use that airline's co-branded credit card. Be honest about this rather than inventing transfer options.`;

  const prompt = `You are an award-booking strategist. Write a concise, actionable booking strategy in Markdown for the following deal. Do not invent transfer partners, transfer times, or loyalty-program features.

Flight details:
- Airline: ${input.airline}
- Cabin: ${input.cabin}
- Points required: ${input.pointsRequired.toLocaleString()}
- Taxes/fees: $${Number(input.taxesAndFees || 0).toFixed(2)}
- Route: ${input.originCode} → ${input.destinationCode}
- Departure date: ${input.departureDate}
${input.bookingUrl ? `- Booking link: ${input.bookingUrl}` : ''}

${transferContext}

Critical instruction: before recommending any transfer, double-check that the bank/card currency is actually a direct transfer partner of the loyalty program that will book this ticket. Many awards are partner awards (e.g., an Alaska Airlines award that is actually operated by Korean Air). If the route and airline combination looks like a partner award, say so and adjust the transfer recommendation to the program that issued the award, not just the operating carrier.

Structure your response with these sections:
1. **Is this a partner award?** — Briefly state whether the airline above typically operates this route or whether the flight is likely a partner award. If it is a partner award, name the probable operating airline and the booking program.
2. **Transferable points that work** — list only the flexible point currencies (Chase UR, Amex MR, Capital One, Citi, Bilt, or none) that are direct 1:1 transfer partners of the **booking program**, with transfer times. Do not list a currency unless it is a confirmed partner.
3. **Step-by-step plan** — short, ordered instructions: (a) confirm the award is still bookable and which program it should be booked through, (b) transfer points to the correct program and note any transfer delay risk, (c) hold or book the ticket before the space disappears, (d) pay taxes/fees.
4. **Key risks/tips** — e.g., if the program does not allow holds, if transfers are not instant, or if this is a partner award that must be booked through a different program.

Keep it under 250 words. Use an encouraging but realistic tone.`;

  try {
    const res = await model.invoke(prompt);
    return typeof res.content === 'string' ? res.content : 'No booking strategy generated.';
  } catch (error) {
    console.log('Booking strategy generation failed:', (error as Error).message);
    return 'We could not generate a booking strategy right now. Try again in a moment.';
  }
}
