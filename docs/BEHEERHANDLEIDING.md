# Beheerhandleiding

Inloggen op `/inloggen` met een beheerdersaccount. Je komt dan op `/beheer`.

## Dashboard
Tellers voor nieuwe aanvragen, aanvragen zonder aanbod, open biedingen, boekingen, komende ritten, probleemritten, annuleringen, betalingen (en betalingen die aandacht vragen), terugbetalingen, te beoordelen bedrijven en documenten die binnen 30 dagen verlopen. Oranje tegels vragen actie. CSV-exports van boekingen en aanvragen staan rechtsboven.

## Taxibedrijven beoordelen
1. Ga naar **Taxibedrijven** en open een bedrijf met de status "In beoordeling".
2. Controleer de gegevens en download elk document (alleen jij en het bedrijf kunnen dat).
3. Keur elk document goed of af, met een notitie. Je naam en het tijdstip worden vastgelegd.
4. Klik **Goedkeuren en activeren**, of **Afwijzen** met een reden. Het bedrijf krijgt een e-mail.
5. **Schorsen** (met reden) trekt alle lopende biedingen in. Bestaande boekingen blijven staan en vragen handmatige opvolging.

## Ritten en biedingen
Overzicht van alle ritten. Per rit zie je alle biedingen (met commissie) en de volledige status- en biedingsgeschiedenis.

## Vervangend vervoer (klantenservice)
Nieuwe meldingen staan op het dashboard als "Spoedmeldingen vervangend vervoer" en komen ook per e-mail binnen (onderwerp begint met SPOED).
1. Open de melding en klik **Ik pak deze melding op**. Je ziet de ritgegevens en de telefoonnummers van de klant en het bedrijf.
2. Bel een vervoerder. Passende bedrijven van het platform staan bovenaan, met hun nummer erbij. Spreek de rit af en geef de ritgegevens telefonisch door.
3. Leg de vervanger vast met de verwachte aankomsttijd en eventuele extra kosten, en kies wie die kosten draagt. De klant krijgt direct bericht in de app en per e-mail.
4. Sluit de melding na de rit af met **Afronden** en een korte toelichting. Bleek de melding onterecht (de taxi kwam toch)? Kies dan **Sluiten zonder vervanging**: de rit en de uitbetaling gaan dan terug naar normaal.

De nummers van de klantenservice (telefoon en WhatsApp), de bereikbaarheidstekst, de belofte (aan/uit) en de wachttijd voor "taxi niet gekomen" stel je in bij Instellingen.

## Beoordelingen
Onder **Beoordelingen** zie je alle beoordelingen met scores per onderdeel. Je kunt een beoordeling **verbergen** (bijvoorbeeld bij persoonsgegevens of beledigingen) of weer **publiceren**, altijd met een reden. Scores en tekst kun je niet aanpassen. Verborgen beoordelingen tellen niet mee in de gemiddelden. Het bedrijf ziet de status en de reden.

## Werkgebieden
Bedrijven kiezen bij aanmelding hun werkgebieden. Met **Heel Nederland (lange afstand)** mogen ze op elke rit in Nederland bieden. Een rit buiten de regionale gebieden valt automatisch onder dit landelijke gebied.

## Instellingen
- Minimale voorbereidingstijd (standaard 24 uur), biedtermijn, laatste boekingsmoment vóór ophalen, minimale biedtijd, reserveringsduur (10 min), aantal getoonde aanbiedingen (3), versies van de voorwaarden en de btw-toelichting.
- **Commissie**: een nieuwe regel activeren vervangt de actieve regel voor nieuwe biedingen. Bestaande biedingen en boekingen houden hun vastgelegde regel.

Elke wijziging komt in het **Auditlog**.

## Betalingen die aandacht vragen
Betaalt een klant nadat het aanbod niet meer beschikbaar was, dan wordt er geen boeking gemaakt. De betaling krijgt dan een waarschuwing en er staat een terugbetaling klaar ("Terugbetalingen open"). Het scherm om de terugbetaling uit te voeren volgt in fase 3. Tot die tijd: terugbetalen via het dashboard van de betaalprovider en noteren.

## Demo-omgeving
`/ontwikkeling/mailbox` toont alle (niet verzonden) e-mails. Dit bestaat alleen met `DEMO_MODE=true`.
