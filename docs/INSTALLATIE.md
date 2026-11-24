# Installatiehandleiding

## Lokaal (ontwikkeling)
Zie README.md, "Snel starten".

## Testomgeving / productie (voorstel)
1. **Database**: beheerde PostgreSQL 15+ in de EU (bijv. Supabase EU of Neon EU). Maak twee rollen:
   - eigenaar (voor migraties): `MIGRATION_DATABASE_URL`
   - `pickmyride_app` met een sterk wachtwoord (wordt aangemaakt door migratie 002; zet het wachtwoord met `alter role pickmyride_app password '…'`): `DATABASE_URL`
2. `npm install` (installeer `pg` voor TLS-verbindingen; dat wordt automatisch gebruikt).
3. Zet de omgevingsvariabelen (zie `.env.example`): `APP_ENV=production`, `BASE_URL=https://…`, sterke `SESSION_SECRET` en `PAYMENT_WEBHOOK_SECRET`, `DEMO_MODE=false`, `TRUST_PROXY=true` achter een proxy.
4. `npm run db:migrate`. **Geen** `db:seed-demo` in productie (het script weigert dat).
5. Start met `npm start` achter een https-proxy. Er draaien achtergrondtaken (verlopen van reserveringen en biedingen, verzenden van e-mail) elke 30 seconden in het proces. Draai bij meerdere instanties de taken op één instantie, of verplaats ze naar een cronjob.
6. Maak de eerste beheerder aan:
   ```sql
   insert into pickmyride.users (email, password_hash, role, full_name, email_verified_at)
   values ('jij@domein.nl', '<hash>', 'admin', 'Naam', now());
   ```
   De hash genereer je met `npx tsx -e "import('./src/lib/security.ts').then(m=>console.log(m.hashPassword('…')))"`.
7. Controleer `/gezondheid` (geeft `ok`).
8. Back-ups instellen volgens `docs/ARCHITECTUUR.md`.

## Gescheiden omgevingen
Gebruik per omgeving (ontwikkeling / test / productie) een eigen database, eigen geheimen en eigen betaalsleutels (test vs. live). `APP_ENV` stuurt de veiligheidscontroles.

## Naar Next.js + Supabase
Zie "Stackkeuze" in ARCHITECTUUR.md. Volgorde: migraties in Supabase draaien → `app_*()`-functies koppelen aan `auth.uid()` en claims → domeinfuncties aanroepen vanuit Server Actions → pagina's als server components overnemen → documentopslag naar een privé Storage-bucket.
