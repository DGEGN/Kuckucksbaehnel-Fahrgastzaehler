# Fahrgastzähler · Kuckucks-Bähnel

Web-App zum Zählen der Fahrgäste am Fahrkartenschalter. Läuft ohne Build-Schritt
direkt im Browser (HTML/CSS/JS), Daten liegen in Firebase Firestore und werden
**live** zwischen allen geöffneten Kassen synchronisiert.

- **Betrachter 🔍** brauchen **kein Konto** – einfach antippen und direkt die
  Sitzplatzzahlen einer Fahrt ansehen.
- **Bearbeiter** brauchen ein echtes Konto (E-Mail/Passwort), das nur mit
  einer **@eisenbahnmuseum-neustadt.de**-Adresse registriert werden kann.

## Funktionsweise

- **Start-Screen (Rollenwahl)**: Beim Öffnen der App wählt man zuerst
  **Bearbeiter** oder **Betrachter 🔍**.
  - **Betrachter** gelangen ohne jede Anmeldung direkt zur Fahrtenliste und
    sehen dort nur die drei Sitzplatzzahlen einer Fahrt groß auf einem
    eigenen Bildschirm – ohne Möglichkeit, etwas zu verändern.
  - **Bearbeiter** müssen sich mit E-Mail/Passwort anmelden oder registrieren.
    Die Registrierung ist nur mit einer **@eisenbahnmuseum-neustadt.de**-Adresse
    möglich (siehe Sicherheitshinweis unten). "Passwort vergessen?" verschickt
    einen Reset-Link per E-Mail. Ist man bereits angemeldet, merkt sich der
    Browser das (kein erneutes Einloggen bei jedem Besuch nötig) – "Abmelden"
    beendet die Sitzung. Über "‹ Andere Rolle wählen" kommt man jederzeit
    zurück zur Rollenwahl, ohne sich dabei abzumelden.
- **Fahrt beitreten**: Bereits angelegte Fahrten werden als Liste angezeigt
  und können direkt angetippt werden – ohne erneute Eingabe von Fahrtag,
  Standort oder Sitzplätzen. Öffnen mehrere Kassen dieselbe Fahrt, zählen
  sie gemeinsam in dieselbe laufende Zahl. Für eine neue Fahrt (nur als
  Bearbeiter möglich) einfach "+ Neue Fahrt anlegen" antippen, Fahrtag und
  Standort (Neustadt / Lambrecht) wählen und die Wagen antippen, die heute
  im Zug mitfahren – die Sitzplatzzahl wird automatisch aus den Wagen
  summiert (abweichende Gesamtzahl lässt sich optional manuell eintragen).
  Das freie "Kasse"-Feld (z. B. "Schalter 1") ist unabhängig vom Login und
  erlaubt es, mehrere Geräte/Schalter unter einem Bearbeiter-Konto zu
  unterscheiden.
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
  angezeigt (groß dargestellt); bei **50 %** und **75 %** Belegung
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
  Sicherheitsabfrage. (Betrachter sehen dieses Symbol nicht.)
- **Zählung dieser Fahrt zurücksetzen** setzt nur die Fahrgastzahlen auf 0
  (die Sitzplatzanzahl bleibt erhalten) – ebenfalls mit **doppelter
  Bestätigung**.

### Sicherheitshinweis zu den Rollen

Betrachter melden sich im Hintergrund automatisch **anonym** bei Firebase an
(technisch nötig, damit die Firestore-Regeln greifen) – das ist kein
sichtbares Konto und erscheint nirgends in der Bearbeiter-Verwaltung.

Bearbeiter-Rechte sind **serverseitig** an die E-Mail-Domain gekoppelt: Die
Firestore-Regeln prüfen bei jedem Schreibzugriff, ob die E-Mail-Adresse des
angemeldeten Kontos auf `@eisenbahnmuseum-neustadt.de` endet. Nur dann
werden Zählungen, neue Fahrten, Löschungen usw. akzeptiert – unabhängig
davon, was im Browser angezeigt wird. Ein Betrachter (anonymes Konto ohne
E-Mail) kann also auch dann nicht zählen, wenn jemand versucht, das im
Browser zu umgehen.

**Wichtige Einschränkung:** Die Registrierungssperre auf die Museums-Domain
ist eine Prüfung *im Browser* (freundliche Fehlermeldung) plus die
serverseitige Firestore-Regel, die verhindert, dass ein Konto mit falscher
Domain irgendetwas schreiben kann. Das *Anlegen* eines Kontos mit einer
anderen E-Mail-Adresse lässt sich mit reinen Firebase-Auth-Bordmitteln
(ohne Cloud Functions, die einen kostenpflichtigen Blaze-Tarif voraussetzen)
nicht vollständig verhindern – ein solches Konto könnte aber ohnehin nichts
in der Datenbank verändern, da die Firestore-Regel jeden Schreibversuch
ablehnt. Falls dir das noch nicht genügt (z. B. um erst gar keine
Fremd-Konten in der Firebase-Nutzerliste zu haben), wäre der nächste Schritt
eine Firebase-"Blocking Function" (Cloud Functions, Blaze-Tarif) – sag
Bescheid, falls das gewünscht ist.

## 1. Firebase einrichten (du hast bereits ein Projekt)

1. **Firestore aktivieren**: Firebase-Konsole → *Build* → *Firestore Database*
   → *Datenbank erstellen* → Produktivmodus, Region z. B. `eur3 (europe-west)`.
2. **Anmeldemethoden aktivieren**: *Build* → *Authentication* →
   *Sign-in method* → sowohl **E-Mail/Passwort** als auch **Anonymous**
   aktivieren. E-Mail/Passwort ist für Bearbeiter-Konten nötig, Anonymous
   dafür, dass Betrachter ohne eigenes Konto lesend zugreifen können.
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
   Das ist der Teil, der die Museums-Domain-Beschränkung tatsächlich
   durchsetzt – ohne diesen Schritt bleibt die Domain-Prüfung nur eine
   Anzeige im Browser.

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
   hinzufügen, sonst schlagen Anmeldung und "Passwort vergessen"-E-Mails fehl.

## Datenmodell (Firestore)

```
fahrten/{fahrtag}_{standort}          z. B. "2026-08-02_neustadt"
  fahrtag: "2026-08-02"
  standort: "neustadt" | "lambrecht"
  sitzplaetze: 80
  wagen: ["wagen1", "wagen3"]
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

Es gibt bewusst **keine** eigene `benutzer`-Collection mehr: Ob ein Konto
Bearbeiter-Rechte hat, ergibt sich allein aus seiner E-Mail-Adresse (siehe
Sicherheitshinweis oben) – das spart eine zusätzliche Firestore-Abfrage bei
jedem Login.

> Hinweis: Fahrten, die noch mit einer älteren Version der App angelegt
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

- Andere erlaubte E-Mail-Domain für Bearbeiter-Registrierungen: in `app.js`
  die Konstante `ALLOWED_EMAIL_DOMAIN` ändern **und** in `firestore.rules`
  in `istBearbeiter()` den Domainteil im `matches(...)`-Ausdruck anpassen
  (beide Stellen müssen übereinstimmen, sonst greift entweder die
  Browser-Meldung oder die eigentliche Absicherung nicht richtig).
- Anderer Familien-Standardwert: in `app.js` die Zeile
  `cardFamilie.addEventListener("click", () => addFahrgaeste("familien", 4));`
  die `4` ändern.
- Weitere Standorte: in `index.html` einen weiteren `.toggle-btn` mit
  `data-standort="..."` ergänzen, in `app.js` in `STANDORT_LABEL` eintragen
  und in `firestore.rules` bei `standort in [...]` ergänzen.
- Ein Bearbeiter-Konto sperren: in der Firebase-Konsole unter
  *Authentication → Users* das jeweilige Konto deaktivieren oder löschen.
