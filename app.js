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
  apiKey: "DEIN_API_KEY",
  authDomain: "DEIN_PROJEKT.firebaseapp.com",
  projectId: "DEIN_PROJEKT",
  storageBucket: "DEIN_PROJEKT.appspot.com",
  messagingSenderId: "DEINE_SENDER_ID",
  appId: "DEINE_APP_ID"
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
  erwachsene: "Erwachsene",
  kinder: "Kinder",
  familien: "Familie",
  gruppen: "Gruppe"
};
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
// DOM-Referenzen
// ---------------------------------------------------------
const el = (id) => document.getElementById(id);

const setupScreen = el("setup");
const appScreen = el("app");
const fahrtagInput = el("fahrtag");
const standortGroup = el("standortGroup");
const sitzplaetzeInput = el("sitzplaetze");
const seatChips = el("seatChips");
const kasseInput = el("kasseInput");
const startBtn = el("startBtn");
const setupInfo = el("setupInfo");
const setupError = el("setupError");

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

const countErwachsene = el("countErwachsene");
const countKinder = el("countKinder");
const countFamilien = el("countFamilien");
const countGruppen = el("countGruppen");

const cardErwachsene = el("cardErwachsene");
const cardKinder = el("cardKinder");
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
    if (saved.sitzplaetze) sitzplaetzeInput.value = saved.sitzplaetze;
    if (saved.kasse) kasseInput.value = saved.kasse;
  }

  standortGroup.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectStandort(btn.dataset.standort));
  });

  seatChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      sitzplaetzeInput.value = chip.dataset.seats;
      seatChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });
  sitzplaetzeInput.addEventListener("input", () => {
    seatChips.querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.seats === sitzplaetzeInput.value);
    });
  });

  startBtn.addEventListener("click", startSession);
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

  if (!fahrtag) { showSetupError("Bitte einen Fahrtag wählen."); return; }
  if (!selectedStandort) { showSetupError("Bitte Neustadt oder Lambrecht wählen."); return; }
  if (!sitzplaetze || sitzplaetze < 1) { showSetupError("Bitte eine gültige Sitzplatzanzahl eingeben."); return; }

  startBtn.disabled = true;
  startBtn.textContent = "Verbinde…";

  try {
    await authReady;
    const docId = `${fahrtag}_${selectedStandort}`;
    const ref = doc(db, "fahrten", docId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      if (data.sitzplaetze !== sitzplaetze) {
        await updateDoc(ref, { sitzplaetze, aktualisiert: serverTimestamp() });
      }
      const bereits = clamp0(data.erwachsene) + clamp0(data.kinder) + clamp0(data.familien) + clamp0(data.gruppen);
      showSetupInfo(`Fahrt gefunden – bisher ${bereits} Fahrgäste gezählt. Du zählst live mit.`);
    } else {
      await setDoc(ref, {
        fahrtag, standort: selectedStandort, sitzplaetze,
        erwachsene: 0, kinder: 0, familien: 0, gruppen: 0,
        erstellt: serverTimestamp(), aktualisiert: serverTimestamp()
      });
    }

    session = { fahrtag, standort: selectedStandort, kasse, sitzplaetze };
    docRef = ref;
    localStorage.setItem(LS_KEY, JSON.stringify(session));
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
  sitzplaetzeInput.value = session?.sitzplaetze || "";
  kasseInput.value = session?.kasse || "";
}

function subscribeToTrip() {
  setConnStatus("connecting");
  unsubDoc = onSnapshot(docRef, (snap) => {
    setConnStatus(snap.metadata.fromCache ? "offline" : "online");
    if (!snap.exists()) return;
    const d = snap.data();
    const erw = clamp0(d.erwachsene), kind = clamp0(d.kinder), fam = clamp0(d.familien), grp = clamp0(d.gruppen);
    const total = erw + kind + fam + grp;
    const seats = clamp0(d.sitzplaetze);
    const free = seats - total;

    countErwachsene.textContent = erw;
    countKinder.textContent = kind;
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
      const total = clamp0(d.erwachsene) + clamp0(d.kinder) + clamp0(d.familien) + clamp0(d.gruppen);
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
function openConfirm(text, onOk) {
  confirmText.textContent = text;
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
cardErwachsene.addEventListener("click", () => addFahrgaeste("erwachsene", 1));
cardKinder.addEventListener("click", () => addFahrgaeste("kinder", 1));
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
