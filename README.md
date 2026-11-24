# PickMyRide

Platform voor vooraf geboekte taxiritten in Nederland, met nadruk op luchthavenvervoer en lange afstanden. Klanten plaatsen een rit, goedgekeurde taxibedrijven doen een gesloten bod, en de klant kiest en betaalt. Pas na een bevestigde betaling is de rit geboekt.

Status: **fase 1 + eerste werkende klantreis** (zie `docs/STATUS.md`).

## Snel starten (lokaal)

Vereist: Node.js 22+, PostgreSQL 15+.

```bash
npm install                      # react, react-dom, tsx (+ optioneel pg)
cp .env.example .env             # vul SESSION_SECRET en PAYMENT_WEBHOOK_SECRET in
npm run db:local                 # alleen als je geen eigen PostgreSQL hebt: start er een op poort 5433
npm run db:migrate               # schema, beveiliging (RLS) en standaardinstellingen
npm run db:seed-demo             # optioneel: duidelijk fictieve demodata
set -a; . ./.env; set +a; npm run dev
```

Open http://localhost:3000.

**Demo-accounts** (na `db:seed-demo`). Wachtwoord voor alle accounts: `Demo-wachtwoord-2026`

| Rol | E-mail |
|---|---|
| Beheerder | beheer@demo.pickmyride.test |
| Actief taxibedrijf | noord@demo.pickmyride.test, airport@demo.pickmyride.test |
| Bedrijf in beoordeling | utrecht@demo.pickmyride.test |
| Klant | klant.een@demo.pickmyride.test, klant.twee@demo.pickmyride.test |

In de demo-omgeving (`DEMO_MODE=true`) worden e-mails niet verzonden. Je vindt ze onder **/ontwikkeling/mailbox**, inclusief de inloglinks voor gasten. Betalingen lopen via een duidelijk gemarkeerde DEMO-betaalomgeving met ondertekende webhooks.

## Testen

```bash
npm run db:local       # testdatabase pickmyride_test op poort 5433
npm test               # 28 tests: unit + acceptatiecriteria tegen echte PostgreSQL
```

## Documentatie

- `docs/ARCHITECTUUR.md`: architectuur, schema, beveiliging, back-upplan
- `docs/INSTALLATIE.md`: installatie en livegang
- `docs/BEHEERHANDLEIDING.md`: voor de platformbeheerder
- `docs/INTEGRATIES.md`: benodigde API-sleutels en wat nog aangesloten moet worden
- `docs/BESLISSINGEN.md`: openstaande juridische en fiscale beslissingen
- `docs/TESTRESULTATEN.md`: resultaten per acceptatiecriterium
- `docs/STATUS.md`: wat volledig werkt en wat nog niet
- `docs/screenshots/`: schermafbeeldingen (mobiel en desktop)
