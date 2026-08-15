// Multiple Agent 1 scraper integrations
import { scrapeFlightDeals } from './agent1-scraper';
import { scrapeFlightDealsFromWeb } from './web-scraper';
import { scrapeRealFlightDeals } from './real-web-scraper';
import { scrapeGoogleFlights } from './google-flights-scraper';
import { processFlights } from './agent2-evaluator';

export async function runPipeline() {
  console.log('🚀 Starting Deal Pipeline...');

  // Try multiple scraping methods in order of preference
  let scrapedFlights: any[] = [];

  // Method 1: Try Seats.aero API (most reliable)
  console.log('📡 Attempting Seats.aero API...');
  try {
    scrapedFlights = await scrapeFlightDeals();
    if (scrapedFlights.length > 0) {
      console.log(`✅ API method found ${scrapedFlights.length} deals`);
    }
  } catch (error) {
    console.log('❌ API method failed, trying real web scraping...');
  }

  // Method 2: Try Google Flights scraping (no API key needed)
  if (scrapedFlights.length === 0) {
    console.log('🔍 Attempting Google Flights scraping...');
    try {
      scrapedFlights = await scrapeGoogleFlights();
      if (scrapedFlights.length > 0) {
        console.log(`✅ Google Flights scraping found ${scrapedFlights.length} deals`);
      }
    } catch (error) {
      console.log('❌ Google Flights scraping failed, trying real web scraping...');
    }
  }

  // Method 3: Try real web scraping (actual HTTP requests)
  if (scrapedFlights.length === 0) {
    console.log('🌐 Attempting real web scraping...');
    try {
      scrapedFlights = await scrapeRealFlightDeals();
      if (scrapedFlights.length > 0) {
        console.log(`✅ Real web scraping found ${scrapedFlights.length} deals`);
      }
    } catch (error) {
      console.log('❌ Real web scraping failed, trying simulated scraping...');
    }
  }

  // Method 4: Fallback to simulated web scraping
  if (scrapedFlights.length === 0) {
    console.log('🎲 Attempting simulated web scraping...');
    try {
      scrapedFlights = await scrapeFlightDealsFromWeb();
      if (scrapedFlights.length > 0) {
        console.log(`✅ Simulated scraping found ${scrapedFlights.length} deals`);
      }
    } catch (error) {
      console.log('❌ All scraping methods failed');
    }
  }

  console.log(`📊 Total: ${scrapedFlights.length} flight deals to process`);

  await processFlights(scrapedFlights);
  console.log('✅ Pipeline finished.');

  return { totalScraped: scrapedFlights.length };
}
