# Variantenformat

Eine Varianten-Datei referenziert genau eine Base:

```json
{
  "cardId": "beispiel",
  "baseId": "humanoid-standard",
  "palette": { "skin": "#9aa0a8" },
  "height": 1.05,
  "patchParts": [
    { "id": "@head", "scale": [1.05, 0.95, 1] }
  ],
  "addParts": [
    { "id": "rucksack", "shape": "box", "size": [0.35, 0.5, 0.2], "parent": "@back", "color": "cloth" }
  ],
  "removeParts": ["helm"]
}
```

Erlaubte Aenderungen:

- `palette`: Farbrollen der Base ueberschreiben oder ergaenzen.
- `height` und `detailLevel`: globale Darstellung anpassen.
- `patchParts`: vorhandene Teile oder Anschluesse gezielt aendern.
- `addParts`: neue Teile; `parent` darf eine Teil-ID oder einen `@`-Anschluss nennen.
- `removeParts`: Wurzel eines vollstaendig zu entfernenden Teilbaums.
- `animations`: ganze Clips ueberschreiben. Vorrang: Rig-Profil, Base, Variante.

Die standardisierten Anschluesse sind `@head`, `@leftHand`, `@rightHand`, `@back`,
`@weapon` und `@mount`. Unbekannte Basen, Teile, Eltern, Anschluesse oder Tracks
werden beim Laden als Datenfehler gemeldet.
