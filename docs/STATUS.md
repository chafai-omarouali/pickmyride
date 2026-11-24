# Eerlijk overzicht: wat werkt en wat nog niet

Peildatum: 23 november 2026. "Werkt" betekent hier: gebouwd, aangesloten op de database en door tests gedekt.

## Volledig werkend

- **Openbare website**: home met ritformulier, Hoe werkt het?, Voor taxibedrijven, Aanmelden, FAQ (met FAQ-structured data), Contact (formulier → database), Inloggen, drie juridische pagina's als duidelijk gemarkeerde concepten, sitemap.xml en robots.txt.
- **Ritaanvraag in 4 stappen**: alle gevraagde velden, inclusief tussenstop, retour en vluchtnummer. Validatie zowel in de browser als op de server: verplichte velden, gelijke adressen, minimale voorbereidingstijd, capaciteit van het voertuig, retour na heenrit, zomer- en wintertijd. Aanvragen kan zonder account, met een veilige e-maillink.
- **Privacy**: bieders zien alleen plaats en postcode4. Contactgegevens worden automatisch uit opmerkingen verwijderd. Volledige gegevens krijgt alleen het toegewezen bedrijf, afgedwongen in de database.
- **Bedrijfsaanmelding**: alle gevraagde velden, privé documentupload (type- en groottecontrole), status "In beoordeling".
- **Beheer**: dashboard met alle gevraagde tellers, bedrijven goedkeuren, afwijzen, schorsen of heractiveren (met reden), documentcontrole (wie en wanneer), ritten- en biedingenoverzicht, instellingen (termijnen, aantal getoonde aanbiedingen enz.), nieuwe commissieregel activeren, auditlog, CSV-export.
- **Biedproces**: alleen passende aanvragen. Live berekening van klantprijs, commissie en uitbetaling, met uitleg. Bod aanpassen, intrekken en opnieuw bieden. Maximaal één lopend bod per rit. Biedingen zijn onzichtbaar voor andere bedrijven (database).
- **Vergelijken**: 3 aanbiedingen zichtbaar, "Toon alle", sorteren op prijs en op beoordeling (alleen als die er is), "Nog geen beoordelingen", geen "beste keuze"-badge.
- **Boeken**: reservering van 10 minuten (instelbaar), demo-betaling, boeking alleen na ondertekende webhook plus statusopvraag, uniek boekingsnummer, overige biedingen gesloten, e-mails naar klant en bedrijf. Bescherming tegen dubbele boekingen en gelijktijdige acties (getest).
- **Foutscenario's**: mislukte betaling (bod komt vrij), verlopen reservering, betaling na verloop (geen boeking, terugbetaling klaargezet, beheer gewaarschuwd), verlopen bod.
- **Retour**: twee onafhankelijke ritten. Ze kunnen door verschillende bedrijven worden uitgevoerd, elk met een eigen betaling.
- **Bedrijfsportaal**: dashboard, beschikbare aanvragen, mijn biedingen, gewonnen ritten en planning, chauffeur en voertuig toewijzen, operationele statussen (volgens het statusmodel), probleem melden (beheer krijgt een e-mail), chauffeurs en voertuigen, financieel overzicht, profiel en documenten.
- **Klantomgeving**: mijn aanvragen, aanbiedingen vergelijken, kiezen en betalen, boekingsdetails met statustijdlijn ("geen live GPS-tracking").
- **Beoordelingen op vijf onderdelen** (Communicatie, Klantvriendelijkheid, Comfort & hygiëne, Betrouwbaarheid, Rijgedrag & veiligheid; elk 1–5 sterren). Alleen de klant zelf, alleen na een afgeronde rit, één keer per rit. Het totaal is het gemiddelde en wordt door de database berekend. Scores en tekst zijn voor niemand aan te passen. Gemiddelden per onderdeel staan bij elk aanbod; bedrijven hebben een eigen overzicht. Beheer kan verbergen of terugzetten, alleen met reden (auditlog). Het bedrijf krijgt een e-mail bij een nieuwe beoordeling.
- **Luchthavens en lange afstanden**: keuzelijst met de vijf Nederlandse luchthavens (adressen gecontroleerd op 23-11-2026 via de luchthavenwebsites), luchthavenritten herkend op postcode of vluchtnummer, en een werkgebied "Heel Nederland (lange afstand)" voor bedrijven die door het hele land rijden. Ritten naar het buitenland zijn nog niet mogelijk (alleen Nederlandse postcodes).
- **Bagage en kinderzitjes**: de klant geeft grote en kleine koffers apart op, en optioneel kinderzitjes per soort (Maxi-Cosi, kinderstoel, verhoger; elk 0–3, samen niet meer dan het aantal personen). Bieders zien soort en aantal en moeten de kinderzitjes in hun bod bevestigen.
- **Tijden altijd 24-uurs**: tijdkeuze via uur (00–23) en minuten (per 5), onafhankelijk van de taal van het apparaat.
- **Twee kleurversies (demo)**: "Warm" (standaard: espresso, camel, zand) en "Blauw" (logokleuren: blauw #032C58 en groen #2CAE49, met het originele logo). Wisselen via de schakelaar in de demobalk of met ?thema=warm / ?thema=blauw. Buiten de demo-omgeving geldt altijd de standaardversie; na de definitieve keuze wordt de andere verwijderd.
- **Communicatie klant ↔ taxibedrijf**: chat per boeking en "Bellen via PickMyRide" met afgeschermde nummers. Alleen bij een bevestigde boeking, tot 24 uur (instelbaar) na het ophaalmoment; daarna alleen-lezen. Het taxibedrijf ziet het telefoonnummer en e-mailadres van de klant nergens meer (afgedwongen in de database). Ook: ongelezen-tellers, e-mailmelding bij een nieuw bericht (maximaal één per 10 minuten), verversen elke 10 seconden, automatische berichten bij bevestiging, toewijzing en statuswijziging, geen nummers of e-mailadressen in de chat, en beheer kan meelezen en berichten met reden verbergen (auditlog). Bellen: de structuur is klaar, met een duidelijke melding zolang er geen provider is en een gemarkeerde demo-simulatie; Twilio is voorbereid maar niet getest.
- **24/7 klantenservice en vervangend vervoer**:
  - **Melden.** De klant meldt in zijn boeking "taxi niet gekomen" (vanaf 10 minuten na het ophaalmoment; instelbaar), "te laat" of "ander probleem". Het taxibedrijf meldt zelf "kan rit niet uitvoeren" of "voertuig defect/chauffeur uitgevallen". Er kan maar één lopende melding per boeking zijn.
  - **Direct na een melding:** de boeking gaat naar "probleem gemeld" en de uitbetaling aan het oorspronkelijke bedrijf gaat vast. Er volgen een spoedmail naar beheer, een bevestiging aan de klant, een bericht aan het bedrijf en een automatisch bericht in de chat.
  - **Beheer** (Beheer → Vervangend vervoer) pakt de melding op, kiest een vervanger (een bedrijf van het platform, met passende bedrijven bovenaan en hun telefoonnummer erbij, of een externe vervoerder) en vult de verwachte aankomsttijd en eventuele extra kosten in, met wie die kosten draagt. De klant ziet daarna in de app: "Vervangend vervoer: [naam], verwachte aankomst [tijd], je betaalt niets extra". Het oorspronkelijke bedrijf ziet alleen dat het de rit niet meer hoeft te rijden.
  - **Afsluiten** kan op twee manieren: "afgerond" (de boeking wordt afgerond en de uitbetaling blijft vast) of "zonder vervanging" (de boeking keert terug naar de status van vóór de melding en de uitbetaling wordt weer vrijgegeven). Een toelichting is verplicht en alles komt in het auditlog.
  - **Klantenservicenummers** (telefoon en WhatsApp) vul je in bij Beheer → Instellingen. Ze verschijnen dan op de homepage, in "Hoe werkt het?", de veelgestelde vragen, de contactpagina, de footer en op elke boekingspagina. De WhatsApp-knop opent een gesprek met het boekingsnummer al ingevuld. **Zonder ingevuld nummer toont de live site geen klantenservice-blok en geen belofte**; in de demo staat er een duidelijke DEMO-melding.
- **Stadspagina's voor SEO**:
  - **De 50 steden.** `/taxi/[stad]` voor de 50 steden met de meeste zoekvolume op "taxi [stad]" (Google Keyword Planner, NL, 23-11-2026: van Rotterdam en Den Haag met 12.100 per maand tot Helmond met 880). Het overzicht staat op `/taxi`. Alle 50 staan in de footer van openbare pagina's en in de sitemap.
  - **Echte gegevens per pagina:**
    - afstand hemelsbreed tot alle luchthavens, met knoppen die de bestemming vooraf invullen;
    - het aantal aangesloten bedrijven dat in die postcode rijdt;
    - prijzen van geboekte ritten naar Schiphol, pas vanaf 3 boekingen;
    - een gemiddelde beoordeling, pas vanaf 3 beoordelingen;
    - vragen en antwoorden per stad;
    - links naar steden in de buurt;
    - gestructureerde gegevens (kruimelpad, dienst, veelgestelde vragen).
  - **Nog te doen voor betere rankings:** per stad een korte lokale tekst schrijven (bekende ophaalplekken, station, wijken). Die maakt de pagina's onderscheidender dan alleen de automatisch gevulde gegevens.
- **Routes, luchthavens en buitenland (SEO)**:
  - **24 routepagina's** `/taxi/[stad]/schiphol` voor elke stad met minimaal 70 zoekopdrachten per maand op "taxi [stad] schiphol". Elke pagina dekt beide richtingen.
  - **5 luchthavenpagina's** `/luchthaven/[naam]` met adres, steden in de buurt en links naar de routes. Overzicht op `/luchthavens`.
  - **10 bestemmingen in het buitenland** `/buitenland/[naam]`: Antwerpen, Düsseldorf, Düsseldorf Airport, Brussels Airport, Parijs, Gent, Brussel, Weeze Airport, Charleroi Airport en Keulen/Bonn Airport. Overzicht op `/buitenland`.
  - Alle pagina's staan in de footer en in de sitemap (102 URL's in totaal).
- **Ritten van en naar het buitenland**:
  - Het aanvraagformulier heeft een landkeuze (Nederland, België, Duitsland, Frankrijk, Luxemburg), controleert de postcode per land en kent 5 buitenlandse luchthavens met gecontroleerde adressen.
  - Eén kant van de rit ligt altijd in Nederland; de database dwingt dat af.
  - Alleen bedrijven met de instelling "rijdt ook naar het buitenland" kunnen bieden. Ze zetten die aan bij het aanmelden, of de beheerder zet hem aan of uit op de bedrijfspagina; dat komt in het auditlog.
  - Bieders zien aan de buitenlandse kant alleen de plaats en het land.
- **Uitbreiding zoekwoorden (23-11-2026)**:
  - **73 stadspagina's** (eerst 50): 23 extra plaatsen met minimaal ongeveer 500 zoekopdrachten per maand, onder andere Texel, Bergen op Zoom, Meppel, Amstelveen, Ede, Zandvoort en Hoofddorp.
  - **Themapagina's**:
    - `/wat-kost-een-taxi`: officiële maximumtarieven 2026 van de Rijksoverheid en een rekenhulp die ook zonder server werkt;
    - `/taxibus`: zet de taxibus vooraf in het formulier;
    - `/taxi-reserveren`, `/goedkope-taxi` en `/taxi-met-kinderzitje`.
  - Alles staat in de footer onder "Diensten" en in de sitemap (130 URL's).
- **Voorvertoning**: `scripts/export-static.ts` zet alle openbare pagina's om naar statische HTML, met een banner "Voorvertoning" en noindex. Met `RELATIVE=1` worden alle links relatief, voor hosting zonder routering.
- **Homepage**: hero met aanvraagformulier, "Zo werkt het", luchthavens met knoppen die de bestemming vooraf invullen, "Waarom via PickMyRide", het blok vervangend vervoer en 24/7 klantenservice, populaire steden, veelgestelde vragen en een blok voor taxibedrijven.
- **E-mailwachtrij**: ontdubbeld via dedupe-sleutel, met verzendstatus en foutregistratie.
- **Beveiliging**: zie ARCHITECTUUR.md.

## Gedeeltelijk / alleen in de datamodel- en statuslaag

| Onderdeel | Stand |
|---|---|
| Annuleren door klant + terugbetaling (acceptatiecriterium 13) | Tabellen (`refunds`, betaalstatussen), statusregels en een demoscenario zijn aanwezig. **De schermen en de verwerking via de provider zijn nog niet gebouwd. Niet getest.** |
| Wijzigingsverzoek, klacht, hulpverzoek | Tabel `support_requests` bestaat; contactformulier werkt. Formulieren per boeking volgen in fase 3. |
| Uitbetalingen aan bedrijven | Registratie en statussen aanwezig. Koppeling met de provider (Mollie Connect) volgt. |
| E-mailmeldingen "biedtermijn loopt af" en "rit binnenkort" | Sjablonen en wachtrij bestaan. De geplande taak die ze aanmaakt volgt. |
| Bedrijfsprofiel zelf bewerken, meldingsinstellingen, ondersteuning in portaal | Pagina's tonen een duidelijke melding "volgende fase" (geen dode knoppen). |
| Werkgebieden en voertuigcategorieën beheren | In de database aanpasbaar. Beheerschermen volgen. |

## Niet aangesloten (bewust)

- **Echte betaalprovider**: de Mollie-adapter is geschreven maar niet getest (geen sleutel en geen netwerk in de bouwomgeving).
- **Echte e-mailverzending**: alleen outbox. Er gaat niets de deur uit zonder jouw toestemming.
- **Adresaanvulling en routeberekening**: niet aangesloten. Dat wordt overal duidelijk gemeld en er worden geen verzonnen afstanden getoond. PDOK-adapter voorbereid.
- **Sms/WhatsApp**: geen koppeling met de WhatsApp Business API. De WhatsApp-knop is een gewone wa.me-link die WhatsApp bij de klant opent; jullie beantwoorden de berichten zelf in WhatsApp (Business). PickMyRide verstuurt zelf geen WhatsApp-berichten.
- **Ritgegevens naar de vervanger**: de klantenservice geeft die nu telefonisch door. De vervanger krijgt nog geen toegang tot de rit in zijn portaal.
- **Echte telefonie**: geen provider gekoppeld; zie INTEGRATIES.md.
- **Chat voor chauffeurs**: chauffeurs hebben nog geen eigen account; het bedrijf communiceert namens de chauffeur. Komt met de chauffeursapp.
- **Productie/hosting**: niets gepubliceerd.

## Bekende beperkingen

- De demo-betaalomgeving houdt haar "provider-zijde" in het geheugen. Na een herstart van de server zijn openstaande demo-betalingen weg (de reservering verloopt dan vanzelf).
- De minimale databaseclient (zonder `pg`-pakket) ondersteunt geen TLS. Installeer `pg` voor elke omgeving buiten je eigen computer.
- Er is geen typecheck met `tsc` uitgevoerd (React-types waren niet beschikbaar). De werking is gedekt door de tests.
