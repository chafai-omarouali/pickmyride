# PickMyRide — architectuur (fase 1)

## Stackkeuze en waarom

| Onderdeel | Gekozen | Opdracht vroeg | Reden |
|---|---|---|---|
| Taal/runtime | Node.js 22 + TypeScript (via `tsx`) | Next.js + TypeScript | In de bouwomgeving konden geen pakketten worden geïnstalleerd (geen netwerk). Next.js was niet beschikbaar. |
| Database | **PostgreSQL 16** met migraties en Row Level Security | PostgreSQL / Supabase | Gelijk. Schema en policies zijn Supabase-compatibel. |
| Interface | React 19 server-side rendering + eigen CSS (lettertypen Gelasio en DM Sans, zelf gehost onder OFL-licentie, geen externe verzoeken) | Tailwind CSS | Tailwind was niet beschikbaar. De CSS volgt dezelfde ontwerpregels (zie `public/styles.css`). |
| Auth | Eigen sessies (scrypt-wachtwoorden, HttpOnly-cookies, e-maillinks) | Supabase Auth | Supabase was niet bereikbaar. Overstap beschreven hieronder. |
| Opslag documenten | Privémap op de server, nooit publiek pad | Supabase Storage (privé) | Adapter vervangbaar. |

De code is zo opgezet dat een latere overstap naar Next.js + Supabase vooral "verhuizen" is, geen herbouw:

- `db/migrations/*.sql`: draaien zo in Supabase (schema `pickmyride`).
- `src/domain/*`: alle bedrijfslogica, framework-onafhankelijk. Wordt aangeroepen vanuit Next.js Server Actions of Route Handlers.
- `src/ui/pages/*.tsx`: React-componenten, bruikbaar als Next.js server components.
- `src/lib/pg.ts`: gebruikt automatisch het pakket `pg` zodra dat geïnstalleerd is.
- RLS-context: de functies `app_user_id()`, `app_role()` en `app_company_id()` in migratie 002. In Supabase vervang je hun body door `auth.uid()` en JWT-claims; de policies blijven gelijk.

## Lagen

```
Browser ──HTTP──▶ src/server.ts (router, sessie, CSRF, rate limiting, beveiligingsheaders)
                     │
                     ▼
               src/domain/*  (aanvragen, biedingen, boekingen, bedrijven, beheer, statusmodel)
                     │  withActor(actor, tx => …)  → zet app.user_id / app.role / app.company_id per transactie
                     ▼
               PostgreSQL (rol pickmyride_app, geen superuser) ── RLS-policies + triggers + unieke indexen
                     │
               src/integrations/payments (demo | mollie)   src/integrations/geo (geen | pdok)   src/lib/notify (outbox | smtp)
```

Autorisatie werkt in twee lagen:
1. **Server**: rolcontrole per route en per domeinfunctie.
2. **Database**: RLS op alle tabellen (`force row level security`). Een bedrijf kan in SQL letterlijk geen biedingen van anderen of klantgegevens lezen. Triggers blokkeren dat een bedrijf prijs of commissie van een boeking wijzigt.

Gaat er een stap met systeemrechten (bijvoorbeeld de klant mailen nadat een bedrijf heeft geboden), dan gebeurt dat via `asSystem()` in dezelfde transactie, en alleen nadat de autorisatie van de gebruiker is gecontroleerd.

Mobiele apps kunnen later dezelfde `src/domain`-functies gebruiken via een JSON-API-laag. Er zit geen logica in de pagina's.

## Kernprocessen

**Aanvraag**: een gast plaatst een aanvraag met de status `concept`. Na een klik op de e-maillink (eenmalig, 48 uur geldig) wordt de aanvraag `open`. Op dat moment start de biedtermijn: `min(nu + biedtermijn, laatste boekingsmoment)`.

**Retour**: één `request_group` met twee `ride_requests` (heen en terug). Elke rit heeft eigen biedingen, een eigen boeking en een eigen betaling.

**Privacy**: `ride_requests` bevat alleen wat een bieder mag zien (plaats en postcode4, tijd, reizigers, opmerking zonder contactgegevens). Adressen en contactgegevens staan in `ride_request_private`. RLS geeft die alleen vrij aan de eigenaar, aan beheer en aan het bedrijf met een niet-geannuleerde boeking.

**Bieden**: of een bedrijf mag bieden, staat in één SQL-functie: `company_can_bid()` (actief, werkgebied, voertuigcategorie en capaciteit, open, biedtermijn). Die functie gebruiken zowel de RLS-policies als de lijstweergave. Per rit is er maximaal één lopend bod per bedrijf (gedeeltelijke unieke index). Commissie wordt op de server berekend en per bod vastgelegd.

**Boeken**:
1. De klant kiest een aanbod. In één transactie wordt de rit vergrendeld (`FOR UPDATE`), het bod gecontroleerd, een reservering van 10 minuten aangemaakt en een betaling gestart.
2. Een unieke index staat maximaal één gereserveerd of geaccepteerd bod per rit toe, en maximaal één actieve reservering per rit.
3. De boeking volgt **alleen** uit de webhook plus een statusopvraag bij de provider. Een webhook wordt eerst idempotent geregistreerd (`payment_events` uniek), daarna wordt de betaling vergrendeld.
4. Bij bevestigen: boekingsnummer, commissieregel als snapshot, overige biedingen op `niet_gekozen`, uitbetalingsregel aanmaken, e-mails in de wachtrij.
5. Betaalt een klant ná het verlopen van de reservering, terwijl het aanbod niet meer beschikbaar is? Dan volgt geen boeking. Er komt een terugbetaling klaar te staan en beheer wordt gewaarschuwd.

## Databaseschema (entiteiten)

`users`, `customer_profiles`, `sessions`, `access_tokens`, `companies`, `company_memberships`, `company_documents`, `service_areas` (+ postcodereeksen), `company_service_areas`, `vehicle_categories`, `company_vehicle_categories`, `vehicles`, `drivers`, `request_groups`, `ride_requests`, `ride_request_private`, `bids`, `reservations`, `bookings`, `status_history`, `payments`, `payment_events`, `refunds`, `payouts`, `reviews`, `notifications`, `support_requests`, `audit_logs`, `platform_settings`, `commission_rules`, `rate_limits`, `error_log`.

Zie `db/migrations/001_schema.sql` voor alle kolommen, checks en indexen.

## Huisstijl
Warm merkpalet (gekozen 23-11-2026, wijkt bewust af van de oorspronkelijke opdracht "donkerblauw"): espresso/donkerbruin #2A1B14–#3A2418 voor hero en voet, bruin #6B4A2E voor links, camel #A88462 alleen voor lijnen en details, zand #D5C4AE voor vlakken, antraciet #4A4A46 voor bijtekst, groen #2E6A4C uitsluitend voor primaire acties en "gelukt". Lettertypen Gelasio (koppen) en DM Sans (tekst), zelf gehost.

Daarnaast bestaat (alleen in de demo) de kleurversie "Blauw" in de logokleuren: blauw #032C58, groen #2CAE49 voor logo en accenten, en een dieper groen #1E8A3C voor knoppen, omdat witte tekst op #2CAE49 te weinig contrast heeft.

## Beoordelingen
Migratie 004: vijf scorekolommen (1–5) en `score` als gegenereerde kolom (gemiddelde). RLS: een klant mag alleen invoegen als `customer_can_review()` waar is (eigen afgeronde boeking, nog geen beoordeling); een bedrijf mag alleen lezen. De trigger `reviews_guard` maakt de inhoud onveranderbaar en eist een reden bij statuswijziging. De view `company_public` geeft gemiddelden per onderdeel over gepubliceerde beoordelingen.

## Statusmodel

Vastgelegd in `src/domain/status.ts` (welke overgang, welke rol) én als `check`-constraints in de database. Bijvoorbeeld: alleen het systeem zet een bod op `geaccepteerd`, en een bedrijf kan een boeking niet annuleren.

## Beveiliging

Wachtwoorden met scrypt. Sessietokens worden alleen als hash opgeslagen. Cookies zijn HttpOnly, SameSite=Lax en Secure bij https. CSRF-token op elk formulier. Content-Security-Policy zonder inline scripts (op één gehasht regeltje na). Rate limiting in de database op inloggen, inloglinks, aanvragen, aanmelden, contact en het kiezen van een aanbod. Uploads: maximaal 5 MB, controle op magic bytes (PDF/JPG/PNG), willekeurige opslagsleutel, alleen te downloaden met autorisatie. Auditlog en statusgeschiedenis zijn append-only (geen UPDATE-recht). Geheimen alleen via omgevingsvariabelen. De server weigert te starten zonder geldige geheimen, en in productie met demo-instellingen.

## Omgevingen

`APP_ENV` = `development` | `test` | `production`. De tests gebruiken een eigen database (`pickmyride_test`). Demodata en de demo-betaalomgeving werken niet in productie.

## Back-up en herstel (plan)

- **Database**: dagelijkse `pg_dump -Fc` met 30 dagen bewaartermijn, plus point-in-time recovery (Supabase Pro of een beheerde PostgreSQL). Maandelijks een hersteltest naar een losse omgeving.
- **Documenten**: privé-opslag met versiebeheer en replicatie (Supabase Storage, of S3 met versioning).
- **Herstelvolgorde**: database terugzetten → migraties controleren (`public.schema_migrations`) → opslag koppelen → betaalstatussen bij de provider opnieuw vergelijken met `payments`.
- **Doelen** (voorstel): RPO 24 uur (met PITR: minuten), RTO 4 uur.
