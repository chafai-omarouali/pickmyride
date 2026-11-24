# Externe integraties en benodigde sleutels

| Integratie | Status | Nodig | Variabelen |
|---|---|---|---|
| Betalingen: demo | ✅ Werkt (alleen niet-productie) | – | `PAYMENT_PROVIDER=demo`, `PAYMENT_WEBHOOK_SECRET` |
| Betalingen: Mollie | Adapter geschreven, **niet getest** | Mollie-account + test-API-sleutel; voor platformbetalingen Mollie Connect (OAuth-app, profiel per bedrijf, application fees) | `PAYMENT_PROVIDER=mollie`, `MOLLIE_API_KEY=test_…` |
| Uitbetalingen aan bedrijven | Alleen registratie | Mollie Connect (of Stripe Connect) onboarding per bedrijf | – |
| E-mail | Outbox (niets verzonden) | Transactionele mailprovider (bijv. Postmark, Brevo, Amazon SES) + SPF/DKIM/DMARC op het domein | `MAIL_MODE=smtp` + nog toe te voegen providervariabelen |
| Adresaanvulling | Niet aangesloten; PDOK-adapter voorbereid | Geen sleutel (PDOK Locatieserver is gratis) | `GEO_PROVIDER=pdok` |
| Route-afstand en reistijd | Niet aangesloten | Google Routes API of OpenRouteService (API-sleutel) | nog toe te voegen |
| Database/auth/opslag (Supabase) | Optioneel, voorbereid | Supabase-project (EU-regio) | `DATABASE_URL`, `MIGRATION_DATABASE_URL` |
| Bellen (afgeschermd) | Structuur klaar; provider 'geen' (standaard) en 'demo' werken; Twilio-koppeling geschreven maar **niet getest** | Twilio-account, Nederlands nummer (vereist adresbewijs/regelgeving), statuswebhook `{BASE_URL}/api/webhooks/telefonie` | `CALL_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `CALL_PLATFORM_NUMBER` |
| WhatsApp klantenservice | wa.me-link naar jullie WhatsApp(-Business)-nummer; er wordt niets via een API verstuurd | Alleen een nummer bij Beheer → Instellingen | – |
| Sms / WhatsApp Business API | Niet gebouwd | Later: bijv. Bird of Twilio, voor automatische berichten | – |

## Webhook-URL
`{BASE_URL}/api/webhooks/betalingen`. Moet publiek bereikbaar zijn via https. Bij Mollie wordt na elke melding de status opnieuw opgehaald via de API. De melding zelf geldt nooit als bewijs.

## Afgeschermd bellen: werking
1. Klant of bedrijf tikt op "Bellen via PickMyRide".
2. De provider belt eerst de beller op zijn eigen nummer, met het platformnummer als afzender.
3. Bij opnemen hoort de beller "U wordt doorverbonden via PickMyRide" en wordt doorverbonden met de ander, ook met het platformnummer als afzender.
4. Geen opname (`record="do-not-record"`). Statusmeldingen worden met de Twilio-handtekening (HMAC-SHA1) gecontroleerd.

Alternatieven voor Twilio: Vonage, Bird (voorheen MessageBird), Plivo. De koppeling zit in `src/integrations/calls/index.ts`.

## Veiligheidsregels
- Live betaalsleutels worden geweigerd zonder `ALLOW_LIVE_PAYMENTS=true`. Zet dat alleen na expliciete toestemming.
- In productie weigert de server te starten met `DEMO_MODE=true` of `PAYMENT_PROVIDER=demo`.
