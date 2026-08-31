# Fahrgastzähler · Kuckucks-Bähnel

Web-App zum Zählen der Fahrgäste am Fahrkartenschalter. Läuft ohne Build-Schritt
direkt im Browser (HTML/CSS/JS), Daten liegen in Firebase Firestore und werden
**live** zwischen allen geöffneten Kassen synchronisiert.

- **Betrachter 🔍** brauchen **kein Konto** – einfach antippen und direkt die
  Sitzplatzzahlen einer Fahrt ansehen.
- **Bearbeiter** brauchen ein echtes Konto (E-Mail/Passwort) mit einer
  **@eisenbahnmuseum-neustadt.de**-Adresse **und** müssen von einem Admin
  im Admin-Bereich der App freigeschaltet werden, bevor sie zählen können.

## Funktionsweise

- **Design umschalten**: Unten rechts sitzt ein kleiner Button ("🚉 Modernes
  Design" / "🎫 Klassisches Design"), der jederzeit zwischen zwei kompletten
  Optiken wechselt: dem klassischen Fahrkarten-Design und einem modernen
  "Bahnhofstafel"-Design (dunkle Zahlen-Anzeigen im Fallblatt-Look). Die Wahl
  wird im Browser gespeichert (`localStorage`) und bleibt bei der nächsten
  Nutzung erhalten. Beide Designs sind rein optisch – Funktionen, Daten und
  Berechtigungen sind in beiden identisch.
- **Start-Screen (Rollenwahl)**: Beim Öffnen der App wählt man zuerst
  **Bearbeiter** oder **Betrachter 🔍**.
  - **Betrachter** gelangen ohne jede Anmeldung direkt zur Fahrtenliste und
    sehen dort nur die drei Sitzplatzzahlen einer Fahrt groß auf einem
    eigenen Bildschirm – ohne Möglichkeit, etwas zu verändern.
  - **Bearbeiter** müssen sich mit E-Mail/Passwort anmelden oder registrieren
    (nur mit **@eisenbahnmuseum-neustadt.de**-Adresse möglich). Nach der
    Registrierung landet man auf dem Bildschirm **"Fast geschafft!"** und
    wartet dort auf die Freigabe durch einen Admin (siehe unten) – in der
    Zwischenzeit lässt sich die App wahlweise als Betrachter nutzen.
    "Passwort vergessen?" verschickt einen Reset-Link per E-Mail.
- **Admin-Bereich** (nur für Konten, die manuell als Admin markiert wurden,
  siehe Abschnitt "Ersten Admin einrichten"): über den Link
  **"⚙ Admin-Bereich"** im Setup-Screen erreichbar. Zeigt alle wartenden
  Registrierungen mit einem **"Freigeben"**-Knopf sowie eine Liste bereits
  freigegebener Bearbeiter mit **"Sperren"**-Knopf (Freigabe jederzeit
  wieder entziehbar). Die Liste aktualisiert sich live.
- **Standort wählen**: Direkt bei "Dein Name / deine Kasse" wählt man
  **Neustadt**, **Lambrecht** oder **Elmstein** – das gilt für diese
  Zählstelle und wird bei jeder Zählung mit protokolliert (sichtbar in der
  Live-Aktivität).
- **Fahrt beitreten**: Bereits angelegte Fahrten werden als Liste angezeigt
  und können direkt angetippt werden. Eine Fahrt = **ein Zug an einem
  Fahrtag** (z. B. "D3 am 16.08.2026") – alle drei Standorte zählen dabei
  **gemeinsam in denselben Topf**, weil es derselbe Zug mit derselben
  Sitzplatzzahl ist. Für eine neue Fahrt (nur als Bearbeiter möglich)
  "+ Neue Fahrt anlegen" antippen: Fahrtag wählen, **Zug** (D3 / D4 / D5 /
  D6 / Sonderzug) auswählen und die Wagen antippen, die heute mitfahren –
  die Sitzplatzzahl wird automatisch aus den Wagen summiert (abweichende
  Gesamtzahl lässt sich optional manuell eintragen).
- **"🔍 Betrachter-Ansicht"**: Bearbeiter können während einer laufenden
  Zählung mit einem Tipp oben in der Kopfzeile kurz in die große
  Sitzplatzanzeige wechseln (z. B. um die Auslastung von weitem zu prüfen),
  ohne die Fahrt zu verlassen. "✏️ Zur Zählansicht" bringt zurück zum
  normalen Zählen.
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
  wechselt er zu **"Nur noch Stehplätze"**. Beim Erreichen von 100 % erscheint
  zusätzlich einmalig ein Popup mit Warnton (Bearbeiter- und
  Betrachter-Ansicht) – erst wenn die Fahrt danach wieder unter 100 % fällt
  und erneut 100 % erreicht, löst die Warnung erneut aus.
- **Vorreservierte Gruppen**: Beim Anlegen einer neuen Fahrt (oder jederzeit
  danach im Panel **"Reservierte Gruppen"**) lässt sich für angemeldete
  Gruppen ein Name und die Personenzahl hinterlegen. Diese erscheinen oben
  in der Leiste als eigene, **graue "Reserviert"-Zahl** und werden bei den
  50 %/75 %/100 %-Warnungen automatisch mitgerechnet (reservierte Plätze
  gelten schon als vergeben, auch bevor die Gruppe da ist). Trifft eine
  Gruppe ein, im Panel auf **"✓ Angekommen"** tippen: Die Reservierung
  verschwindet aus der grauen Zahl und die Personen werden automatisch zur
  normalen Gruppen-Zählung addiert (Sitzplätze bleiben dabei rechnerisch
  gleich belegt – nur eben nicht mehr "reserviert", sondern "gezählt").
  Kommt eine Gruppe nicht, lässt sich die Reservierung über **"✕"** ohne
  Zählung entfernen.
- **"Sitzplätze / Wagen nachträglich bearbeiten"**: Während der laufenden
  Zählung lässt sich die Wagen-Zusammenstellung (und damit die
  Sitzplatzzahl) noch ändern – z. B. wenn kurzfristig ein Wagen ausfällt.
  Das erfordert eine **doppelte Bestätigung**, da es sich sofort auf alle
  Kassen dieser Fahrt (beide Standorte) auswirkt.
- **Live-Aktivität** zeigt jede Zählung mit Standort, Kasse und Uhrzeit,
  "Letzte Aktion rückgängig" macht die zuletzt gespeicherte Zählung (egal
  von welcher Kasse/welchem Standort) rückgängig.
- **"📄 Bericht exportieren"** (im Live-Aktivität-Panel) erstellt einen
  druckfertigen Fahrtbericht mit Fahrt-Infos, Statistik-Übersicht, offenen
  Reservierungen und dem **kompletten** Aktivitätsprotokoll dieser Fahrt
  (nicht nur die letzten 20 wie in der Live-Ansicht). Öffnet den
  Browser-Druckdialog – dort einfach als Ziel **"Als PDF speichern"**
  wählen, um ein Dokument zu erhalten. Keine zusätzliche Software nötig.
- **Letzte Fahrten** listet die letzten 10 Fahrten (Datum + Zug), mit
  CSV-Export.
- In der Liste "Fahrt beitreten" kann jede Fahrt über das Papierkorb-Symbol
  endgültig gelöscht werden (inkl. ihres Aktivitätsprotokolls) – mit
  Sicherheitsabfrage. (Betrachter sehen dieses Symbol nicht.)
- **Zählung dieser Fahrt zurücksetzen** setzt nur die Fahrgastzahlen auf 0
  (die Sitzplatzanzahl bleibt erhalten) – ebenfalls mit **doppelter
  Bestätigung**.
- **Automatische Archivierung**: Sobald der Fahrtag einer Fahrt vorbei ist,
  wird sie automatisch **schreibgeschützt** – kein Zählen, kein Bearbeiten
  der Wagen, kein Zurücksetzen, keine Reservierungen, kein Löschen mehr
  möglich. Ein auffälliges Banner ("🔒 Diese Fahrt ist archiviert…")
  erscheint automatisch, auch wenn eine Fahrt seit dem Vortag offen im
  Browser stehen geblieben ist (Prüfung läuft im Hintergrund jede Minute
  weiter, kein Neuladen nötig). **Ansehen, "📄 Bericht exportieren" und
  "CSV exportieren" funktionieren weiterhin uneingeschränkt** – nur
  Änderungen sind gesperrt. In der Liste "Fahrt beitreten" sind archivierte
  Fahrten zusätzlich mit "🔒 archiviert" gekennzeichnet.
- **Bedienungsanleitung** und **Impressum** sind unten auf der Rollenwahl-
  und der Setup-Seite verlinkt (siehe eigene Abschnitte unten).

### Sicherheitshinweis zu den Rollen

Betrachter melden sich im Hintergrund automatisch **anonym** bei Firebase an
(technisch nötig, damit die Firestore-Regeln greifen) – das ist kein
sichtbares Konto.

Bearbeiter-Rechte sind **serverseitig** an zwei Bedingungen gekoppelt, die
die Firestore-Regeln bei **jedem** Schreibzugriff prüfen:

1. Die E-Mail-Adresse des Kontos endet auf `@eisenbahnmuseum-neustadt.de`.
2. Im Profil-Dokument `benutzer/{uid}` steht `freigegeben: true` – wird
   ausschließlich von einem Admin über den Admin-Bereich gesetzt.

Nur wenn **beides** zutrifft, werden Zählungen, neue Fahrten, Löschungen
usw. akzeptiert – unabhängig davon, was im Browser angezeigt wird. Ein neu
registriertes Konto ist also automatisch wirkungslos, bis es freigeschaltet
wurde.

**Wichtige Einschränkung:** Die Domain-Sperre bei der Registrierung ist eine
Prüfung *im Browser* (freundliche Fehlermeldung) plus die serverseitige
Firestore-Regel beim *Anlegen des Profils* (`benutzer`-Dokument). Das reine
*Anlegen eines Auth-Kontos* mit falscher Domain lässt sich mit Firebase-Auth-
Bordmitteln (ohne kostenpflichtige Cloud Functions) nicht zu 100 % verhindern
– ein solches Konto bekäme aber kein Profil-Dokument und damit nie
Bearbeiter-Rechte.

### Ersten Admin einrichten

Da sich niemand selbst zum Admin machen können soll, gibt es dafür bewusst
**keinen** Weg über die App – das muss einmalig manuell passieren:

1. Die Person registriert sich ganz normal als Bearbeiter in der App
   (landet danach auf "Fast geschafft!").
2. In der Firebase-Konsole unter *Authentication → Users* die User-ID
   (UID) dieser Person kopieren.
3. In *Firestore Database → Daten*:
   - Im Dokument `benutzer/{UID}` das Feld `freigegeben` auf `true` setzen
     (falls das Dokument fehlt, oben rechts manuell mit den Feldern
     `email` und `freigegeben: true` anlegen).
   - Eine neue Collection `admins` anlegen (falls noch nicht vorhanden) und
     darin ein Dokument mit der **UID als Dokument-ID** erstellen, z. B.
     mit einem Feld `ist: true`. Der Inhalt des Dokuments ist egal – wichtig
     ist nur, dass es existiert.
4. Die Person meldet sich einmal ab und wieder an (oder lädt die Seite neu)
   – danach erscheint der Link "⚙ Admin-Bereich" im Setup-Screen.

Weitere Bearbeiter können anschließend ganz normal über den Admin-Bereich
in der App freigeschaltet werden.

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
   Das ist der Teil, der die Museums-Domain-Beschränkung und die
   Admin-Freigabe tatsächlich durchsetzt – ohne diesen Schritt bleibt alles
   nur eine Anzeige im Browser.
6. **Ersten Admin einrichten** – siehe Abschnitt oben.
7. **Wagen anlegen**: Der Wagen-Katalog liegt jetzt in Firestore und startet
   leer. Als Admin im Admin-Bereich unter "Wagen verwalten" alle Wagen
   einmalig mit Namen, Sitzplätzen und Foto neu anlegen (siehe Abschnitt
   "Wagen-Katalog verwalten" weiter unten). Bereits bestehende Fahrten sind
   davon nicht betroffen, nur die Auswahlliste beim Anlegen *neuer* Fahrten
   ändert sich.

## 2. Auf GitHub veröffentlichen (GitHub Pages)

1. Neues Repository auf GitHub anlegen und diesen Ordner hochladen (inkl.
   der Datei `bedienungsanleitung.pdf`, siehe eigener Abschnitt unten):
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

## Bedienungsanleitung (PDF-Verknüpfung)

Die App verlinkt unten auf der Rollenwahl- und der Setup-Seite auf eine
Datei `bedienungsanleitung.pdf` im selben Ordner wie `index.html`. Lege dazu
einfach eine Datei mit genau diesem Namen ins Hauptverzeichnis des Repos
(neben `index.html`). Falls du sie anders nennst oder in einen Unterordner
legst, den Pfad in `index.html` bei den beiden Vorkommen von
`href="bedienungsanleitung.pdf"` entsprechend anpassen.

## Impressum

Der Impressum-Dialog in der App (Link unten auf Rollenwahl-/Setup-Seite)
enthält aktuell nur **Platzhaltertexte** (`[PLATZHALTER – ...]`). Bitte in
`index.html` im Abschnitt `<div id="impressumOverlay">` mit den echten
Angaben ersetzen (Betreiber, Anschrift, Vertretungsberechtigte, Kontakt,
ggf. Registereintrag) – ein Impressum ist in Deutschland Pflicht, sobald die
Seite öffentlich erreichbar ist.

## Datenmodell (Firestore)

```
benutzer/{uid}                        Ein Dokument pro Bearbeiter-Konto
  email: "schalter1@eisenbahnmuseum-neustadt.de"
  freigegeben: false | true           Nur von einem Admin änderbar
  erstellt / aktualisiert: Timestamp

admins/{uid}                          Existenz = Konto ist Admin
  (Inhalt beliebig, nur manuell in der Firebase-Konsole angelegt)

wagen/{wagenId}                       Wagen-Katalog, im Admin-Bereich gepflegt
  name: "Wagen 5"
  sitzplaetze: 32
  bild: "data:image/jpeg;base64,...."  Komprimiertes Foto (siehe unten)
  erstellt: Timestamp

einstellungen/global                  Globale App-Einstellungen
  sitzplatzReservePct: 10              Sitzplatz-Puffer in Prozent (0-99)

fahrten/{fahrtag}_{zug}                z. B. "2026-08-16_d3"
  fahrtag: "2026-08-16"
  zug: "d3" | "d4" | "d5" | "d6" | "sonderzug"
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
  standort: "neustadt" | "lambrecht" | "elmstein"
  zeit: Timestamp

fahrten/{fahrtId}/reservierungen/{resId}   Vorreservierte Gruppen
  name: "Schulklasse Musterstadt"
  anzahl: 10
  erstellt: Timestamp
```

> Hinweis: Fahrten, die noch mit einer älteren Version der App angelegt
> wurden, können zusätzlich die alten Felder `erwachsene`, `kinder` und
> `standort` (direkt am Fahrt-Dokument) enthalten. Die App zählt
> `erwachsene`/`kinder` weiterhin in die Gesamtsumme mit ein, ein altes
> `standort`-Feld am Fahrt-Dokument selbst wird schlicht ignoriert.

## Lokal testen

Kein Build nötig — einfach mit einem simplen lokalen Server öffnen (direktes
Öffnen der `index.html` per Doppelklick funktioniert wegen `type="module"`
in manchen Browsern nicht zuverlässig):

```bash
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

`localhost` ist standardmäßig als autorisierte Domain in Firebase erlaubt.

## Wagen-Katalog verwalten (jetzt über den Admin-Bereich)

Der Wagen-Katalog liegt **nicht mehr im Code**, sondern in Firestore
(Collection `wagen`) und wird direkt in der App gepflegt:

1. Als freigeschalteter Bearbeiter mit Admin-Kennzeichnung anmelden (siehe
   "Ersten Admin einrichten" oben).
2. Im Setup-Screen auf **"⚙ Admin-Bereich"** tippen, dort zum Abschnitt
   **"Wagen verwalten"** scrollen.
3. Name, Sitzplätze und ein Foto auswählen, dann **"+ Wagen hinzufügen"**.
   Das Bild wird direkt im Browser automatisch verkleinert/komprimiert
   (kein manueller Zuschnitt nötig) und landet zusammen mit den anderen
   Daten in Firestore — kein GitHub-Zugriff, kein erneutes Deployment
   nötig, die Änderung ist sofort in der Wagen-Auswahl sichtbar.
4. Über die Stift- bzw. Papierkorb-Symbole neben jedem Wagen lässt er sich
   bearbeiten oder löschen. Wird ein Wagen gelöscht, der in einer
   bestehenden Fahrt verwendet wurde, verschwindet er dort einfach aus der
   Anzeige (die historischen Zahlen bleiben unangetastet).

**Warum nicht direkt in GitHub/`app.js` bearbeiten?** Das würde bedeuten,
ein GitHub-Zugriffstoken mit Schreibrechten auf das gesamte Repository im
Browser zu hinterlegen — ein Sicherheitsrisiko, das in keinem Verhältnis
zum Nutzen steht. Über Firestore bleibt die Berechtigung fein
granular (nur Admins dürfen den Katalog ändern, siehe `firestore.rules`)
und Änderungen sind ohne Wartezeit sofort live.

**Technische Details zu den Bildern:** Fotos werden beim Hochladen im
Browser per Canvas verkleinert und als komprimiertes JPEG (Base64) direkt
im Firestore-Dokument gespeichert (mehrere Qualitätsstufen werden
automatisch durchprobiert, damit das Dokument sicher unter dem
Firestore-Limit von 1 MB bleibt). Das funktioniert komplett im kostenlosen
Firebase-Tarif, ohne Firebase Storage / Blaze-Tarif zu benötigen — die
Bildqualität ist dafür etwas einfacher als bei einer Speicherung in voller
Auflösung.

## Sitzplatz-Puffer (Admin-Bereich)

Im Admin-Bereich, direkt unter "Wagen verwalten", lässt sich unter
**"Angebotene Sitzplätze"** ein Prozentsatz (0–99 %) festlegen, der als
Reserve von der Wagen-Kapazität zurückgehalten wird. Beispiel: 4 Wagen mit
zusammen 80 Sitzplätzen und 10 % Puffer → die App schlägt beim Anlegen
bzw. nachträglichen Bearbeiten einer Fahrt automatisch **72** Sitzplätze
vor (10 % = 8 Plätze werden als Reserve nicht angeboten). Der Hinweistext
unter der Sitzplatzzahl zeigt dabei immer die Rechnung
("Wagen-Kapazität: 80 · abzüglich 10 % Reserve = 72 Sitzplätze").

- Der Puffer gilt **global** für alle Fahrten und wird sofort wirksam,
  sobald er gespeichert wird.
- Er wirkt sich **nur auf die automatische Berechnung aus den Wagen aus**.
  Wird stattdessen "abweichende Gesamtzahl…" genutzt, um die Sitzplatzzahl
  manuell einzutragen, greift der Puffer nicht – der manuell eingetragene
  Wert wird unverändert übernommen.
- Bereits angelegte Fahrten ändern sich durch eine spätere Anpassung des
  Prozentsatzes **nicht automatisch** – nur bei der (nachträglichen)
  Neuberechnung aus der Wagen-Auswahl wird der dann aktuelle Prozentsatz
  angewendet.
- Der Wert liegt in Firestore unter `einstellungen/global` (Feld
  `sitzplatzReservePct`) und ist nur für Admins änderbar.

## Automatische Archivierung vergangener Fahrten

Fahrten, deren Fahrtag vorbei ist, werden automatisch schreibgeschützt –
zählen, Wagen ändern, zurücksetzen, Reservierungen und Löschen sind dann
nicht mehr möglich. Lesen, "📄 Bericht exportieren" und "CSV exportieren"
bleiben uneingeschränkt erhalten.

**Warum keine geplante Aufgabe ("um Mitternacht ausführen")?** Eine
zeitgesteuerte Cloud Function würde den kostenpflichtigen Blaze-Tarif bei
Firebase voraussetzen (Cloud Scheduler ist nicht Teil des kostenlosen
Spark-Tarifs). Stattdessen prüfen sowohl die App als auch – entscheidend –
die **Firestore-Regeln** bei jedem Zugriff live: "Liegt der Fahrtag dieser
Fahrt vor dem heutigen Datum?" Das läuft ganz ohne geplante Aufgabe,
Server oder zusätzliche Kosten und ist genauso zuverlässig, weil die
Firestore-Regeln selbst die Sperre durchsetzen – nicht nur die
Bedienoberfläche.

- In der App läuft zusätzlich ein Minuten-Timer, der die Anzeige
  automatisch aktualisiert, falls eine Fahrt über Mitternacht hinweg offen
  im Browser stehen bleibt (kein Neuladen der Seite nötig).
- **Genauigkeit rund um Mitternacht**: Die Firestore-Regeln rechnen dabei
  in UTC mit einem Sicherheitsversatz. In der Praxis bedeutet das: Eine
  Fahrt bleibt tendenziell **noch ein bis zwei Stunden nach echter
  Mitternacht (Europe/Berlin) bearbeitbar**, wird aber nie zu früh
  gesperrt. Für den laufenden Betrieb (Zählen tagsüber, Abschluss am
  selben Abend) spielt das keine Rolle; falls exaktere Zeitzonen-Logik
  gewünscht ist, wäre dafür künftig doch eine Cloud Function nötig.
- Es gibt aktuell **keine Möglichkeit, eine archivierte Fahrt in der App
  wieder zu entsperren**. Falls das im Ausnahmefall nötig ist, kann ein
  Admin in der Firebase-Konsole das Feld `fahrtag` des betreffenden
  Fahrt-Dokuments (`fahrten/{fahrtId}`) vorübergehend auf das heutige
  Datum setzen, bearbeiten, und danach wieder zurücksetzen.

## Anpassen

- Andere erlaubte E-Mail-Domain für Bearbeiter-Registrierungen: in `app.js`
  die Konstante `ALLOWED_EMAIL_DOMAIN` ändern **und** in `firestore.rules`
  in `hatMuseumsEmail()` den Domainteil im `matches(...)`-Ausdruck anpassen
  (beide Stellen müssen übereinstimmen).
- Anderer Familien-Standardwert: in `app.js` die Zeile
  `cardFamilie.addEventListener("click", () => addFahrgaeste("familien", 4));`
  die `4` ändern.
- Weitere Züge (z. B. "D7"): in `index.html` im `#zugGroup` einen weiteren
  `.toggle-btn` mit `data-zug="..."` ergänzen, in `app.js` in `ZUG_LABEL`
  eintragen und in `firestore.rules` bei `zug in [...]` ergänzen.
- Weitere Standorte: in `index.html` im `#standortGroup` einen weiteren
  `.toggle-btn` mit `data-standort="..."` ergänzen und in `app.js` in
  `STANDORT_LABEL` eintragen.
- Ein Bearbeiter-Konto sperren: entweder im Admin-Bereich der App auf
  "Sperren" tippen, oder in der Firebase-Konsole unter *Authentication →
  Users* das Konto deaktivieren/löschen.
