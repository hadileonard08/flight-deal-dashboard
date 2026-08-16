export function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

export function formatNumber(n: number) {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function getDisplayPrice(deal: any): { value: number; suffix: string } {
  const tax = Number(deal.taxesAndFees || 0);
  if (deal.fareType === 'POINTS') {
    return { value: Number(deal.pointsRequired), suffix: tax > 0 ? `+ $${tax.toLocaleString()} taxes` : '' };
  }
  const cash = Number(deal.cashPrice || 0);
  return { value: Math.round(cash / 0.02), suffix: 'est. pts at 2¢/pt' };
}
