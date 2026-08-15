import { db } from '../db';
import { deals, flights } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function notifyDiscord() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl || webhookUrl.includes('your_webhook_id')) {
    console.log('⚠️ Discord webhook not configured. Skipping notifications.');
    // Mark all as notified to avoid retrying
    await db.update(deals).set({ isNotified: true }).where(eq(deals.isNotified, false));
    return;
  }

  const unnotifiedDeals = await db.select({
    deal: deals,
    flight: flights
  }).from(deals)
  .innerJoin(flights, eq(deals.flightId, flights.id))
  .where(eq(deals.isNotified, false));

  for (const record of unnotifiedDeals) {
    const embed = {
      embeds: [{
        title: record.deal.category === 'GOOD_DEAL' ? '🚨 HONEYMOON DEAL DETECTED!' : '👀 MAYBE GOOD DEAL',
        color: record.deal.category === 'GOOD_DEAL' ? 0x00FF00 : 0xFFFF00,
        fields: [
          { name: '✈️ Route', value: `${record.flight.originCode} ➔ ${record.flight.destinationCode}`, inline: true },
          { name: '💺 Points', value: `${record.flight.pointsRequired} Miles`, inline: true },
          { name: '💡 AI Analysis', value: record.deal.reasoning }
        ],
        description: record.deal.itinerary ? `**Generated Itinerary Draft Attached in Dashboard**` : ''
      }]
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embed)
      });
    } catch (error) {
      console.log('Failed to send Discord notification:', error);
    }

    await db.update(deals).set({ isNotified: true }).where(eq(deals.id, record.deal.id));
  }
}
