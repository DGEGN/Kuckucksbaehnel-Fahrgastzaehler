# Fahrgastzähler · Kuckucks-Bähnel

Web-App zum Zählen der Fahrgäste am Fahrkartenschalter. Läuft ohne Build-Schritt
direkt im Browser (HTML/CSS/JS), Daten liegen in Firebase Firestore und werden
**live** zwischen allen geöffneten Kassen synchronisiert.

## Funktionsweise

- **Rollen**: Beim Start wählst du **Bearbeiter** (zählen, Wagen zuordnen,
  Fahrten anlegen) oder **Betrachter 🔍** (sieht nur die drei
  Sitzplatzzahlen einer Fahrt groß auf einem eigenen Bildschirm, kann aber
  nichts verändern). Die Rollenwahl ist eine reine Anzeige-Umschaltung ohne
  Passwortschutz – jeder kann sie frei wählen (siehe Sicherheitshinweis
  unten).
- **Start-Screen**: Bereits angelegte Fahrten werden als Liste angezeigt und
  können direkt angetippt werden – ohne erneute Eingabe von Fahrtag,
  Standort oder Sitzplätzen. Öffnen mehrere Kassen dieselbe Fahrt, zählen
  sie gemeinsam in dieselbe laufende Zahl. Für eine neue Fahrt einfach
  "+ Neue Fahrt anlegen" antippen, Fahrtag und Standort (Neustadt /
  Lambrecht) wählen und die Wagen antippen, die heute im Zug mitfahren –
  die Sitzplatzzahl wird automatisch aus den Wagen summiert (abweichende
  Gesamtzahl lässt sich optional manuell eintragen).
- **Einzelperson** antippen → **+1**
- **Familie** antippen → **+4** Personen (ein Familienticket). Bei einer
  abweichenden Familiengröße über "abweichende Personenzahl…" einen
  eigenen Wert per Ziffernblock eingeben.
- **Gruppe**: Anzahl über **+ / −** oder den Ziffernblock einstellen, dann
  "Gruppe hinzufügen".
- **"− entfernen"** bei jeder Kategorie: falls sich jemand verzählt hat,
  öffnet sich der Ziffernblock, dort die Anzahl der zu entfernenden
  Personen eingeben. Die Menge wird automatisch auf die aktuell gezählte
  Anzahl begrenzt (kann nicht unter 0 fallen).
- Oben werden **Fahrgäste gesamt**, **Sitzplätze** und **freie Plätze** live
  angezeigt (jetzt größer dargestellt); bei **50 %** und **75 %** Belegung
  erscheint ein farbiger Warnhinweis neben der Sitzplatzzahl, bei **100 %**
  wechselt er zu **"Nur noch Stehplätze"**.
- **"Sitzplätze / Wagen nachträglich bearbeiten"**: Während der laufenden
  Zählung lässt sich die Wagen-Zusammenstellung (und damit die
  Sitzplatzzahl) noch ändern – z. B. wenn kurzfristig ein Wagen ausfällt.
  Das erfordert eine **doppelte Bestätigung**, da es sich sofort auf alle
  Kassen dieser Fahrt auswirkt.
- **Live-Aktivität** zeigt jede Zählung mit Kasse/Uhrzeit, "Letzte Aktion
  rückgängig" macht die zuletzt gespeicherte Zählung (egal von welcher
  Kasse) rückgängig.
- **Letzte Fahrten** listet die letzten 10 Fahrten (alle Standorte), mit
  CSV-Export.
- In der Liste "Fahrt beitreten" kann jede Fahrt über das Papierkorb-Symbol
  endgültig gelöscht werden (inkl. ihres Aktivitätsprotokolls) – mit
  Sicherheitsabfrage, da das nicht rückgängig gemacht werden kann.
  (Betrachter sehen dieses Symbol nicht.)
- **Zählung dieser Fahrt zurücksetzen** setzt nur die Fahrgastzahlen auf 0
  (die Sitzplatzanzahl bleibt erhalten) – ebenfalls mit **doppelter
  Bestätigung**.

### Sicherheitshinweis zu den Rollen

Die Bearbeiter/Betrachter-Auswahl ist – wie besprochen – ausschließlich eine
Anzeige-Umschaltung im Browser, **keine echte Zugriffskontrolle**. Jede
Person mit dem App-Link kann jederzeit "Bearbeiter" wählen und zählen.
Für eine echte Absicherung (z. B. verbindliche Benutzerkonten mit Login)
wäre die optionale Erweiterung um echte Firebase-Benutzerprofile
nötig – bei Bedarf gerne als nächsten Schritt umsetzen.

## 1. Firebase einrichten (du hast bereits ein Projekt)

1. **Firestore aktivieren**: Firebase-Konsole → *Build* → *Firestore Database*
   → *Datenbank erstellen* → Produktivmodus, Region z. B. `eur3 (europe-west)`.
2. **Anonyme Anmeldung aktivieren**: *Build* → *Authentication* →
   *Sign-in method* → **Anonymous** aktivieren. Die App meldet jedes
   Browser-Tab automatisch anonym an, das ist die Grundlage für die
   Sicherheitsregeln unten (schützt vor wildem Fremdzugriff, ist aber kein
   vollständiges Login-System — siehe Hinweis unten).
3. **Web-App registrieren**: *Projekteinstellungen* (Zahnrad oben links) →
   Reiter *Allgemein* → unten *"Meine Apps"* → *Web* (`</>`) → App
   registrieren (Firebase Hosting **nicht** nötig, das läuft über GitHub
   Pages).
4. Firebase zeigt dir ein `firebaseConfig`-Objekt. Kopiere die Werte in
   [`app.js`](app.js) ganz oben in das vorbereitete Objekt:

   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

5. **Sicherheitsregeln setzen**: *Firestore Database* → Reiter *Regeln* →
   Inhalt von [`firestore.rules`](firestore.rules) einfügen → *Veröffentlichen*.

## 2. Auf GitHub veröffentlichen (GitHub Pages)

1. Neues Repository auf GitHub anlegen und diesen Ordner hochladen:
   ```bash
   git init
   git add .
   git commit -m "Fahrgastzähler Kuckucks-Bähnel"
   git branch -M main
   git remote add origin https://github.com/DEIN-NUTZERNAME/DEIN-REPO.git
   git push -u origin main
   ```
2. Im Repository: *Settings* → *Pages* → unter *Build and deployment* →
   *Source*: `Deploy from a branch` → Branch `main`, Ordner `/ (root)` →
   *Save*.
3. Nach ein bis zwei Minuten ist die App unter
   `https://DEIN-NUTZERNAME.github.io/DEIN-REPO/` erreichbar.
4. **Wichtig**: In der Firebase-Konsole unter *Authentication* → *Settings* →
   *Authorized domains* die GitHub-Pages-Domain (`DEIN-NUTZERNAME.github.io`)
   hinzufügen, sonst schlägt die anonyme Anmeldung fehl.

## Sicherheitshinweis

Die `firebaseConfig`-Werte im Code sind **kein Geheimnis** (das ist bei
Firebase-Web-Apps so vorgesehen) — der eigentliche Schutz läuft über die
Firestore-Regeln. Die aktuelle Regel erlaubt jedem, der die Web-App-URL
kennt und sich anonym anmeldet, Zählungen zu schreiben. Für den Einsatz am
Schalter reicht das in der Regel aus. Falls die App-URL breiter geteilt
wird und du zusätzlichen Schutz willst:

- **Firebase App Check** aktivieren (bindet Schreibrechte an deine echte
  Web-App-Domain, verhindert Zugriffe von außerhalb der Seite).
- Oder ein einfaches Team-Passwort einbauen, das vor dem Start abgefragt
  und serverseitig (z. B. über eine Cloud Function) geprüft wird.

## Datenmodell (Firestore)

```
fahrten/{fahrtag}_{standort}          z. B. "2026-08-02_neustadt"
  fahrtag: "2026-08-02"
  standort: "neustadt" | "lambrecht"
  sitzplaetze: 80
  einzelperson: 0
  familien: 0
  gruppen: 0
  erstellt / aktualisiert: Timestamp

fahrten/{fahrtId}/ereignisse/{eventId}   Live-Protokoll je Zählung
  kategorie: "einzelperson" | "familien" | "gruppen"
  anzahl: 1 | 4 | -1 | ...
  kasse: "Schalter 1"
  zeit: Timestamp
```

> Hinweis: Fahrten, die noch mit der Vorgängerversion der App angelegt
> wurden, können zusätzlich die alten Felder `erwachsene` und `kinder`
> enthalten. Die App zählt diese weiterhin in die Gesamtsumme mit ein,
> zeigt sie aber nicht mehr als eigene Kacheln an.

## Lokal testen

Kein Build nötig — einfach mit einem simplen lokalen Server öffnen (direktes
Öffnen der `index.html` per Doppelklick funktioniert wegen `type="module"`
in manchen Browsern nicht zuverlässig):

```bash
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

`localhost` ist standardmäßig als autorisierte Domain in Firebase erlaubt.

## Wagen-Katalog anpassen (echte Wagen statt Platzhalter)

Die App liefert 4 Platzhalter-Wagen aus (Wagen 1–3, Aussichtswagen) mit
einfachen selbst gezeichneten Icons. So trägst du die echten Wagen ein:

1. In `app.js` den Abschnitt **„WAGEN-KATALOG"** suchen (ganz am Anfang der
   Datei). Dort für jeden Wagen `name` und `sitzplaetze` anpassen.
2. Für ein echtes Foto statt Icon: Bilddatei in `assets/wagen/` ablegen
   (z. B. `assets/wagen/wagen-a.jpg`) und im `bild`-Feld eintragen, z. B.
   `bild: "assets/wagen/wagen-a.jpg"`.
3. Wagen hinzufügen oder entfernen: einfach eine Zeile im `WAGEN`-Array
   ergänzen/löschen — die Anzeige und Summenberechnung passt sich
   automatisch an.

```js
const WAGEN = [
  { id: "wagen1", name: "Wagen 1", sitzplaetze: 24, bild: "assets/wagen/wagen1.svg" },
  // ... hier weitere Wagen eintragen
];
```

## Anpassen

- Anderer Familien-Standardwert: in `app.js` die Zeile
  `cardFamilie.addEventListener("click", () => addFahrgaeste("familien", 4));`
  die `4` ändern.
- Weitere Standorte: in `index.html` einen weiteren `.toggle-btn` mit
  `data-standort="..."` ergänzen, in `app.js` in `STANDORT_LABEL` eintragen
  und in `firestore.rules` bei `standort in [...]` ergänzen.
