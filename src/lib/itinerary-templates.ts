import { AIRPORT_NAMES } from './config';

// Deterministic "Flight & Arrival Details" summary built from real deal data - always
// accurate and always present, regardless of whether/how the AI itinerary generation succeeds.
export function formatFlightDetailsSection(flight: any): string {
  const originName = AIRPORT_NAMES[flight.originCode] || flight.originCode;
  const destName = AIRPORT_NAMES[flight.destinationCode] || flight.destinationCode;
  const dateStr = new Date(flight.departureDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
  });
  const cabinLabel = (flight.cabin || '').replace('_', ' ');
  const investment = flight.fareType === 'POINTS'
    ? `${Number(flight.pointsRequired).toLocaleString()} Points${flight.taxesAndFees ? ` + $${Number(flight.taxesAndFees).toLocaleString()} taxes/fees` : ''} per traveler`
    : `$${Number(flight.cashPrice).toLocaleString()} per traveler`;

  return `## ✈️ Flight & Arrival Details

- **Route:** ${originName} (${flight.originCode}) to ${destName} (${flight.destinationCode})
- **Date:** ${dateStr}
- **Airline & Cabin:** ${flight.airline} ${cabinLabel}
- **Investment:** ${investment}
- **Reality Check:** This is the actual booked cabin and airline. The itinerary does **not** include any upgrades, partner-airline re-routing, or premium-cabin services unless they are part of this exact booking.

`;
}

// Renders a real, web-searched current news/happenings section
export function formatNewsSection(news: string | null): string {
  if (!news) return '';
  return `\n\n## 📰 What's Happening During Your Trip\n${news}\n`;
}
// Generate occasion-specific itineraries
export function generateOccasionItinerary(flight: any, occasion: string, news: string | null = null, weatherForecast: string | null = null): string {
  const destination = flight.destinationCode;
  const origin = flight.originCode;
  const cabin = flight.cabin || 'ECONOMY';

  // Use a less luxury template for economy cabins
  if (cabin === 'ECONOMY' && (occasion === 'HONEYMOON' || occasion === 'BUSINESS')) {
    occasion = 'LEISURE';
  }

  let weatherSection = '';
  if (weatherForecast) {
    weatherSection = `\n\n## 🌤️ Weather Outlook\n\n${weatherForecast}`;
  }
  
  const itineraries: Record<string, string> = {
    'HONEYMOON': `# 💕 Luxury Honeymoon Itinerary: ${origin} → ${destination}

## ✈️ **Day 1: Arrival & Romance**
- **Morning**: Arrive at ${destination} International Airport
- **Transfer**: Private luxury car transfer to 5-star honeymoon suite
- **Afternoon**: Check-in with champagne welcome and rose petals
- **Evening**: Sunset dinner at rooftop restaurant with panoramic views
- **Night**: Romantic couples spa treatment

## 🏛️ **Day 2: Cultural Exploration**
- **Morning**: Private guided tour for couples
- **Lunch**: Intimate dining at hidden gem restaurant
- **Afternoon: Couples spa day with massage and treatments
- **Evening**: Evening performance or cultural show
- **Night**: Stroll through illuminated historic district hand-in-hand

## 🎯 **Day 3: Adventure & Romance**
- **Early Morning**: Sunrise hot air balloon ride for two
- **Breakfast**: Champagne breakfast with views
- **Midday**: Private beach or mountain retreat experience
- **Afternoon**: Professional couples photography session
- **Evening**: Private sunset cruise or romantic beach dinner
- **Night**: Stargazing experience at private observatory

## 🍽️ **Day 4: Culinary Experience**
- **Morning**: Private cooking class with renowned local chef
- **Lunch**: Market tour and street food for two
- **Afternoon**: Wine or tea tasting at local vineyard
- **Evening**: Fine dining experience at Michelin-starred restaurant
- **Night**: Night market exploration together

## 🛍️ **Day 5: Departure**
- **Morning**: Sunrise yoga or meditation session for two
- **Mid-morning**: Luxury shopping at premium boutiques
- **Lunch**: Farewell lunch at favorite discovered spot
- **Afternoon**: Final spa treatment or leisure time
- **Evening**: Transfer to airport for departure`,

    'BUSINESS': `# 💼 Business Trip Itinerary: ${origin} → ${destination}

## ✈️ **Day 1: Arrival & Business Setup**
- **Morning**: Arrive at ${destination} International Airport
- **Transfer**: Business class car service to business hotel
- **Afternoon**: Check-in at executive suite with workspace
- **Evening**: Business dinner with local contacts
- **Night**: Review itinerary and adjust for meetings

## 🏛️ **Day 2: Business Meetings**
- **Morning**: Breakfast at hotel business center
- **Mid-morning**: Corporate meetings or site visits
- **Lunch**: Business lunch with local partners
- **Afternoon**: Conference calls or client presentations
- **Evening**: Networking event or business dinner
- **Night**: Work session at hotel business center

## 🎯 **Day 3: Industry Exploration**
- **Morning**: Visit local business district or financial center
- **Mid-morning**: Industry-specific tours or factory visits
- **Lunch**: Meeting with local industry experts
- **Afternoon**: Trade show or conference attendance
- **Evening**: Business mixer or cocktail reception
- **Night**: Informal dinner with local business contacts

## 🍽️ **Day 4: Corporate Entertainment**
- **Morning**: Executive breakfast meeting
- **Mid-morning: Golf or other business entertainment
- **Lunch**: Power lunch at top business restaurant
- **Afternoon**: VIP experiences or exclusive tours
- **Evening**: Fine dining at renowned restaurant
- **Night**: Business entertainment or cultural performance

## 🛍️ **Day 5: Departure**
- **Morning**: Final business meetings or follow-up calls
- **Mid-morning**: Last-minute shopping for gifts
- **Lunch**: Business lunch with key contacts
- **Afternoon**: Pack and checkout with express service
- **Evening**: Transfer to airport for return flight`,

    'LEISURE': `# 🎉 Leisure Travel Itinerary: ${origin} → ${destination}

## ✈️ **Day 1: Arrival & Exploration**
- **Morning**: Arrive at ${destination} International Airport
- **Transfer**: Public transport or taxi to accommodation
- **Afternoon**: Check-in and neighborhood exploration
- **Evening**: Dinner at local restaurant to try regional cuisine
- **Night**: Evening walk to get oriented with the area

## 🏛️ **Day 2: Sightseeing**
- **Morning**: Visit major tourist attractions and landmarks
- **Lunch**: Local street food or casual restaurant
- **Afternoon**: Museum visit or cultural site
- **Evening**: Sunset viewpoint or scenic area
- **Night**: Night market or entertainment district

## 🎯 **Day 3: Adventure Activities**
- **Morning**: Day trip to nearby attraction or nature area
- **Mid-morning**: Outdoor activity like hiking or boat tour
- **Lunch**: Picnic lunch or local café
- **Afternoon**: Cultural workshop or class (cooking, crafts)
- **Evening**: Evening entertainment or show
- **Night**: Bar hopping or nightlife experience

## 🍽️ **Day 4: Local Experiences**
- **Morning**: Local market visit and food tour
- **Mid-morning: Hidden gems and off-the-beaten-path spots
- **Lunch**: Recommended local favorites
- **Afternoon**: Relaxation time at park or café
- **Evening**: Dinner at popular local restaurant
- **Night**: Evening entertainment or cultural show

## 🛍️ **Day 5: Departure**
- **Morning**: Last-minute souvenir shopping
- **Mid-morning**: Visit any missed attractions
- **Lunch**: Easy meal before flight
- **Afternoon**: Return to accommodation and pack
- **Evening**: Transfer to airport for departure`,

    'FAMILY': `# 👨‍👩‍👧‍👦 Family Trip Itinerary: ${origin} → ${destination}

## ✈️ **Day 1: Family Arrival**
- **Morning**: Arrive at ${destination} International Airport
- **Transfer**: Family-friendly transport to accommodation
- **Afternoon**: Check-in and neighborhood orientation
- **Evening**: Early dinner to adjust to time zone
- **Night**: Rest and early bedtime for kids

## 🏛️ **Day 2: Family-Friendly Sights**
- **Morning**: Visit family-friendly attractions (parks, zoos)
- **Lunch**: Family restaurant with kid-friendly options
- **Afternoon: Interactive museums or activity centers
- **Evening: Sunset dinner with good views
- **Night**: Early evening walk and bedtime routine

## 🎯 **Day 3: Fun Activities**
- **Morning**: Theme park or family entertainment center
- **Mid-morning: Outdoor activities suitable for all ages
- **Lunch**: Casual family dining
- **Afternoon**: Beach or pool time if available
- **Evening**: Family-friendly show or entertainment
- **Night**: Light evening activity and rest

## 🍽️ **Day 4: Cultural Learning**
- **Morning**: Educational tour or cultural site
- **Mid-morning: Interactive workshops for kids
- **Lunch**: Local cuisine experience
- **Afternoon**: Shopping for family souvenirs
- **Evening**: Family dinner at local restaurant
- **Night**: Packing and early bedtime

## 🛍️ **Day 5: Family Departure**
- **Morning**: Last-minute sightseeing or shopping
- **Mid-morning**: Hotel checkout and transportation
- **Lunch**: Easy meal before flight
- **Afternoon**: Transfer to airport
- **Evening**: Board flight home`,

    'FRIENDS': `# 👫 Group Trip Itinerary: ${origin} → ${destination}

## ✈️ **Day 1: Group Arrival**
- **Morning**: Arrive at ${destination} International Airport
- **Transfer**: Group transport to accommodation
- **Afternoon**: Check-in and group meeting
- **Evening**: Welcome dinner and drinks together
- **Night**: Explore nightlife as a group

## 🏛️ **Day 2: Group Activities**
- **Morning**: Group breakfast and planning session
- **Mid-morning: Visit major attractions together
- **Lunch**: Group lunch at popular restaurant
- **Afternoon**: Group activity or experience
- **Evening**: Happy hour or group dinner
- **Night**: Nightlife exploration as a group

## 🎯 **Day 3: Adventure Together**
- **Morning**: Day trip or excursion as group
- **Mid-morning**: Outdoor activity or adventure
- **Lunch**: Group picnic or restaurant meal
- **Afternoon**: Free time for individual or small group activities
- **Evening**: Group dinner or entertainment
- **Night**: Nightlife or group activity

## 🍽️ **Day 4: Social Experiences**
- **Morning**: Group breakfast and hangout time
- **Mid-morning**: Shopping or local markets
- **Lunch**: Group lunch at recommended spot
- **Afternoon**: Relaxation or spa time
- **Evening**: Special dinner or celebration
- **Night**: Nightlife or entertainment

## 🛍️ **Day 5: Group Departure**
- **Morning**: Final group breakfast and photos
- **Mid-morning**: Last-minute shopping or activities
- **Lunch**: Group farewell meal
- **Afternoon**: Checkout and group transport
- **Evening**: Airport departure`,

    'SOLO': `# 🧳 Solo Travel Itinerary: ${origin} → ${destination}

## ✈️ **Day 1: Solo Arrival**
- **Morning**: Arrive at ${destination} International Airport
- **Transfer**: Public transport to accommodation
- **Afternoon**: Check-in and solo exploration
- **Evening**: Dinner at local restaurant (solo-friendly)
- **Night**: Evening walk to get oriented

## 🏛️ **Day 2: Independent Exploration**
- **Morning**: Self-guided tour of major attractions
- **Lunch**: Solo dining at local café or restaurant
- **Afternoon**: Museum visit or cultural site
- **Evening**: Sunset viewpoint or scenic area
- **Night**: Night market or entertainment

## 🎯 **Day 3: Personal Growth**
- **Morning**: Activity of personal interest (workshop, class)
- **Mid-morning**: Solo adventure or outdoor activity
- **Lunch**: Local cuisine experience
- **Afternoon**: Relaxation and reflection time
- **Evening**: Cultural show or entertainment
- **Night**: Nightlife or quiet evening

## 🍽️ **Day 4: Local Immersion**
- **Morning**: Local market visit and food tour
- **Mid-morning**: Hidden gems and local secrets
- **Lunch**: Recommended local favorites
- **Afternoon**: Relaxation at café or park
- **Evening**: Dinner at popular local spot
- **Night**: Evening exploration or cultural show

## 🛍️ **Day 5: Solo Departure**
- **Morning**: Last-minute sightseeing or shopping
- **Mid-morning**: Pack and checkout
- **Lunch**: Final meal at favorite spot
- **Afternoon**: Transfer to airport
- **Evening**: Flight home`,

    'OTHER': `# 🎯 Custom Trip Itinerary: ${origin} → ${destination}

## ✈️ **Day 1: Arrival**
- **Morning**: Arrive at ${destination} International Airport
- **Transfer**: Transport to accommodation
- **Afternoon**: Check-in and area orientation
- **Evening**: Dinner at local restaurant
- **Night**: Rest and adjustment

## 🏛️ **Day 2: Exploration**
- **Morning**: Visit main attractions and landmarks
- **Lunch**: Local cuisine experience
- **Afternoon**: Cultural or recreational activities
- **Evening**: Entertainment or scenic spots
- **Night**: Evening activities

## 🎯 **Day 3: Activities**
- **Morning**: Planned activities based on interests
- **Lunch**: Dining at recommended spots
- **Afternoon**: Free time or additional exploration
- **Evening**: Dinner and evening entertainment
- **Night**: Evening activities

## 🍽️ **Day 4: Experiences**
- **Morning**: Local markets or shopping
- **Lunch**: Local food experiences
- **Afternoon**: Cultural or recreational activities
- **Evening**: Dinner at notable restaurant
- **Night**: Evening entertainment

## 🛍️ **Day 5: Departure**
- **Morning**: Final activities and packing
- **Mid-morning**: Checkout and transfer
- **Lunch**: Final meal
- **Afternoon**: Airport transfer
- **Evening**: Departure`
  };
  
  const baseItinerary = (itineraries[occasion] || itineraries['LEISURE']) + formatNewsSection(news) + weatherSection;

  const realityNote = `\n\n---\n\n*Reality Check: You are booked in **${cabin}** on **${flight.airline}**. This itinerary is planned to match that cabin tier — no upgrades, no partner-airline re-routing, and no premium-cabin services are included unless explicitly in your booking.*`;

  return baseItinerary + realityNote;
}
export function getRandomOccasion(): string {
  const occasions = ['HONEYMOON', 'BUSINESS', 'LEISURE', 'FAMILY', 'FRIENDS', 'SOLO', 'OTHER'];
  return occasions[Math.floor(Math.random() * occasions.length)];
}
