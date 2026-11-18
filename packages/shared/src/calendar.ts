export interface RetailEvent {
  id: string;
  nameAr: string;
  nameEn: string;
  month: number;
  day: number;
}

/** Public retail windows in Egypt. Dates are the start of the window. */
export const RETAIL_EVENTS: RetailEvent[] = [
  {
    id: 'ramadan',
    nameAr: 'رمضان',
    nameEn: 'Ramadan',
    month: 2,
    day: 18,
  },
  {
    id: 'mothers-day',
    nameAr: 'عيد الأم',
    nameEn: "Mother's Day",
    month: 3,
    day: 21,
  },
  {
    id: 'back-to-school',
    nameAr: 'المدارس',
    nameEn: 'Back to school',
    month: 9,
    day: 1,
  },
  {
    id: '11.11',
    nameAr: '١١/١١',
    nameEn: '11.11',
    month: 11,
    day: 11,
  },
  {
    id: 'white-friday',
    nameAr: 'وايت فرايدي',
    nameEn: 'White Friday',
    month: 11,
    day: 27,
  },
  {
    id: 'year-end',
    nameAr: 'نهاية السنة',
    nameEn: 'Year end',
    month: 12,
    day: 15,
  },
];

export interface UpcomingEvent {
  id: string;
  nameAr: string;
  nameEn: string;
  date: string;
  daysUntil: number;
}

function eventDate(event: RetailEvent, year: number): Date {
  return new Date(Date.UTC(year, event.month - 1, event.day));
}

export function upcomingEvents(now = new Date(), horizonDays = 120): UpcomingEvent[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const years = [now.getUTCFullYear(), now.getUTCFullYear() + 1];
  const found: UpcomingEvent[] = [];
  for (const year of years) {
    for (const event of RETAIL_EVENTS) {
      const at = eventDate(event, year).getTime();
      const daysUntil = Math.round((at - today) / 86400000);
      if (daysUntil < 0 || daysUntil > horizonDays) continue;
      found.push({
        id: event.id,
        nameAr: event.nameAr,
        nameEn: event.nameEn,
        date: new Date(at).toISOString().slice(0, 10),
        daysUntil,
      });
    }
  }
  return found.sort((a, b) => a.daysUntil - b.daysUntil);
}

export function nextRetailEvent(now = new Date()): UpcomingEvent | null {
  return upcomingEvents(now, 370)[0] ?? null;
}
