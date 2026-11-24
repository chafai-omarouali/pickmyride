# Openstaande juridische en fiscale beslissingen

Deze punten zijn **niet** door de software beslist. Ze moeten door een jurist en/of boekhouder worden bevestigd vóór livegang.

## Juridisch
1. **Rol van het platform**: bemiddelaar (agent) of contractpartij voor de rit? Dit bepaalt aansprakelijkheid, voorwaarden en facturatie.
2. **Merchant of record**: int het platform namens de vervoerder (Mollie Connect / Stripe Connect), of voor eigen rekening? Dit heeft gevolgen voor PSD2/betaaldiensten.
3. **Algemene voorwaarden, annuleringsvoorwaarden en privacyverklaring**: nu concepten. Ze moeten volledig worden opgesteld, inclusief bewaartermijnen.
4. **Partnerovereenkomst** met taxibedrijven: bindendheid van een bod, aansprakelijkheid, vervanging bij uitval, verzekering, betalingstermijnen.
5. **Herroepingsrecht**: geldt de uitzondering voor vervoersdiensten op een specifieke datum, en hoe communiceer je dat?
6. **Vergunningscontrole**: welke documenten zijn verplicht (taxivergunning ILT, chauffeurskaart, verzekering, KIWA-keurmerk of TX-Keur)? Hoe vaak controleren?
7. **AVG**: verwerkersovereenkomsten met taxibedrijven, de e-mailprovider, de betaalprovider en de hosting. Daarnaast een register van verwerkingen, en een DPIA indien nodig.
8. **Consumentenrecht en prijsweergave**: totaalprijs inclusief btw, en wat precies "vooraf bekende verplichte kosten" zijn.
9. **Bedrijfsgegevens van de beheerder** op de contactpagina (KvK, adres): nog in te vullen.
10. **Merknaam**: gekozen naam is "PickMyRide" (23-11-2026). Nog uitvoeren: merkonderzoek (BOIP/EUIPO), registratie van de naam en het vastleggen van domeinnamen.

11. **Chat en bellen (AVG)**: bewaartermijn van chatberichten en belgegevens vastleggen; vermelden in de privacyverklaring dat PickMyRide berichten kan inzien bij vragen of klachten; verwerkersovereenkomst met de telefonieprovider (doorgifte buiten de EER bij Twilio: SCC's of een EU-provider kiezen).

12. **Belofte vervangend vervoer**: "altijd gegarandeerd je reis vervolgen" is een harde toezegging. Leg in de algemene voorwaarden vast wat die inhoudt: binnen welke tijd, wat bij overmacht (bijv. extreem weer of afgesloten wegen), wie de extra kosten betaalt en of de klant compensatie krijgt als het toch niet lukt. Beslis ook of je extra kosten verhaalt op het taxibedrijf dat niet kwam; dat moet dan in de partnerovereenkomst staan. De tekst staat aan of uit via `replacement_guarantee` en wordt alleen getoond als er een klantenservicenummer is ingesteld.
13. **24/7 bereikbaarheid**: alleen tonen als de bezetting echt 24/7 is geregeld (rooster en achtervang). De openingstekst is aan te passen via `support_hours`.

14. **Ritten naar het buitenland**: laat in de partnerovereenkomst vastleggen dat bedrijven met de instelling "buitenland" de juiste vergunning en verzekering hebben voor grensoverschrijdend taxivervoer, en dat ze de regels van het andere land volgen (bijvoorbeeld voor ophalen op een buitenlandse luchthaven).

## Fiscaal
1. **Btw op de rit** (personenvervoer: verlaagd tarief) en **btw op de commissie** (21%): wie factureert wat aan wie?
2. **Commissiepercentage**: 12% is een demo-instelling.
3. **Facturatie**: factuur aan de klant door vervoerder of platform? Self-billing richting bedrijven?
4. **Afronding en btw-berekening in centen**: welke methode?
5. **Uitbetalingstermijn en -voorwaarden** (bijvoorbeeld na afronding van de rit, of wekelijks).

In de code gemarkeerd als: `vat_note` op boekingen, de DEMO-label op de commissie, en `[Nog vast te stellen]` in de conceptteksten.
- **Btw bij buitenlandse ritten**: voor personenvervoer geldt btw per land, naar rato van de gereden kilometers. Laat een fiscalist bepalen hoe dit op de factuur en in de commissie verwerkt wordt.
