export function styleItineraryImages(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
    const style = 'max-width:100%;height:auto;max-height:320px;display:block;border-radius:8px;margin:12px 0;';
    const styleMatch = attrs.match(/style="([^"]*)"/i);
    if (styleMatch) {
      const existing = styleMatch[1];
      return match.replace(styleMatch[0], `style="${existing}${existing.endsWith(';') ? '' : ';'} ${style}"`);
    }
    return `<img${attrs} style="${style}" />`;
  });
}

export function formatPriceForEmail(deal: any): string {
  if (deal.fareType === 'POINTS') {
    return `${Number(deal.pointsRequired).toLocaleString()} points${deal.taxesAndFees ? ` + $${Number(deal.taxesAndFees).toLocaleString()} taxes` : ''}`;
  }
  return `$${Number(deal.cashPrice).toLocaleString()}`;
}

export function formatDateForEmail(date: Date | string | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}
