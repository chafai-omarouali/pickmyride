import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { type Actor, SYSTEM, withActor, one, many, isUniqueViolation } from '../lib/db.ts';
import { hashPassword, passwordProblem } from '../lib/security.ts';
import { audit, recordStatus, getSettings } from '../lib/services.ts';
import { queueEmail } from '../lib/notify.ts';
import { config } from '../lib/config.ts';
import { HttpError, type UploadedFile } from '../lib/http.ts';

const MAX_FILE = 5 * 1024 * 1024;
const DOC_FIELDS = { doc_kvk: 'kvk_uittreksel', doc_vergunning: 'taxivergunning', doc_verzekering: 'verzekering' } as const;

export function sniffMime(buf: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

export type CompanyErrors = Record<string, string>;

export async function registerCompany(f: URLSearchParams, files: UploadedFile[], ip: string): Promise<{ errors?: CompanyErrors; companyId?: string }> {
  const g = (k: string, max = 200) => (f.get(k) || '').trim().slice(0, max);
  const e: CompanyErrors = {};
  const req = (k: string, msg: string) => { if (!g(k)) e[k] = msg; };
  req('legal_name', 'Vul de statutaire bedrijfsnaam in.'); req('trade_name', 'Vul de handelsnaam in die klanten zien.');
  req('contact_name', 'Vul de naam van de contactpersoon in.'); req('address_street', 'Vul straat en huisnummer in.'); req('address_city', 'Vul de plaats in.');
  if (!/^\d{8}$/.test(g('kvk_number'))) e.kvk_number = 'Een KvK-nummer bestaat uit 8 cijfers.';
  if (g('vat_number') && !/^NL\d{9}B\d{2}$/i.test(g('vat_number').replace(/[\s.]/g, ''))) e.vat_number = 'Vul een geldig Nederlands btw-id in (NL123456789B01) of laat het leeg.';
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(g('email'))) e.email = 'Vul een geldig e-mailadres in.';
  if (!/^(\+|00)?[0-9][0-9\s\-()]{7,18}$/.test(g('phone'))) e.phone = 'Vul een geldig telefoonnummer in.';
  if (!/^[1-9]\d{3}\s?[A-Za-z]{2}$/.test(g('address_postcode'))) e.address_postcode = 'Vul een geldige postcode in.';
  const pwErr = passwordProblem(f.get('password') || ''); if (pwErr) e.password = pwErr;
  if (f.get('password') !== f.get('password2')) e.password2 = 'De wachtwoorden komen niet overeen.';
  if (f.get('accept_agreement') !== 'ja') e.accept_agreement = 'Ga akkoord met de (concept)partnerovereenkomst.';
  const licenseExp = g('license_expires_on');
  if (licenseExp && !/^\d{4}-\d{2}-\d{2}$/.test(licenseExp)) e.license_expires_on = 'Ongeldige datum.';

  const areas = f.getAll('areas').slice(0, 20);
  if (!areas.length) e.areas = 'Kies minimaal één werkgebied.';
  const ref = await withActor(SYSTEM, async tx => ({
    areas: await many(tx, 'select id, code from service_areas where active'),
    cats: await many(tx, 'select code, name_nl, max_passengers, max_large_bags from vehicle_categories where active'),
  }));
  const areaIds = ref.areas.filter(a => areas.includes(a.code)).map(a => a.id);
  const cats: { code: string; pax: number; bags: number }[] = [];
  for (const c of ref.cats) {
    if (f.get(`cat_${c.code}`) !== 'ja') continue;
    const pax = Number(f.get(`cat_${c.code}_pax`)), bags = Number(f.get(`cat_${c.code}_bags`));
    if (!Number.isInteger(pax) || pax < 1 || pax > 20 || !Number.isInteger(bags) || bags < 0 || bags > 30) e[`cat_${c.code}`] = `Vul geldige capaciteit in voor ${c.name_nl.toLowerCase()}.`;
    else cats.push({ code: c.code, pax, bags });
  }
  if (!cats.length && !Object.keys(e).some(k => k.startsWith('cat_'))) e.categories = 'Kies minimaal één voertuigcategorie met capaciteit.';

  const docs: { type: string; file: UploadedFile; mime: string; expires: string | null }[] = [];
  for (const file of files) {
    const type = (DOC_FIELDS as Record<string, string>)[file.field];
    if (!type) continue;
    const mime = sniffMime(file.data);
    if (file.data.length > MAX_FILE) e[file.field] = 'Bestand is groter dan 5 MB.';
    else if (!mime) e[file.field] = 'Alleen PDF, JPG of PNG toegestaan.';
    else { const exp = g(`${file.field}_expires`); docs.push({ type, file, mime, expires: /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : null }); }
  }
  if (Object.keys(e).length) return { errors: e };

  const settings = await getSettings();
  try {
    return await withActor(SYSTEM, async tx => {
      const user = await one(tx, `insert into users (email, password_hash, role, full_name, phone) values ($1,$2,'company',$3,$4) returning id`,
        [g('email').toLowerCase(), hashPassword(f.get('password')!), g('contact_name'), g('phone')]);
      const c = await one(tx, `insert into companies (legal_name, trade_name, kvk_number, vat_number, contact_name, email, phone, address_street, address_postcode, address_city,
          license_number, license_expires_on, partner_agreement_version, partner_agreement_accepted_at, serves_abroad)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), $14) returning id`,
        [g('legal_name'), g('trade_name'), g('kvk_number'), g('vat_number').replace(/[\s.]/g, '').toUpperCase() || null, g('contact_name'), g('email').toLowerCase(), g('phone'),
         g('address_street'), g('address_postcode').toUpperCase(), g('address_city'), g('license_number', 60) || null, licenseExp || null, settings.partner_agreement_version, f.get('serves_abroad') === 'ja']);
      await tx.query(`insert into company_memberships (company_id, user_id, member_role) values ($1,$2,'owner')`, [c.id, user.id]);
      for (const a of areaIds) await tx.query('insert into company_service_areas values ($1,$2)', [c.id, a]);
      for (const k of cats) await tx.query('insert into company_vehicle_categories values ($1,$2,$3,$4)', [c.id, k.code, k.pax, k.bags]);
      for (const d of docs) await storeDocument(tx, c.id, user.id, d.type, d.file, d.mime, d.expires);
      await recordStatus(tx, { ...SYSTEM, ip }, 'company', c.id, null, 'in_beoordeling');
      await audit(tx, { userId: user.id, role: 'company', companyId: c.id, ip }, 'bedrijf.aangemeld', 'company', c.id, { kvk: g('kvk_number') });
      await queueEmail(tx, `bedrijf_aangemeld:${c.id}`, g('email'), 'bedrijf_aanmelding_ontvangen', 'Uw aanmelding bij PickMyRide is ontvangen',
        `Beste ${g('contact_name')},\n\nWe hebben de aanmelding van ${g('trade_name')} ontvangen. De status is "In beoordeling". ` +
        `Een beheerder controleert uw gegevens en documenten. U kunt pas bieden nadat uw bedrijf is geactiveerd.`);
      return { companyId: c.id };
    });
  } catch (err) {
    if (isUniqueViolation(err, 'users_email_uq')) return { errors: { email: 'Er bestaat al een account met dit e-mailadres. Log in of gebruik een ander adres.' } };
    if (isUniqueViolation(err, 'companies_kvk_uq')) return { errors: { kvk_number: 'Dit KvK-nummer is al aangemeld. Neem contact met ons op als dit niet klopt.' } };
    throw err;
  }
}

async function storeDocument(tx: any, companyId: string, userId: string, type: string, file: UploadedFile, mime: string, expires: string | null) {
  const key = crypto.randomUUID();
  fs.mkdirSync(config.storageDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(config.storageDir, key), file.data, { mode: 0o600 });
  await tx.query(`insert into company_documents (company_id, doc_type, storage_key, original_filename, mime_type, size_bytes, expires_on, uploaded_by)
    values ($1,$2,$3,$4,$5,$6,$7,$8)`, [companyId, type, key, file.filename, mime, file.data.length, expires, userId]);
}

/** Document ophalen: alleen beheer of het eigen bedrijf (RLS). Nooit via een publiek pad. */
export async function readDocument(actor: Actor, docId: string) {
  const doc = await withActor(actor, tx => one(tx, 'select storage_key, original_filename, mime_type from company_documents where id = $1', [docId]));
  if (!doc) throw new HttpError(404, 'Document niet gevonden.');
  const file = path.join(config.storageDir, doc.storage_key);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Bestand ontbreekt in de opslag.');
  return { data: fs.readFileSync(file), filename: doc.original_filename, mime: doc.mime_type };
}

// ───────── Beheer ─────────
function requireAdmin(actor: Actor) { if (actor.role !== 'admin') throw new HttpError(403, 'Alleen beheerders hebben toegang.'); }

export async function listCompanies(actor: Actor) {
  requireAdmin(actor);
  return withActor(actor, tx => many(tx, `select c.id, c.trade_name, c.kvk_number, c.status, c.created_at, c.is_demo,
      (select count(*) from company_documents d where d.company_id = c.id and d.verification_status = 'niet_gecontroleerd')::int as docs_open
    from companies c order by (c.status = 'in_beoordeling') desc, c.created_at desc`));
}

export async function getCompanyAdmin(actor: Actor, id: string) {
  requireAdmin(actor);
  return withActor(actor, async tx => {
    const c = await one(tx, `select c.*, u.full_name as reviewer_name from companies c left join users u on u.id = c.reviewed_by where c.id = $1`, [id]);
    if (!c) throw new HttpError(404, 'Bedrijf niet gevonden.');
    const docs = await many(tx, `select d.*, u.full_name as verifier_name from company_documents d left join users u on u.id = d.verified_by where d.company_id = $1 order by d.uploaded_at`, [id]);
    const areas = await many(tx, `select a.name from company_service_areas x join service_areas a on a.id = x.service_area_id where x.company_id = $1`, [id]);
    const cats = await many(tx, `select vc.name_nl, x.max_passengers, x.max_large_bags from company_vehicle_categories x join vehicle_categories vc on vc.code = x.category_code where x.company_id = $1`, [id]);
    const history = await many(tx, `select h.*, u.full_name from status_history h left join users u on u.id = h.actor_user_id where entity_type = 'company' and entity_id = $1 order by created_at`, [id]);
    return { company: c, docs, areas, cats, history };
  });
}

const COMPANY_TRANSITIONS: Record<string, string[]> = {
  in_beoordeling: ['actief', 'afgewezen'], actief: ['geschorst'], geschorst: ['actief'], afgewezen: ['in_beoordeling'],
};

export async function setCompanyStatus(actor: Actor, id: string, to: 'actief' | 'afgewezen' | 'geschorst' | 'in_beoordeling', note: string) {
  requireAdmin(actor);
  if (to !== 'actief' && note.trim().length < 3) throw new HttpError(400, 'Geef een reden op.');
  await withActor(actor, async tx => {
    const c = await one(tx, 'select id, status, trade_name, email from companies where id = $1 for update', [id]);
    if (!c) throw new HttpError(404, 'Bedrijf niet gevonden.');
    if (!(COMPANY_TRANSITIONS[c.status] || []).includes(to)) throw new HttpError(409, `Statuswijziging van ${c.status} naar ${to} is niet toegestaan.`);
    await tx.query('update companies set status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4, updated_at = now() where id = $1', [id, to, actor.userId, note || null]);
    await recordStatus(tx, actor, 'company', id, c.status, to, note);
    await audit(tx, actor, `bedrijf.${to}`, 'company', id, { from: c.status, note });
    if (to === 'geschorst') {
      // Lopende biedingen van een geschorst bedrijf worden ingetrokken; bestaande boekingen vragen handmatige opvolging.
      const withdrawn = await many(tx, `update bids set status = 'ingetrokken', updated_at = now() where company_id = $1 and status = 'actief' returning id`, [id]);
      for (const b of withdrawn) await recordStatus(tx, actor, 'bid', b.id, 'actief', 'ingetrokken', 'Bedrijf geschorst');
    }
    const tpl = to === 'actief' ? 'bedrijf_goedgekeurd' : 'bedrijf_afgewezen';
    if (to === 'actief' || to === 'afgewezen') await queueEmail(tx, `${tpl}:${id}:${Date.now()}`, c.email, tpl,
      to === 'actief' ? `${c.trade_name} is geactiveerd op PickMyRide` : `Uw aanmelding bij PickMyRide`,
      to === 'actief' ? `Uw bedrijf is goedgekeurd. U kunt nu passende aanvragen bekijken en bieden: ${config.baseUrl}/bedrijf`
                      : `Uw aanmelding is helaas niet goedgekeurd.\nReden: ${note}`);
  });
}

export async function verifyDocument(actor: Actor, docId: string, verdict: 'goedgekeurd' | 'afgekeurd', note: string) {
  requireAdmin(actor);
  await withActor(actor, async tx => {
    const d = await one(tx, `update company_documents set verification_status = $2, verified_by = $3, verified_at = now(), verification_note = $4
      where id = $1 returning company_id, doc_type`, [docId, verdict, actor.userId, note || null]);
    if (!d) throw new HttpError(404, 'Document niet gevonden.');
    await audit(tx, actor, `document.${verdict}`, 'company_document', docId, { company_id: d.company_id, type: d.doc_type, note });
  });
}

// ───────── Bedrijf: eigen chauffeurs en voertuigen ─────────
export async function addDriver(actor: Actor, f: URLSearchParams) {
  const name = (f.get('full_name') || '').trim().slice(0, 100), phone = (f.get('phone') || '').trim().slice(0, 30);
  if (name.length < 2 || !/^(\+|00)?[0-9][0-9\s\-()]{7,18}$/.test(phone)) throw new HttpError(400, 'Vul naam en een geldig telefoonnummer van de chauffeur in.');
  const exp = (f.get('pass_expires_on') || '').trim();
  await withActor(actor, tx => tx.query('insert into drivers (company_id, full_name, phone, driver_pass_number, pass_expires_on) values ($1,$2,$3,$4,$5)',
    [actor.companyId, name, phone, (f.get('driver_pass_number') || '').trim().slice(0, 40) || null, /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : null]));
}
export async function addVehicle(actor: Actor, f: URLSearchParams) {
  const desc = (f.get('description') || '').trim().slice(0, 100), plate = (f.get('license_plate') || '').trim().toUpperCase().slice(0, 12);
  const pax = Number(f.get('max_passengers')), cat = f.get('category_code') || '';
  if (desc.length < 2 || plate.length < 4 || !Number.isInteger(pax) || pax < 1 || pax > 20) throw new HttpError(400, 'Vul omschrijving, kenteken en aantal zitplaatsen in.');
  await withActor(actor, async tx => {
    if (!(await one(tx, 'select 1 from vehicle_categories where code = $1', [cat]))) throw new HttpError(400, 'Kies een voertuigcategorie.');
    await tx.query('insert into vehicles (company_id, category_code, description, license_plate, max_passengers) values ($1,$2,$3,$4,$5)', [actor.companyId, cat, desc, plate, pax]);
  });
}
export async function listFleet(actor: Actor) {
  return withActor(actor, async tx => ({
    drivers: await many(tx, 'select * from drivers order by active desc, full_name'),
    vehicles: await many(tx, 'select v.*, vc.name_nl from vehicles v join vehicle_categories vc on vc.code = v.category_code order by v.active desc, v.description'),
    categories: await many(tx, 'select code, name_nl from vehicle_categories where active order by sort_order'),
  }));
}
export async function getOwnCompany(actor: Actor) {
  return withActor(actor, async tx => ({
    company: await one(tx, 'select * from companies where id = $1', [actor.companyId]),
    docs: await many(tx, 'select id, doc_type, original_filename, expires_on, verification_status, verified_at, uploaded_at from company_documents order by uploaded_at'),
    areas: await many(tx, 'select a.name from company_service_areas x join service_areas a on a.id = x.service_area_id'),
    cats: await many(tx, 'select vc.name_nl, x.max_passengers, x.max_large_bags from company_vehicle_categories x join vehicle_categories vc on vc.code = x.category_code'),
  }));
}

/** Beheer: zet "rijdt ook naar het buitenland" aan of uit (auditlog). */
export async function setServesAbroad(actor: Actor, id: string, on: boolean) {
  if (actor.role !== 'admin') throw new HttpError(403, 'Alleen beheerders hebben toegang.');
  await withActor(actor, async tx => {
    const r = await one(tx, 'update companies set serves_abroad = $2, updated_at = now() where id = $1 returning id', [id, on]);
    if (!r) throw new HttpError(404, 'Bedrijf niet gevonden.');
    await audit(tx, actor, 'bedrijf.buitenland', 'company', id, { rijdt_buitenland: on });
  });
}
