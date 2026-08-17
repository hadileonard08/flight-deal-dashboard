// Transferable points program mapping for the major flexible currencies.
// Transfer times and availability change; this table is a best-effort reference.
// The LLM should use this as a lookup and explicitly flag anything not listed.

export interface TransferOption {
  program: string;
  ratio: string;
  time: string;
  notes?: string;
}

// Map from airline name (and key aliases) to transfer options.
// Only include direct 1:1 or well-known transfer paths to the listed currencies.
export const TRANSFER_PARTNERS: Record<string, TransferOption[]> = {
  'Alaska Airlines': [
    { program: 'Bilt Rewards', ratio: '1:1', time: 'Within 24 hours', notes: 'Bilt is one of the few flexible currencies that partners with Alaska.' },
    { program: 'Marriott Bonvoy', ratio: '3:1 (5,000 bonus on 60,000)', time: '~1 business day', notes: 'Not a flexible bank point program, but a fallback.' }
  ],
  'American Airlines': [
    { program: 'Bilt Rewards', ratio: '1:1', time: 'Instant to 24 hours', notes: 'Bilt transfers to AAdvantage.' }
  ],
  'ANA': [
    { program: 'Amex Membership Rewards', ratio: '1:1', time: '48-72 hours', notes: 'Often the best Star Alliance business-class option.' }
  ],
  'Asiana': [
    { program: 'Marriott Bonvoy', ratio: '3:1 (5,000 bonus on 60,000)', time: '~1-3 business days', notes: 'No major US bank 1:1 partner; use Marriott or Star Alliance partners.' }
  ],
  'Cathay Pacific': [
    { program: 'Amex Membership Rewards', ratio: '1:1', time: 'Instant to 24 hours', notes: 'Also a Citi ThankYou and Capital One partner.' },
    { program: 'Citi ThankYou Points', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Capital One Miles', ratio: '1:1', time: 'Instant to 24 hours' }
  ],
  'Delta Air Lines': [
    { program: 'Amex Membership Rewards', ratio: '1:1', time: 'Instant', notes: 'Amex is the main US flexible partner.' }
  ],
  'Emirates': [
    { program: 'Chase Ultimate Rewards', ratio: '1:1', time: 'Instant' },
    { program: 'Amex Membership Rewards', ratio: '1:1', time: 'Instant' },
    { program: 'Citi ThankYou Points', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Capital One Miles', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Bilt Rewards', ratio: '1:1', time: 'Instant' }
  ],
  'Etihad': [
    { program: 'Amex Membership Rewards', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Citi ThankYou Points', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Capital One Miles', ratio: '1:1', time: 'Instant to 24 hours' }
  ],
  'EVA Air': [
    { program: 'Citi ThankYou Points', ratio: '1:1', time: '1-2 business days', notes: 'Also a Capital One and Marriott partner.' },
    { program: 'Capital One Miles', ratio: '1:1', time: '1-2 business days' }
  ],
  'Hawaiian Airlines': [
    { program: 'Amex Membership Rewards', ratio: '1:1', time: 'Instant' }
  ],
  'Japan Airlines': [
    { program: 'Bilt Rewards', ratio: '1:1', time: 'Instant to 24 hours', notes: 'Bilt transfers directly to JAL Mileage Bank.' },
    { program: 'Marriott Bonvoy', ratio: '3:1 (5,000 bonus on 60,000)', time: '~2 business days', notes: 'Fallback hotel-points transfer if Bilt is not an option.' }
  ],
  'Korean Air': [
    { program: 'Marriott Bonvoy', ratio: '3:1 (5,000 bonus on 60,000)', time: '1-3 business days', notes: 'Chase UR partnership ended for consumers; use Marriott or Korean Air co-branded card.' }
  ],
  'Qatar Airways': [
    { program: 'Amex Membership Rewards', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Citi ThankYou Points', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Capital One Miles', ratio: '1:1', time: 'Instant to 24 hours' }
  ],
  'Singapore Airlines': [
    { program: 'Chase Ultimate Rewards', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Amex Membership Rewards', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Citi ThankYou Points', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Capital One Miles', ratio: '1:1', time: 'Instant to 24 hours' }
  ],
  'Thai Airways': [
    { program: 'Chase Ultimate Rewards', ratio: '1:1', time: '24-48 hours' },
    { program: 'Citi ThankYou Points', ratio: '1:1', time: '24-48 hours' }
  ],
  'Turkish Airlines': [
    { program: 'Chase Ultimate Rewards', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Citi ThankYou Points', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Capital One Miles', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Bilt Rewards', ratio: '1:1', time: 'Instant' }
  ],
  'United Airlines': [
    { program: 'Chase Ultimate Rewards', ratio: '1:1', time: 'Instant' }
  ],
  'Virgin Atlantic': [
    { program: 'Chase Ultimate Rewards', ratio: '1:1', time: 'Instant' },
    { program: 'Amex Membership Rewards', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Citi ThankYou Points', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Capital One Miles', ratio: '1:1', time: 'Instant to 24 hours' },
    { program: 'Bilt Rewards', ratio: '1:1', time: 'Instant' }
  ]
};

export function getTransferOptions(airline: string): TransferOption[] | null {
  const direct = TRANSFER_PARTNERS[airline];
  if (direct) return direct;

  // Try a fuzzy match on the airline name.
  const normalized = airline.toLowerCase();
  for (const [key, options] of Object.entries(TRANSFER_PARTNERS)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return options;
    }
  }

  return null;
}
