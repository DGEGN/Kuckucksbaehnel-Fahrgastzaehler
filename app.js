// ==========================================================
// Kuckucks-Bähnel Fahrgastzähler
// ==========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot,
  increment, collection, addDoc, serverTimestamp, query,
  orderBy, limit, deleteDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---------------------------------------------------------
// TODO: Hier deine eigene Firebase-Projektkonfiguration eintragen.
// Firebase-Konsole -> Projekteinstellungen -> "Meine Apps" -> Web-App -> Konfiguration
// Diese Werte sind KEINE Geheimnisse, Zugriffsschutz erfolgt über die
// Firestore-Sicherheitsregeln (siehe firestore.rules / README.md).
// ---------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCpfHTMh8zx2hmcxjF-ayIjW0lFtJcBtSM",
  authDomain: "kuckuck-fahrkarten.firebaseapp.com",
  databaseURL: "https://kuckuck-fahrkarten-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "kuckuck-fahrkarten",
  storageBucket: "kuckuck-fahrkarten.firebasestorage.app",
  messagingSenderId: "732559401683",
  appId: "1:732559401683:web:dbfb8ef56c85c73de46a26"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => { if (user) resolve(user); });
});
signInAnonymously(auth).catch((err) => {
  showSetupError("Verbindung zu Firebase fehlgeschlagen: " + err.message);
});

// ---------------------------------------------------------
// Konstanten & Hilfsfunktionen
// ---------------------------------------------------------
const KATEGORIE_LABEL = {
  einzelperson: "Einzelperson",
  familien: "Familie",
  gruppen: "Gruppe",
  // Legacy-Kategorien aus früheren Versionen (Aktivitätsprotokoll alter Fahrten)
  erwachsene: "Erwachsene",
  kinder: "Kinder"
};

// Summiert alle Fahrgast-Felder eines Fahrt-Dokuments, inkl. der alten
// Felder erwachsene/kinder, damit bereits erfasste Fahrten korrekt bleiben.
function computeTotal(d) {
  return clamp0(d.einzelperson) + clamp0(d.erwachsene) + clamp0(d.kinder) + clamp0(d.familien) + clamp0(d.gruppen);
}
const STANDORT_LABEL = { neustadt: "Neustadt", lambrecht: "Lambrecht" };
const LS_KEY = "kb_session_v1";

function todayISO() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  });
  return fmt.format(new Date());
}
function formatDateDE(iso) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function formatTimeDE(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date();
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(date);
}
function clamp0(n) { return Math.max(0, n || 0); }

// ---------------------------------------------------------
// WAGEN-KATALOG
// ---------------------------------------------------------
// Hier die echten Wagen des Kuckucks-Bähnel eintragen: Name, Sitzplätze
// und ein Bild (SVG-Platzhalter aus assets/wagen/ oder eigenes Foto,
// z. B. "assets/wagen/mein-foto.jpg"). Reihenfolge = Anzeigereihenfolge.
// ---------------------------------------------------------
const WAGEN = [
  { id: "wagen1", name: "Wagen 3", sitzplaetze: 44, bild: "assets/wagen/12240.jpg" },
  { id: "wagen2", name: "Wagen 4", sitzplaetze: 72, bild: "assets/wagen/11150.jpg" },
  { id: "wagen3", name: "Wagen 5", sitzplaetze: 72, bild: "assets/wagen/11082.jpg" },
  { id: "wagen4", name: "Wagen 6", sitzplaetze: 70, bild: "assets/wagen/2455.jpg" },
  { id: "wagen5", name: "Wagen 7", sitzplaetze: 88, bild: "assets/wagen/4918.jpg" },
  { id: "wagen6", name: "Wagen 8", sitzplaetze: 53, bild: "assets/wagen/82813.jpg" },
  { id: "wagen7", name: "Wagen 9", sitzplaetze: 56, bild: "assets/wagen/85034.jpg" }
];
let selectedWagen = new Set();

// ---------------------------------------------------------
// DOM-Referenzen
// ---------------------------------------------------------
const el = (id) => document.getElementById(id);

const setupScreen = el("setup");
const appScreen = el("app");
const fahrtagInput = el("fahrtag");
const standortGroup = el("standortGroup");
const sitzplaetzeInput = el("sitzplaetze");
const wagenGrid = el("wagenGrid");
const wagenTotalSeatsEl = el("wagenTotalSeats");
const toggleSeatOverrideBtn = el("toggleSeatOverride");
const seatOverrideField = el("seatOverrideField");
const sitzplaetzeOverrideInput = el("sitzplaetzeOverride");
const kasseInput = el("kasseInput");
const startBtn = el("startBtn");
const setupInfo = el("setupInfo");
const setupError = el("setupError");
const existingTripsList = el("existingTripsList");
const toggleNewTripBtn = el("toggleNewTrip");
const newTripForm = el("newTripForm");

const fahrtagLabel = el("fahrtagLabel");
const standortLabel = el("standortLabel");
const kasseLabel = el("kasseLabel");
const changeSessionBtn = el("changeSession");
const connStatus = el("connStatus");

const seatsBanner = el("seatsBanner");
const totalTodayEl = el("totalToday");
const seatsTotalEl = el("seatsTotal");
const seatsFreeEl = el("seatsFree");
const seatsFreeLabel = el("seatsFreeLabel");

const countEinzelperson = el("countEinzelperson");
const countFamilien = el("countFamilien");
const countGruppen = el("countGruppen");

const cardEinzelperson = el("cardEinzelperson");
const cardFamilie = el("cardFamilie");
const familieAndereAnzahl = el("familieAndereAnzahl");

const gruppeMinus = el("gruppeMinus");
const gruppePlus = el("gruppePlus");
const gruppeDisplay = el("gruppeDisplay");
const gruppeAdd = el("gruppeAdd");

const activityList = el("activityList");
const undoLastBtn = el("undoLast");
const historyBody = el("historyBody");
const exportCsvBtn = el("exportCsv");
const resetDayBtn = el("resetDay");

const toastEl = el("toast");
const confirmDialog = el("confirmDialog");
const confirmText = el("confirmText");
const confirmOk = el("confirmOk");
const confirmCancel = el("confirmCancel");

const numpadOverlay = el("numpadOverlay");
const numpadTitle = el("numpadTitle");
const numpadDisplay = el("numpadDisplay");
const numpadOk = el("numpadOk");
const numpadCancel = el("numpadCancel");

// ---------------------------------------------------------
// Zustand
// ---------------------------------------------------------
let session = null;        // {fahrtag, standort, kasse, sitzplaetze}
let docRef = null;
let unsubDoc = null;
let unsubActivity = null;
let unsubHistory = null;
let unsubSetupList = null;
let newTripVisible = false;
let selectedStandort = null;
let pendingGruppe = 1;
let numpadValue = "";
let numpadOnConfirm = null;
let latestHistoryRows = [];

// ===========================================================
// SETUP SCREEN
// ===========================================================
function initSetupScreen() {
  fahrtagInput.value = todayISO();

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { /* ignore */ }
  if (saved) {
    if (saved.standort) selectStandort(saved.standort);
    if (saved.kasse) kasseInput.value = saved.kasse;
  }

  standortGroup.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectStandort(btn.dataset.standort));
  });

  renderWagenGrid();

  toggleSeatOverrideBtn.addEventListener("click", () => {
    const visible = seatOverrideField.classList.toggle("hidden") === false;
    toggleSeatOverrideBtn.textContent = visible ? "abweichende Gesamtzahl ausblenden" : "abweichende Gesamtzahl…";
    if (!visible) { sitzplaetzeOverrideInput.value = ""; updateWagenTotal(); }
  });
  sitzplaetzeOverrideInput.addEventListener("input", updateWagenTotal);

  startBtn.addEventListener("click", startSession);
  toggleNewTripBtn.addEventListener("click", () => setNewTripVisible(!newTripVisible));

  subscribeToExistingTrips();
}

function setNewTripVisible(visible) {
  newTripVisible = visible;
  newTripForm.classList.toggle("hidden", !visible);
  toggleNewTripBtn.textContent = visible ? "Abbrechen" : "+ Neue Fahrt anlegen";
}

function renderWagenGrid() {
  wagenGrid.innerHTML = "";
  WAGEN.forEach((w) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "wagen-tile";
    tile.dataset.wagen = w.id;
    tile.innerHTML = `
      <span class="wagen-check">✓</span>
      <img class="wagen-img" src="${w.bild}" alt="${escapeHtml(w.name)}">
      <span class="wagen-name">${escapeHtml(w.name)}</span>
      <span class="wagen-seats">${w.sitzplaetze} Plätze</span>
    `;
    tile.addEventListener("click", () => toggleWagenTile(w.id, tile));
    wagenGrid.appendChild(tile);
  });
  updateWagenTotal();
}

function toggleWagenTile(id, tile) {
  if (selectedWagen.has(id)) selectedWagen.delete(id);
  else selectedWagen.add(id);
  tile.classList.toggle("selected", selectedWagen.has(id));
  updateWagenTotal();
}

function updateWagenTotal() {
  const overrideVal = parseInt(sitzplaetzeOverrideInput.value, 10);
  let total;
  if (!seatOverrideField.classList.contains("hidden") && overrideVal > 0) {
    total = overrideVal;
  } else {
    total = WAGEN.filter((w) => selectedWagen.has(w.id)).reduce((sum, w) => sum + w.sitzplaetze, 0);
  }
  wagenTotalSeatsEl.textContent = total;
  sitzplaetzeInput.value = total;
}

async function subscribeToExistingTrips() {
  existingTripsList.innerHTML = '<p class="trip-empty">Lade Fahrten…</p>';
  try {
    await authReady;
  } catch (e) { /* ignore, onSnapshot will surface auth errors */ }
  const q = query(collection(db, "fahrten"), orderBy("fahrtag", "desc"), limit(15));
  unsubSetupList = onSnapshot(q, renderExistingTrips, () => {
    existingTripsList.innerHTML = '<p class="trip-empty">Fahrten konnten nicht geladen werden.</p>';
  });
}

function renderExistingTrips(snap) {
  if (snap.empty) {
    existingTripsList.innerHTML = '<p class="trip-empty">Noch keine Fahrten angelegt.</p>';
    setNewTripVisible(true);
    return;
  }
  existingTripsList.innerHTML = "";
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const total = computeTotal(d);
    const seats = clamp0(d.sitzplaetze);

    const item = document.createElement("div");
    item.className = "trip-item";

    const joinBtn = document.createElement("button");
    joinBtn.type = "button";
    joinBtn.className = "trip-item-join";
    joinBtn.innerHTML = `
      <span class="trip-item-main">
        <span class="trip-item-date">${formatDateDE(d.fahrtag)}</span>
        <span class="trip-item-standort">${STANDORT_LABEL[d.standort] || d.standort}</span>
      </span>
      <span class="trip-item-stats">${total} / ${seats} Plätze</span>
      <span class="trip-item-arrow">›</span>
    `;
    joinBtn.addEventListener("click", () => joinExistingFahrt(docSnap.id, d));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "trip-item-delete";
    delBtn.setAttribute("aria-label", "Fahrt löschen");
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeleteFahrt(docSnap.id, d);
    });

    item.appendChild(joinBtn);
    item.appendChild(delBtn);
    existingTripsList.appendChild(item);
  });
}

function confirmDeleteFahrt(docId, data) {
  const label = `${formatDateDE(data.fahrtag)} (${STANDORT_LABEL[data.standort] || data.standort})`;
  openConfirm(
    `Fahrt vom ${label} wirklich löschen? Alle Zählungen dieser Fahrt gehen dabei unwiderruflich verloren.`,
    () => deleteFahrt(docId),
    "Ja, löschen"
  );
}

async function deleteFahrt(docId) {
  try {
    await authReady;
    const ref = doc(db, "fahrten", docId);
    const evSnap = await getDocs(collection(ref, "ereignisse"));
    await Promise.all(evSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(ref);
    showToast("Fahrt gelöscht.");
  } catch (err) {
    showToast("Fehler beim Löschen: " + err.message);
  }
}

async function joinExistingFahrt(docId, data) {
  showSetupError(""); showSetupInfo("");
  const kasse = kasseInput.value.trim() || "Kasse";
  try {
    await authReady;
    session = { fahrtag: data.fahrtag, standort: data.standort, kasse, sitzplaetze: clamp0(data.sitzplaetze) };
    docRef = doc(db, "fahrten", docId);
    localStorage.setItem(LS_KEY, JSON.stringify({ kasse }));
    if (unsubSetupList) { unsubSetupList(); unsubSetupList = null; }
    enterApp();
  } catch (err) {
    showSetupError("Fehler: " + err.message);
  }
}

function selectStandort(value) {
  selectedStandort = value;
  standortGroup.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.standort === value);
  });
}

function showSetupError(msg) { setupError.textContent = msg; }
function showSetupInfo(msg) { setupInfo.textContent = msg; }

async function startSession() {
  showSetupError(""); showSetupInfo("");

  const fahrtag = fahrtagInput.value;
  const sitzplaetze = parseInt(sitzplaetzeInput.value, 10);
  const kasse = kasseInput.value.trim() || "Kasse";
  const wagenAuswahl = Array.from(selectedWagen);

  if (!fahrtag) { showSetupError("Bitte einen Fahrtag wählen."); return; }
  if (!selectedStandort) { showSetupError("Bitte Neustadt oder Lambrecht wählen."); return; }
  if (!sitzplaetze || sitzplaetze < 1) { showSetupError("Bitte mindestens einen Wagen auswählen oder eine abweichende Sitzplatzzahl eingeben."); return; }

  startBtn.disabled = true;
  startBtn.textContent = "Verbinde…";

  try {
    await authReady;
    const docId = `${fahrtag}_${selectedStandort}`;
    const ref = doc(db, "fahrten", docId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      if (data.sitzplaetze !== sitzplaetze || wagenAuswahl.length) {
        await updateDoc(ref, { sitzplaetze, wagen: wagenAuswahl, aktualisiert: serverTimestamp() });
      }
      showSetupInfo(`Fahrt gefunden – bisher ${computeTotal(data)} Fahrgäste gezählt. Du zählst live mit.`);
    } else {
      await setDoc(ref, {
        fahrtag, standort: selectedStandort, sitzplaetze, wagen: wagenAuswahl,
        einzelperson: 0, familien: 0, gruppen: 0,
        erstellt: serverTimestamp(), aktualisiert: serverTimestamp()
      });
    }

    session = { fahrtag, standort: selectedStandort, kasse, sitzplaetze };
    docRef = ref;
    localStorage.setItem(LS_KEY, JSON.stringify(session));
    if (unsubSetupList) { unsubSetupList(); unsubSetupList = null; }
    enterApp();
  } catch (err) {
    showSetupError("Fehler: " + err.message);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = "Zählung starten";
  }
}

// ===========================================================
// APP SCREEN
// ===========================================================
function enterApp() {
  setupScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  fahrtagLabel.textContent = formatDateDE(session.fahrtag);
  standortLabel.textContent = STANDORT_LABEL[session.standort] || session.standort;
  kasseLabel.textContent = session.kasse;

  subscribeToTrip();
  subscribeToActivity();
  subscribeToHistory();
}

function leaveApp() {
  if (unsubDoc) unsubDoc();
  if (unsubActivity) unsubActivity();
  if (unsubHistory) unsubHistory();
  docRef = null;
  appScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
  showSetupError(""); showSetupInfo("");
  fahrtagInput.value = session?.fahrtag || todayISO();
  if (session?.standort) selectStandort(session.standort);
  kasseInput.value = session?.kasse || "";
  selectedWagen = new Set();
  seatOverrideField.classList.add("hidden");
  sitzplaetzeOverrideInput.value = "";
  toggleSeatOverrideBtn.textContent = "abweichende Gesamtzahl…";
  renderWagenGrid();
  setNewTripVisible(false);
  subscribeToExistingTrips();
}

function subscribeToTrip() {
  setConnStatus("connecting");
  unsubDoc = onSnapshot(docRef, (snap) => {
    setConnStatus(snap.metadata.fromCache ? "offline" : "online");
    if (!snap.exists()) return;
    const d = snap.data();
    // "einzel" fasst die neue Einzelperson-Kategorie plus alte erwachsene/kinder
    // (falls diese Fahrt noch mit der Vorgängerversion gezählt wurde) zusammen.
    const einzel = clamp0(d.einzelperson) + clamp0(d.erwachsene) + clamp0(d.kinder);
    const fam = clamp0(d.familien), grp = clamp0(d.gruppen);
    const total = computeTotal(d);
    const seats = clamp0(d.sitzplaetze);
    const free = seats - total;

    countEinzelperson.textContent = einzel;
    countFamilien.textContent = fam;
    countGruppen.textContent = grp;
    totalTodayEl.textContent = total;
    seatsTotalEl.textContent = seats;
    seatsFreeEl.textContent = free;
    seatsFreeLabel.textContent = free < 0 ? "überbucht" : "frei";
    seatsBanner.classList.toggle("seats-warning", free <= 0);
  }, (err) => {
    setConnStatus("offline");
    showToast("Verbindungsfehler: " + err.message);
  });
}

function setConnStatus(state) {
  connStatus.className = "conn-status conn-" + state;
  connStatus.textContent = state === "online" ? "live verbunden" : state === "offline" ? "keine Verbindung" : "verbinde…";
}

async function addFahrgaeste(kategorie, delta) {
  if (!docRef || !delta) return;
  try {
    await updateDoc(docRef, { [kategorie]: increment(delta), aktualisiert: serverTimestamp() });
    await addDoc(collection(docRef, "ereignisse"), {
      kategorie, anzahl: delta, kasse: session.kasse, zeit: serverTimestamp()
    });
  } catch (err) {
    showToast("Fehler beim Speichern: " + err.message);
  }
}

function subscribeToActivity() {
  const q = query(collection(docRef, "ereignisse"), orderBy("zeit", "desc"), limit(20));
  unsubActivity = onSnapshot(q, (snap) => {
    if (snap.empty) {
      activityList.innerHTML = '<li class="activity-empty">Noch keine Zählungen für diese Fahrt.</li>';
      return;
    }
    activityList.innerHTML = "";
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const li = document.createElement("li");
      const sign = d.anzahl > 0 ? "+" : "";
      const deltaClass = d.anzahl > 0 ? "activity-delta-pos" : "activity-delta-neg";
      li.innerHTML = `
        <span>${escapeHtml(d.kasse || "Kasse")} · ${KATEGORIE_LABEL[d.kategorie] || d.kategorie}</span>
        <span class="${deltaClass}">${sign}${d.anzahl}</span>
        <span class="activity-time">${formatTimeDE(d.zeit)}</span>
      `;
      activityList.appendChild(li);
    });
  });
}

async function undoLast() {
  if (!docRef) return;
  const q = query(collection(docRef, "ereignisse"), orderBy("zeit", "desc"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) { showToast("Keine Aktion zum Rückgängigmachen."); return; }
  const last = snap.docs[0];
  const d = last.data();
  try {
    await updateDoc(docRef, { [d.kategorie]: increment(-d.anzahl), aktualisiert: serverTimestamp() });
    await deleteDoc(last.ref);
    showToast(`Rückgängig: ${KATEGORIE_LABEL[d.kategorie] || d.kategorie} ${d.anzahl > 0 ? "-" : "+"}${Math.abs(d.anzahl)}`);
  } catch (err) {
    showToast("Fehler: " + err.message);
  }
}

function subscribeToHistory() {
  const q = query(collection(db, "fahrten"), orderBy("fahrtag", "desc"), limit(10));
  unsubHistory = onSnapshot(q, (snap) => {
    if (snap.empty) {
      historyBody.innerHTML = '<tr><td colspan="5" class="history-empty">Noch keine Fahrten erfasst.</td></tr>';
      latestHistoryRows = [];
      return;
    }
    historyBody.innerHTML = "";
    latestHistoryRows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const total = computeTotal(d);
      const seats = clamp0(d.sitzplaetze);
      const free = seats - total;
      latestHistoryRows.push({ fahrtag: d.fahrtag, standort: d.standort, total, seats, free });
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDateDE(d.fahrtag)}</td>
        <td>${STANDORT_LABEL[d.standort] || d.standort}</td>
        <td>${total}</td>
        <td>${seats}</td>
        <td>${free}</td>
      `;
      historyBody.appendChild(tr);
    });
  });
}

function exportCsv() {
  if (!latestHistoryRows.length) { showToast("Kein Verlauf zum Exportieren."); return; }
  const header = "Datum,Standort,Fahrgaeste,Sitzplaetze,Frei\n";
  const rows = latestHistoryRows.map(r =>
    `${r.fahrtag},${STANDORT_LABEL[r.standort] || r.standort},${r.total},${r.seats},${r.free}`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kuckucksbaehnel_fahrten_${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------
// Reset-Bestätigung
// ---------------------------------------------------------
function openConfirm(text, onOk, okLabel = "Ja, zurücksetzen") {
  confirmText.textContent = text;
  confirmOk.textContent = okLabel;
  confirmDialog.classList.remove("hidden");
  const handler = () => { confirmDialog.classList.add("hidden"); confirmOk.removeEventListener("click", handler); onOk(); };
  confirmOk.addEventListener("click", handler);
}
confirmCancel.addEventListener("click", () => confirmDialog.classList.add("hidden"));

async function resetTrip() {
  if (!docRef) return;
  try {
    await updateDoc(docRef, {
      erwachsene: 0, kinder: 0, familien: 0, gruppen: 0, aktualisiert: serverTimestamp()
    });
    const evSnap = await getDocs(collection(docRef, "ereignisse"));
    await Promise.all(evSnap.docs.map((d) => deleteDoc(d.ref)));
    showToast("Zählung wurde zurückgesetzt.");
  } catch (err) {
    showToast("Fehler: " + err.message);
  }
}

// ---------------------------------------------------------
// Numpad
// ---------------------------------------------------------
function openNumpad(title, initial, onConfirm) {
  numpadTitle.textContent = title;
  numpadValue = initial > 0 ? String(initial) : "";
  numpadDisplay.textContent = numpadValue || "0";
  numpadOnConfirm = onConfirm;
  numpadOverlay.classList.remove("hidden");
}
function closeNumpad() { numpadOverlay.classList.add("hidden"); numpadOnConfirm = null; }

numpadOverlay.querySelectorAll(".numpad-key").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.key;
    if (key === "clear") numpadValue = "";
    else if (key === "back") numpadValue = numpadValue.slice(0, -1);
    else if (numpadValue.length < 4) numpadValue += key;
    numpadDisplay.textContent = numpadValue || "0";
  });
});
numpadCancel.addEventListener("click", closeNumpad);
numpadOk.addEventListener("click", () => {
  const value = parseInt(numpadValue, 10);
  const cb = numpadOnConfirm;
  closeNumpad();
  if (cb && value > 0) cb(value);
  else if (value <= 0 || isNaN(value)) showToast("Bitte eine Anzahl größer 0 eingeben.");
});

// ---------------------------------------------------------
// Toast
// ---------------------------------------------------------
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

// ---------------------------------------------------------
// Event-Listener: Zähl-Karten
// ---------------------------------------------------------
cardEinzelperson.addEventListener("click", () => addFahrgaeste("einzelperson", 1));
cardFamilie.addEventListener("click", () => addFahrgaeste("familien", 4));
familieAndereAnzahl.addEventListener("click", () => {
  openNumpad("Familie – abweichende Personenzahl", 0, (n) => addFahrgaeste("familien", n));
});

function updateGruppeDisplay() { gruppeDisplay.textContent = pendingGruppe; }
gruppeMinus.addEventListener("click", () => { pendingGruppe = Math.max(1, pendingGruppe - 1); updateGruppeDisplay(); });
gruppePlus.addEventListener("click", () => { pendingGruppe = Math.min(999, pendingGruppe + 1); updateGruppeDisplay(); });
gruppeDisplay.addEventListener("click", () => {
  openNumpad("Gruppengröße eingeben", pendingGruppe, (n) => { pendingGruppe = Math.min(999, n); updateGruppeDisplay(); });
});
gruppeAdd.addEventListener("click", () => {
  addFahrgaeste("gruppen", pendingGruppe);
  pendingGruppe = 1;
  updateGruppeDisplay();
});

undoLastBtn.addEventListener("click", undoLast);
resetDayBtn.addEventListener("click", () => {
  openConfirm("Zählung dieser Fahrt wirklich auf 0 zurücksetzen? Die Sitzplatzanzahl bleibt erhalten.", resetTrip);
});
exportCsvBtn.addEventListener("click", exportCsv);
changeSessionBtn.addEventListener("click", leaveApp);

window.addEventListener("online", () => setConnStatus(docRef ? "online" : "connecting"));
window.addEventListener("offline", () => setConnStatus("offline"));

// ---------------------------------------------------------
// Start
// ---------------------------------------------------------
initSetupScreen();
