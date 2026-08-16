const VISA_ADVISORIES: Record<string, string> = {
  HND: '**Japan:** US passport holders can enter Japan visa-free for short-term tourism or business stays of up to 90 days. Your passport must be valid for the duration of your stay, and you should have a return or onward ticket.',
  NRT: '**Japan:** US passport holders can enter Japan visa-free for short-term tourism or business stays of up to 90 days. Your passport must be valid for the duration of your stay, and you should have a return or onward ticket.',
  HKG: '**Hong Kong:** US passport holders can visit Hong Kong visa-free for up to 90 days. Your passport must be valid for at least one month beyond your intended stay.',
  ICN: '**South Korea:** US passport holders can enter South Korea visa-free for stays of up to 90 days. Your passport must be valid for the duration of your stay.',
  SIN: '**Singapore:** US passport holders can enter Singapore visa-free for up to 90 days. Your passport must be valid for at least 6 months beyond your date of entry, and you may need to show proof of onward travel.',
  BKK: '**Thailand:** US passport holders can enter Thailand visa-free for up to 60 days (as of 2024-2025). Your passport must be valid for at least 6 months beyond your entry date, and you may be asked for proof of onward travel.',
};

export function getVisaAdvisory(destinationCode: string): string {
  return VISA_ADVISORIES[destinationCode] || '**Visa & Immigration Advisory:** US passport holders should check current entry requirements with the destination country\'s official embassy or State Department guidance before traveling. Requirements can change, so verify passport validity and any visa/ETA rules at least 30 days before departure.';
}

export function ensureVisaSection(itinerary: string, destinationCode: string): string {
  if (/^#{1,3}\s.*visa/i.test(itinerary) || /visa/i.test(itinerary)) {
    return itinerary;
  }
  const advisory = getVisaAdvisory(destinationCode);
  const lines = itinerary.split('\n');
  const insertIndex = lines.findIndex(line => /^#{1,2}\s*(Flight|Arrival|Weather|Reality|Day\s*1)/i.test(line));
  if (insertIndex >= 0) {
    lines.splice(insertIndex, 0, '## Visa & Immigration Advisory', '', advisory, '');
    return lines.join('\n');
  }
  return `## Visa & Immigration Advisory\n\n${advisory}\n\n${itinerary}`;
}
