/**
 * Nederlandse luchthavens voor snel invullen en herkenning van luchthavenritten.
 * Adressen gecontroleerd op 23-11-2026 via de websites van de luchthavens (zie docs/STATUS.md).
 * Laat de beheerder ze periodiek controleren.
 */
export interface Airport { code: string; name: string; street: string; postcode: string; city: string; pc4: number[] }

export const AIRPORTS: Airport[] = [
  { code: 'AMS', name: 'Amsterdam Airport Schiphol', street: 'Vertrekpassage 1', postcode: '1118 AP', city: 'Schiphol', pc4: [1117, 1118, 1119] },
  { code: 'EIN', name: 'Eindhoven Airport', street: 'Luchthavenweg 25', postcode: '5657 EA', city: 'Eindhoven', pc4: [5657] },
  { code: 'RTM', name: 'Rotterdam The Hague Airport', street: 'Rotterdam Airportplein 60', postcode: '3045 AP', city: 'Rotterdam', pc4: [3045] },
  { code: 'MST', name: 'Maastricht Aachen Airport', street: 'Vliegveldweg 90', postcode: '6199 AD', city: 'Maastricht-Airport', pc4: [6199] },
  { code: 'GRQ', name: 'Groningen Airport Eelde', street: 'Machlaan 14a', postcode: '9761 TK', city: 'Eelde', pc4: [9761] },
];

export const isAirportPostcode = (pc4: number) => AIRPORTS.some(a => a.pc4.includes(pc4));

/** Herkent een luchthavennaam in vrije tekst (snelformulier op de homepage). */
export function findAirport(text: string): Airport | undefined {
  const t = text.toLowerCase();
  const keys: [string, string][] = [['schiphol', 'AMS'], ['eindhoven airport', 'EIN'], ['luchthaven eindhoven', 'EIN'], ['rotterdam the hague airport', 'RTM'], ['rotterdam airport', 'RTM'],
    ['maastricht aachen', 'MST'], ['maastricht airport', 'MST'], ['eelde', 'GRQ'], ['groningen airport', 'GRQ']];
  const hit = keys.find(([k]) => t.includes(k));
  return hit ? AIRPORTS.find(a => a.code === hit[1]) : undefined;
}
