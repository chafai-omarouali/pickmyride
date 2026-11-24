/** Kinderzitjes per soort. Gewicht- en leeftijdsindicaties zijn globaal (ECE R44-groepen); het taxibedrijf bevestigt geschiktheid. */
export const SEAT_TYPES = [
  ['seat_maxicosi', 'Maxi-Cosi', 'Babyzitje, tot ca. 13 kg (ongeveer 0–15 maanden)'],
  ['seat_kinderstoel', 'Kinderstoel', 'Ca. 9–18 kg (ongeveer 1–4 jaar)'],
  ['seat_verhoger', 'Verhoger', 'Zittingverhoger, ca. 15–36 kg (ongeveer 4–12 jaar)'],
] as const;
export type SeatKey = typeof SEAT_TYPES[number][0];

export const seatTotal = (r: Record<string, any>) => SEAT_TYPES.reduce((s, [k]) => s + Number(r[k] || 0), 0);

/** "1 Maxi-Cosi, 2 verhogers" of '' als er geen kinderzitjes zijn. */
export function describeSeats(r: Record<string, any>): string {
  const plural: Record<string, string> = { 'Maxi-Cosi': "Maxi-Cosi's", Kinderstoel: 'kinderstoelen', Verhoger: 'verhogers' };
  return SEAT_TYPES.filter(([k]) => Number(r[k]) > 0)
    .map(([k, name]) => `${r[k]} ${Number(r[k]) === 1 ? (name === 'Maxi-Cosi' ? name : name.toLowerCase()) : plural[name]}`).join(', ');
}
