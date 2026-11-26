/**
 * Foto's van taxibedrijven. Het bedrijf beheert ze zelf; klanten zien ze bij de aanbiedingen.
 * Opslag in de database (bytea, via base64 zodat het met beide databasedrivers werkt).
 */
import { type Actor, SYSTEM, withActor, one, many } from '../lib/db.ts';
import { audit } from '../lib/services.ts';
import { asSystem } from './context.ts';
import { HttpError, type UploadedFile } from '../lib/http.ts';

export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
type ImgMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** Herken het bestandstype aan de inhoud (niet aan de naam of wat de browser zegt). */
export function sniffImage(b: Buffer): ImgMime | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Breedte en hoogte uitlezen (voor een nette weergave zonder verspringen). */
export function imageSize(b: Buffer, mime: ImgMime): { w: number; h: number } | null {
  try {
    if (mime === 'image/png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (mime === 'image/webp') {
      const kind = b.subarray(12, 16).toString('latin1');
      if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (kind === 'VP8L') { const n = b.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
      if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      return null;
    }
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  } catch { /* onleesbaar: dan zonder afmetingen */ }
  return null;
}

function requireCompany(actor: Actor) { if (actor.role !== 'company' || !actor.companyId) throw new HttpError(403, 'Alleen voor taxibedrijven.'); }

export async function listOwnPhotos(actor: Actor) {
  requireCompany(actor);
  return withActor(actor, async tx => ({
    photos: await many(tx, `select id, caption, width, height, size_bytes, hidden_by_staff, hidden_reason, created_at from company_photos
      where company_id = $1 order by sort_order, created_at`, [actor.companyId]),
    company: await one(tx, 'select trade_name, status from companies where id = $1', [actor.companyId]),
  }));
}

/** Foto's toevoegen. Geeft per bestand een foutmelding terug als iets niet klopt; de rest wordt opgeslagen. */
export async function addPhotos(actor: Actor, files: UploadedFile[]): Promise<{ added: number; errors: string[] }> {
  requireCompany(actor);
  const errors: string[] = [];
  const valid: { data: Buffer; mime: ImgMime; size: { w: number; h: number } | null }[] = [];
  for (const f of files.filter(f => f.field === 'photos')) {
    const mime = sniffImage(f.data);
    if (!mime) { errors.push(`${f.filename}: alleen JPG, PNG of WebP.`); continue; }
    if (f.data.length > MAX_PHOTO_BYTES) { errors.push(`${f.filename}: groter dan 4 MB.`); continue; }
    const size = imageSize(f.data, mime);
    if (size && (size.w < 400 || size.h < 300)) { errors.push(`${f.filename}: te klein (minimaal 400 × 300 pixels).`); continue; }
    valid.push({ data: f.data, mime, size });
  }
  if (!valid.length && !errors.length) errors.push('Kies een of meer foto\'s.');
  let added = 0;
  if (valid.length) await withActor(actor, async tx => {
    const { n, next } = await one(tx, 'select count(*)::int as n, coalesce(max(sort_order), 0) + 1 as next from company_photos where company_id = $1', [actor.companyId]);
    const room = Math.max(0, MAX_PHOTOS - n);
    if (valid.length > room) errors.push(room ? `Er ${room === 1 ? 'past nog 1 foto' : `passen nog ${room} foto's`} bij. De overige zijn niet opgeslagen.` : `U heeft al ${MAX_PHOTOS} foto's. Verwijder er eerst een.`);
    for (const [i, p] of valid.slice(0, room).entries()) {
      const r = await one(tx, `insert into company_photos (company_id, data, mime_type, size_bytes, width, height, sort_order, uploaded_by)
        values ($1, decode($2, 'base64'), $3, $4, $5, $6, $7, $8) returning id`,
        [actor.companyId, p.data.toString('base64'), p.mime, p.data.length, p.size?.w ?? null, p.size?.h ?? null, next + i, actor.userId]);
      await asSystem(tx, actor, () => audit(tx, actor, 'foto.toegevoegd', 'company_photo', r.id, { bytes: p.data.length }));
      added++;
    }
  });
  return { added, errors };
}

export async function updatePhotoCaption(actor: Actor, id: string, caption: string) {
  requireCompany(actor);
  await withActor(actor, async tx => {
    const r = await one(tx, 'update company_photos set caption = $2 where id = $1 and company_id = $3 returning id', [id, caption.trim().slice(0, 120) || null, actor.companyId]);
    if (!r) throw new HttpError(404, 'Foto niet gevonden.');
  });
}

/** Foto vooraan zetten: de eerste foto is wat klanten als eerste zien. */
export async function makePhotoFirst(actor: Actor, id: string) {
  requireCompany(actor);
  await withActor(actor, async tx => {
    const r = await one(tx, `update company_photos set sort_order = (select coalesce(min(sort_order), 0) - 1 from company_photos where company_id = $2)
      where id = $1 and company_id = $2 returning id`, [id, actor.companyId]);
    if (!r) throw new HttpError(404, 'Foto niet gevonden.');
  });
}

export async function deletePhoto(actor: Actor, id: string) {
  requireCompany(actor);
  await withActor(actor, async tx => {
    const r = await one(tx, 'delete from company_photos where id = $1 and company_id = $2 returning id', [id, actor.companyId]);
    if (!r) throw new HttpError(404, 'Foto niet gevonden.');
    await asSystem(tx, actor, () => audit(tx, actor, 'foto.verwijderd', 'company_photo', id, {}));
  });
}

/** Beheer: foto verbergen of weer tonen. */
export async function setPhotoHidden(actor: Actor, id: string, hidden: boolean, reason: string) {
  if (actor.role !== 'admin') throw new HttpError(403, 'Alleen beheerders hebben toegang.');
  return withActor(actor, async tx => {
    const r = await one(tx, 'update company_photos set hidden_by_staff = $2, hidden_reason = $3 where id = $1 returning company_id',
      [id, hidden, hidden ? (reason.trim().slice(0, 300) || null) : null]);
    if (!r) throw new HttpError(404, 'Foto niet gevonden.');
    await audit(tx, actor, hidden ? 'foto.verborgen' : 'foto.zichtbaar', 'company_photo', id, { reden: reason || null });
    return r.company_id as string;
  });
}

export async function listCompanyPhotosAdmin(actor: Actor, companyId: string) {
  if (actor.role !== 'admin') throw new HttpError(403, 'Alleen beheerders hebben toegang.');
  return withActor(actor, tx => many(tx, `select id, caption, width, height, hidden_by_staff, hidden_reason, created_at from company_photos
    where company_id = $1 order by sort_order, created_at`, [companyId]));
}

/** Publieke foto's (zonder afbeeldingsdata) voor een reeks bedrijven, gegroepeerd per bedrijf. */
export async function publicPhotosFor(tx: any, companyIds: string[]): Promise<Record<string, any[]>> {
  const ids = [...new Set(companyIds)];
  if (!ids.length) return {};
  const rows = await many(tx, `select id, company_id, caption, width, height from company_photo_public
    where company_id = any($1::uuid[]) order by sort_order, created_at`, [`{${ids.join(',')}}`]);
  const out: Record<string, any[]> = {};
  for (const r of rows) (out[r.company_id] ||= []).push(r);
  return out;
}

/**
 * Afbeelding ophalen. Publiek: alleen van actieve bedrijven en niet verborgen.
 * Het eigen bedrijf en beheer zien ook hun nog niet zichtbare foto's.
 */
export async function readPhoto(actor: Actor | null, id: string): Promise<{ data: Buffer; mime: string; isPublic: boolean }> {
  const pub = await withActor(SYSTEM, tx => one(tx, `select encode(data, 'base64') as b64, mime_type from company_photo_public where id = $1`, [id]));
  if (pub) return { data: Buffer.from(pub.b64, 'base64'), mime: pub.mime_type, isPublic: true };
  if (actor && (actor.role === 'company' || actor.role === 'admin')) {
    const own = await withActor(actor, tx => one(tx, `select encode(data, 'base64') as b64, mime_type from company_photos where id = $1`, [id]));
    if (own) return { data: Buffer.from(own.b64, 'base64'), mime: own.mime_type, isPublic: false };
  }
  throw new HttpError(404, 'Foto niet gevonden.');
}
