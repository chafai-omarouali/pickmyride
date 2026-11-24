# Testresultaten

Uitgevoerd op 23 november 2026 met `npm test` (Node 22, PostgreSQL 16): **37 van 37 geslaagd**.
De acceptatietests draaien via echte HTTP-verzoeken tegen een echte database, als de beperkte applicatierol (RLS actief).

| # | Acceptatiecriterium | Resultaat | Hoe getest |
|---|---|---|---|
| 1 | Klant plaatst op mobiel een aanvraag | ✅ | Mobiele user-agent, gastaanvraag → concept → e-maillink → open. Link is eenmalig. Plus validatietests en CSRF-weigering. |
| 2 | Beheerder keurt bedrijf goed | ✅ | 4 aanmeldingen met upload; nep-PDF geweigerd; vóór goedkeuring geen toegang (404); goedkeuren via beheer; document privé (anoniem → inlogscherm, ander bedrijf → 404); controle vastgelegd met wie en wanneer. |
| 3 | Goedgekeurd bedrijf biedt op passende aanvraag | ✅ | Aanvraag staat in de lijst, zonder persoonsgegevens. Commissie 12% op €55,00 = €6,60, uitbetaling €48,40. Tweede bod = aanpassing. Contactgegevens in toelichting geweigerd. Intrekken en opnieuw bieden. |
| 4 | Ander bedrijf ziet het bod niet | ✅ | Eigen overzicht toont alleen eigen bedragen. Directe SQL als bedrijf B: 1 rij (eigen bod). UPDATE op bod van A: 0 rijen. |
| 5 | Klant vergelijkt aanbiedingen | ✅ | 4 aanbiedingen, 1 verborgen, "Toon alle 4", sortering op prijs, "Nog geen beoordelingen", geen "beste keuze". |
| 6 | Geldig aanbod tijdelijk reserveren | ✅ | Bod `gereserveerd`, reservering 10 min. Tweede reservering op dezelfde rit → 409. |
| 7 | Geslaagde testbetaling → precies één boeking | ✅ | Terugkeerpagina alléén maakt geen boeking. Na webhook: 1 boeking, commissiesnapshot, overige biedingen `niet_gekozen`, rit `gesloten`, 2 e-mails. |
| 8 | Dubbele webhook → geen dubbele boeking | ✅ | Dezelfde melding 2×, een nieuwe melding en 5 gelijktijdige: nog steeds 1 boeking. Ongeldige handtekening → 400. |
| 9 | Verlopen bod niet te kopen | ✅ | Kiezen → 409 "verlopen". Het bod wordt niet meer getoond. |
| 10 | Gelijktijdige acties → geen dubbele toewijzing | ✅ | 2× zoveel gelijktijdige keuzes als biedingen: precies 1 reservering. 6 gelijktijdige bevestigingen: 1 boeking. |
| 11 | Alleen toegewezen bedrijf ziet volledige klantgegevens | ✅ | Winnaar ziet naam, adres en vlucht; telefoon en e-mail blijven ook voor de winnaar afgeschermd (RLS: 0 rijen in `ride_request_contact`). Verliezer: 404, en via SQL 0 rijen in `ride_request_private`. |
| 12 | Uitvoerder wijst chauffeur en voertuig toe | ✅ | "Onderweg" vóór toewijzing geweigerd. Chauffeur van een ander bedrijf geweigerd. Statussprong naar "afgerond" geweigerd. Database blokkeert prijswijziging door het bedrijf. Klant ziet "geen live GPS-tracking". |
| 13 | Annulering en testterugbetaling | ⛔ **Nog niet gebouwd** | Datamodel en demoscenario aanwezig; schermen en verwerking volgen in fase 3. |
| 14 | Geen toegang tot gegevens van andere accounts | ✅ | Kruiselings opvragen van aanvraag, boeking, betaling en aanbod → 404. Rolscheiding → 403. RLS-controle op 7 tabellen als andere klant. |
| 15 | Heen- en terugrit onafhankelijk | ✅ | Heen geboekt, terug nog open; daarna terug bij een ander bedrijf; twee aparte betalingen. |
| 16 | Beheeracties in auditlog | ✅ | Goedkeuren, schorsen, documentcontrole, instelling, commissie, boeking, inloggen, aanmelding. Tariefwijziging verandert een bestaande boeking niet. Schorsing trekt biedingen in. CSV-export. |
| 17 | Primaire knoppen werken of geven een melding | ✅ (crawl) | Alle links op alle pagina's van alle rollen bezocht: geen 404 of 500. Niet-gebouwde portaalpagina's tonen een expliciete melding. |

Extra getest: **24/7 klantenservice en vervangend vervoer**:
- "Taxi niet gekomen" kan pas na het ophaalmoment.
- Een andere klant wordt geweigerd, de klant kan geen bedrijfsreden kiezen en er kan maar één lopende melding per boeking zijn.
- Na een melding: boeking "probleem gemeld", uitbetaling geblokkeerd, spoedmail naar beheer, bevestiging aan de klant, bericht aan het bedrijf en een automatisch chatbericht.
- RLS: een ander bedrijf ziet niets.
- Beheer pakt de melding op. Het oorspronkelijke bedrijf als vervanger wordt geweigerd. Een vervanger met tijd 23:55 en € 25 voor rekening van het platform wordt vastgelegd.
- De klant ziet de naam van de vervanger en "niets extra"; het oorspronkelijke bedrijf ziet de naam niet.
- Afsluiten zonder toelichting wordt geweigerd. "Afgerond" rondt de boeking af. Een melding kan niet worden aangepast. Het auditlog bevat 4 stappen.
- Bedrijfsmelding "voertuig defect" die zonder vervanging wordt gesloten: status en uitbetaling worden teruggezet.
- Nummers: ongeldige invoer wordt geweigerd; tel:- en wa.me-links worden goed gevormd (met het boekingsnummer in het bericht); de belofte kan worden uitgezet.
- Zonder nummers buiten de demo: geen blok en geen belofte.

Daarnaast getest: **communicatie** (systeembericht bij bevestiging; klant stuurt een bericht en het bedrijf ziet "1 nieuw"; gelezen na openen; antwoord via de verversings-API; e-mailmeldingen; telefoonnummer in de chat geweigerd; ander bedrijf en andere klant geweigerd (ook via SQL); berichten onveranderbaar; bellen zonder provider geeft een duidelijke melding en een geregistreerde sessie; demo-bellen gesimuleerd en gemarkeerd; na sluiten van het venster geen berichten of gesprekken meer; beheer verbergt een bericht met reden en de inhoud verdwijnt bij beide partijen); **24-uurs tijd, koffers en kinderzitjes** (geen browser-tijdveld meer, uur- en minutenkeuze correct opgeslagen als 17:45 Amsterdamse tijd, grote en kleine koffers apart, kinderzitjes per soort, meer zitjes dan personen geweigerd, aangevinkt zonder zitje geweigerd, zonder vinkje genegeerd, bod zonder bevestiging van kinderzitjes geweigerd); **lange afstand en luchthavens** (rit Eindhoven → Eindhoven Airport herkend als luchthavenrit, valt onder landelijk, regionaal bedrijf geweigerd, landelijk bedrijf mag bieden); **beoordelingen** (niet vóór afronding, alle vijf onderdelen verplicht, score buiten 1–5 geweigerd, andere klant geweigerd, gemiddelde (5+4+4+5+3)/5 = 4,2, geen tweede beoordeling, bedrijf kan via SQL niet wijzigen, moderatie zonder reden geweigerd door server én database, inhoud ook voor beheer onveranderbaar, verborgen beoordeling telt niet mee, reden zichtbaar voor bedrijf, auditlog); mislukte betaling, betaling na verlopen reservering, SEO (titels, beschrijving, noindex op privépagina's, sitemap, CSP-header), tijdzone (winter, zomer, niet-bestaand en dubbel uur), geld in centen en commissieafronding, verwijderen van contactgegevens, statusmodel, SQL-splitsing van migraties.

Tijdens het testen gevonden en opgelost:
1. Bedrijven konden geen statusgeschiedenis schrijven (RLS te streng).
2. De lijst "Beschikbare aanvragen" was leeg door een koppeling met een afgeschermde tabel.
3. Na een verlopen of ingetrokken bod kon een bedrijf niet opnieuw bieden.
4. Een geannuleerde boeking werd groen als "geboekt" getoond.
5. Dubbele element-id's op de inlogpagina.
