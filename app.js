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
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail
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

// currentUser wird von onAuthStateChanged gepflegt, siehe weiter unten
// im Abschnitt "ANMELDUNG / REGISTRIERUNG".
let currentUser = null; // { uid, email, rolle }
// Verhindert, dass der onAuthStateChanged-Listener während der Registrierung
// (kurzes Zeitfenster zwischen Konto- und Profil-Erstellung) vorzeitig mit
// einem noch fehlenden Profil weiterläuft.
let authFlowInProgress = false;

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
  { id: "wagen1", name: "Wagen 1", sitzplaetze: 24, bild: "assets/wagen/wagen1.svg" },
  { id: "wagen2", name: "Wagen 2", sitzplaetze: 28, bild: "assets/wagen/wagen2.svg" },
  { id: "wagen3", name: "Wagen 3", sitzplaetze: 32, bild: "assets/wagen/wagen3.svg" },
  { id: "wagen4", name: "Aussichtswagen", sitzplaetze: 20, bild: "assets/wagen/wagen4.svg" }
];
let selectedWagen = new Set();

// ---------------------------------------------------------
// DOM-Referenzen
// ---------------------------------------------------------
const el = (id) => document.getElementById(id);

const authScreen = el("auth");
const authModeGroup = el("authModeGroup");
const loginFormEl = el("loginForm");
const registerFormEl = el("registerForm");
const loginEmailInput = el("loginEmail");
const loginPasswordInput = el("loginPassword");
const loginBtn = el("loginBtn");
const forgotPasswordBtn = el("forgotPasswordBtn");
const registerEmailInput = el("registerEmail");
const registerPasswordInput = el("registerPassword");
const registerPasswordRepeatInput = el("registerPasswordRepeat");
const registerRolleGroup = el("registerRolleGroup");
const registerBtn = el("registerBtn");
const authInfo = el("authInfo");
const authError = el("authError");

const setupScreen = el("setup");
const appScreen = el("app");
const viewerScreen = el("viewer");
const accountLabel = el("accountLabel");
const logoutBtn = el("logoutBtn");
const logoutBtnApp = el("logoutBtnApp");
const logoutBtnViewer = el("logoutBtnViewer");
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
const newTripDivider = el("newTripDivider");

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
const seatsWarningBadge = el("seatsWarningBadge");
const editSeatsBtn = el("editSeatsBtn");

const countEinzelperson = el("countEinzelperson");
const countFamilien = el("countFamilien");
const countGruppen = el("countGruppen");

const cardEinzelperson = el("cardEinzelperson");
const cardFamilie = el("cardFamilie");
const familieAndereAnzahl = el("familieAndereAnzahl");
const minusEinzelperson = el("minusEinzelperson");
const minusFamilien = el("minusFamilien");
const minusGruppen = el("minusGruppen");

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

// Viewer-Screen (Betrachter)
const viewerChangeSessionBtn = el("viewerChangeSession");
const viewerFahrtagLabel = el("viewerFahrtagLabel");
const viewerStandortLabel = el("viewerStandortLabel");
const viewerConnStatus = el("viewerConnStatus");
const viewerOccupiedEl = el("viewerOccupied");
const viewerTotalSeatsEl = el("viewerTotalSeats");
const viewerFreeEl = el("viewerFree");
const viewerFreeLabel = el("viewerFreeLabel");
const viewerWarning = el("viewerWarning");

// Wagen-/Sitzplatz-Nachbearbeitung
const wagenEditOverlay = el("wagenEditOverlay");
const wagenEditGrid = el("wagenEditGrid");
const wagenEditTotalSeatsEl = el("wagenEditTotalSeats");
const toggleSeatEditOverrideBtn = el("toggleSeatEditOverride");
const seatEditOverrideField = el("seatEditOverrideField");
const sitzplaetzeEditOverrideInput = el("sitzplaetzeEditOverride");
const wagenEditCancel = el("wagenEditCancel");
const wagenEditSave = el("wagenEditSave");

// ---------------------------------------------------------
// Zustand
// ---------------------------------------------------------
let session = null;        // {fahrtag, standort, kasse, sitzplaetze, rolle}
let docRef = null;
let unsubDoc = null;
let unsubActivity = null;
let unsubHistory = null;
let unsubSetupList = null;
let newTripVisible = false;
let selectedStandort = null;
let selectedRegisterRolle = null;
let pendingGruppe = 1;
let numpadValue = "";
let numpadOnConfirm = null;
let latestHistoryRows = [];
let currentTripData = null;   // letzter bekannter Snapshot-Inhalt der aktiven Fahrt
let selectedWagenEdit = new Set();

// ===========================================================
// ANMELDUNG / REGISTRIERUNG
// ===========================================================
function initAuthScreen() {
  authModeGroup.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => setAuthMode(btn.dataset.mode));
  });
  registerRolleGroup.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedRegisterRolle = btn.dataset.rolle;
      registerRolleGroup.querySelectorAll(".toggle-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
  loginBtn.addEventListener("click", doLogin);
  registerBtn.addEventListener("click", doRegister);
  forgotPasswordBtn.addEventListener("click", doPasswordReset);
  logoutBtn.addEventListener("click", doLogout);
  logoutBtnApp.addEventListener("click", doLogout);
  logoutBtnViewer.addEventListener("click", doLogout);
}

function setAuthMode(mode) {
  authModeGroup.querySelectorAll(".toggle-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  loginFormEl.classList.toggle("hidden", mode !== "login");
  registerFormEl.classList.toggle("hidden", mode !== "register");
  showAuthError(""); showAuthInfo("");
}

function showAuthError(msg) { authError.textContent = msg; }
function showAuthInfo(msg) { authInfo.textContent = msg; }

function authErrorMessage(err) {
  const map = {
    "auth/invalid-email": "Die E-Mail-Adresse ist ungültig.",
    "auth/user-disabled": "Dieses Konto wurde deaktiviert.",
    "auth/user-not-found": "Kein Konto mit dieser E-Mail gefunden.",
    "auth/wrong-password": "Falsches Passwort.",
    "auth/invalid-credential": "E-Mail oder Passwort ist falsch.",
    "auth/email-already-in-use": "Für diese E-Mail existiert bereits ein Konto.",
    "auth/weak-password": "Das Passwort ist zu schwach (mind. 6 Zeichen).",
    "auth/too-many-requests": "Zu viele Versuche. Bitte kurz warten und erneut versuchen.",
    "auth/network-request-failed": "Netzwerkfehler. Bitte Internetverbindung prüfen."
  };
  return map[err.code] || ("Fehler: " + err.message);
}

async function doLogin() {
  showAuthError(""); showAuthInfo("");
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;
  if (!email || !password) { showAuthError("Bitte E-Mail und Passwort eingeben."); return; }

  loginBtn.disabled = true; loginBtn.textContent = "Anmelden…";
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged übernimmt das Laden des Profils und den Bildschirmwechsel
  } catch (err) {
    showAuthError(authErrorMessage(err));
  } finally {
    loginBtn.disabled = false; loginBtn.textContent = "Anmelden";
  }
}

async function doRegister() {
  showAuthError(""); showAuthInfo("");
  const email = registerEmailInput.value.trim();
  const password = registerPasswordInput.value;
  const passwordRepeat = registerPasswordRepeatInput.value;

  if (!email || !password) { showAuthError("Bitte E-Mail und Passwort eingeben."); return; }
  if (password.length < 6) { showAuthError("Das Passwort muss mindestens 6 Zeichen lang sein."); return; }
  if (password !== passwordRepeat) { showAuthError("Die Passwörter stimmen nicht überein."); return; }
  if (!selectedRegisterRolle) { showAuthError("Bitte eine Rolle auswählen."); return; }

  registerBtn.disabled = true; registerBtn.textContent = "Konto wird erstellt…";
  authFlowInProgress = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "benutzer", cred.user.uid), {
      email, rolle: selectedRegisterRolle, erstellt: serverTimestamp()
    });
    // Nicht auf onAuthStateChanged warten (Race Condition: das Profil-Dokument
    // könnte dort noch nicht sichtbar sein) – Profil direkt selbst setzen.
    currentUser = { uid: cred.user.uid, email: cred.user.email, rolle: selectedRegisterRolle };
    showSetupScreenLoggedIn();
  } catch (err) {
    showAuthError(authErrorMessage(err));
  } finally {
    registerBtn.disabled = false; registerBtn.textContent = "Konto erstellen";
    authFlowInProgress = false;
  }
}

async function doPasswordReset() {
  showAuthError(""); showAuthInfo("");
  const email = loginEmailInput.value.trim();
  if (!email) { showAuthError("Bitte zuerst deine E-Mail-Adresse im Feld oben eingeben."); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    showAuthInfo("Falls ein Konto mit dieser E-Mail existiert, wurde eine E-Mail zum Zurücksetzen verschickt.");
  } catch (err) {
    showAuthError(authErrorMessage(err));
  }
}

async function doLogout() {
  try {
    if (unsubDoc) { unsubDoc(); unsubDoc = null; }
    if (unsubActivity) { unsubActivity(); unsubActivity = null; }
    if (unsubHistory) { unsubHistory(); unsubHistory = null; }
    if (unsubSetupList) { unsubSetupList(); unsubSetupList = null; }
    docRef = null; currentTripData = null; session = null;
    await signOut(auth);
  } catch (err) {
    showToast("Fehler beim Abmelden: " + err.message);
  }
}

async function loadUserProfile(user) {
  try {
    const ref = doc(db, "benutzer", user.uid);
    const snap = await getDoc(ref);
    const rolle = snap.exists() && snap.data().rolle === "bearbeiter" ? "bearbeiter" : "betrachter";
    currentUser = { uid: user.uid, email: user.email, rolle };
    showSetupScreenLoggedIn();
  } catch (err) {
    showAuthError("Profil konnte nicht geladen werden: " + err.message);
    showAuthScreen();
  }
}

function showAuthScreen() {
  authScreen.classList.remove("hidden");
  setupScreen.classList.add("hidden");
  appScreen.classList.add("hidden");
  viewerScreen.classList.add("hidden");
}

function showSetupScreenLoggedIn() {
  authScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
  loginPasswordInput.value = "";
  registerPasswordInput.value = ""; registerPasswordRepeatInput.value = "";
  showAuthError(""); showAuthInfo("");
  applyRolleUI();

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { /* ignore */ }
  if (saved?.kasse) kasseInput.value = saved.kasse;

  subscribeToExistingTrips();
}

function applyRolleUI() {
  const istBetrachter = currentUser?.rolle === "betrachter";
  accountLabel.textContent = `${currentUser?.email || ""} · ${istBetrachter ? "Betrachter 🔍" : "Bearbeiter"}`;
  // Betrachter legen keine neuen Fahrten an, nur bestehende ansehen
  newTripDivider.classList.toggle("hidden", istBetrachter);
  toggleNewTripBtn.classList.toggle("hidden", istBetrachter);
  if (istBetrachter) setNewTripVisible(false);
}

onAuthStateChanged(auth, (user) => {
  if (authFlowInProgress) return; // doRegister behandelt den Profil-Aufbau selbst
  if (user) {
    loadUserProfile(user);
  } else {
    currentUser = null;
    if (unsubDoc) { unsubDoc(); unsubDoc = null; }
    if (unsubActivity) { unsubActivity(); unsubActivity = null; }
    if (unsubHistory) { unsubHistory(); unsubHistory = null; }
    if (unsubSetupList) { unsubSetupList(); unsubSetupList = null; }
    docRef = null; currentTripData = null; session = null;
    showAuthScreen();
  }
});

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

// ---------------------------------------------------------
// Nachträgliche Wagen-/Sitzplatz-Bearbeitung (im laufenden Betrieb)
// ---------------------------------------------------------
function openWagenEdit() {
  if (!currentTripData) return;
  selectedWagenEdit = new Set(Array.isArray(currentTripData.wagen) ? currentTripData.wagen : []);
  const summeAusWagen = WAGEN.filter((w) => selectedWagenEdit.has(w.id)).reduce((s, w) => s + w.sitzplaetze, 0);
  const aktuelleSitzplaetze = clamp0(currentTripData.sitzplaetze);

  renderWagenEditGrid();

  if (selectedWagenEdit.size === 0 || summeAusWagen !== aktuelleSitzplaetze) {
    // Aktuelle Sitzplatzzahl lässt sich nicht (mehr) aus den Wagen ableiten -> als Override anzeigen
    seatEditOverrideField.classList.remove("hidden");
    toggleSeatEditOverrideBtn.textContent = "abweichende Gesamtzahl ausblenden";
    sitzplaetzeEditOverrideInput.value = aktuelleSitzplaetze || "";
  } else {
    seatEditOverrideField.classList.add("hidden");
    toggleSeatEditOverrideBtn.textContent = "abweichende Gesamtzahl…";
    sitzplaetzeEditOverrideInput.value = "";
  }
  updateWagenEditTotal();
  wagenEditOverlay.classList.remove("hidden");
}

function closeWagenEdit() { wagenEditOverlay.classList.add("hidden"); }

function renderWagenEditGrid() {
  wagenEditGrid.innerHTML = "";
  WAGEN.forEach((w) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "wagen-tile" + (selectedWagenEdit.has(w.id) ? " selected" : "");
    tile.innerHTML = `
      <span class="wagen-check">✓</span>
      <img class="wagen-img" src="${w.bild}" alt="${escapeHtml(w.name)}">
      <span class="wagen-name">${escapeHtml(w.name)}</span>
      <span class="wagen-seats">${w.sitzplaetze} Plätze</span>
    `;
    tile.addEventListener("click", () => {
      if (selectedWagenEdit.has(w.id)) selectedWagenEdit.delete(w.id);
      else selectedWagenEdit.add(w.id);
      tile.classList.toggle("selected", selectedWagenEdit.has(w.id));
      updateWagenEditTotal();
    });
    wagenEditGrid.appendChild(tile);
  });
}

function updateWagenEditTotal() {
  const overrideVal = parseInt(sitzplaetzeEditOverrideInput.value, 10);
  let total;
  if (!seatEditOverrideField.classList.contains("hidden") && overrideVal > 0) {
    total = overrideVal;
  } else {
    total = WAGEN.filter((w) => selectedWagenEdit.has(w.id)).reduce((sum, w) => sum + w.sitzplaetze, 0);
  }
  wagenEditTotalSeatsEl.textContent = total;
  return total;
}

async function saveWagenEdit() {
  const neueSitzplaetze = updateWagenEditTotal();
  if (!neueSitzplaetze || neueSitzplaetze < 1) {
    showToast("Bitte mindestens einen Wagen auswählen oder eine abweichende Zahl eintragen.");
    return;
  }
  const bisherige = clamp0(currentTripData?.sitzplaetze);
  const wagenAuswahl = Array.from(selectedWagenEdit);

  closeWagenEdit();
  openDoubleConfirm(
    `Sitzplatzanzahl von ${bisherige} auf ${neueSitzplaetze} ändern?`,
    `Wirklich sicher? Diese Änderung gilt sofort für alle Kassen dieser Fahrt.`,
    async () => {
      try {
        await updateDoc(docRef, { sitzplaetze: neueSitzplaetze, wagen: wagenAuswahl, aktualisiert: serverTimestamp() });
        showToast("Sitzplatzanzahl aktualisiert.");
      } catch (err) {
        showToast("Fehler: " + err.message);
      }
    },
    "Ja, ändern"
  );
}

function subscribeToExistingTrips() {
  existingTripsList.innerHTML = '<p class="trip-empty">Lade Fahrten…</p>';
  const q = query(collection(db, "fahrten"), orderBy("fahrtag", "desc"), limit(15));
  unsubSetupList = onSnapshot(q, renderExistingTrips, () => {
    existingTripsList.innerHTML = '<p class="trip-empty">Fahrten konnten nicht geladen werden.</p>';
  });
}

function renderExistingTrips(snap) {
  if (snap.empty) {
    existingTripsList.innerHTML = '<p class="trip-empty">Noch keine Fahrten angelegt.</p>';
    if (currentUser?.rolle !== "betrachter") setNewTripVisible(true);
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
    item.appendChild(joinBtn);

    if (currentUser?.rolle !== "betrachter") {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "trip-item-delete";
      delBtn.setAttribute("aria-label", "Fahrt löschen");
      delBtn.textContent = "🗑";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        confirmDeleteFahrt(docSnap.id, d);
      });
      item.appendChild(delBtn);
    }

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
    session = { fahrtag: data.fahrtag, standort: data.standort, kasse, sitzplaetze: clamp0(data.sitzplaetze), rolle: currentUser.rolle };
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

    session = { fahrtag, standort: selectedStandort, kasse, sitzplaetze, rolle: currentUser.rolle };
    docRef = ref;
    localStorage.setItem(LS_KEY, JSON.stringify({ kasse }));
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

  if (session.rolle === "betrachter") {
    appScreen.classList.add("hidden");
    viewerScreen.classList.remove("hidden");
    viewerFahrtagLabel.textContent = formatDateDE(session.fahrtag);
    viewerStandortLabel.textContent = STANDORT_LABEL[session.standort] || session.standort;
  } else {
    viewerScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    fahrtagLabel.textContent = formatDateDE(session.fahrtag);
    standortLabel.textContent = STANDORT_LABEL[session.standort] || session.standort;
    kasseLabel.textContent = session.kasse;
    subscribeToActivity();
    subscribeToHistory();
  }

  subscribeToTrip();
}

function leaveApp() {
  if (unsubDoc) unsubDoc();
  if (unsubActivity) unsubActivity();
  if (unsubHistory) unsubHistory();
  docRef = null;
  currentTripData = null;
  appScreen.classList.add("hidden");
  viewerScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
  showSetupError(""); showSetupInfo("");
  fahrtagInput.value = session?.fahrtag || todayISO();
  if (session?.standort) selectStandort(session.standort);
  kasseInput.value = session?.kasse || "";
  applyRolleUI();
  selectedWagen = new Set();
  seatOverrideField.classList.add("hidden");
  sitzplaetzeOverrideInput.value = "";
  toggleSeatOverrideBtn.textContent = "abweichende Gesamtzahl…";
  renderWagenGrid();
  setNewTripVisible(false);
  subscribeToExistingTrips();
}

function warningLevelInfo(pct, free) {
  if (free < 0 || pct >= 1) return { level: "100", text: "Nur noch Stehplätze" };
  if (pct >= 0.75) return { level: "75", text: "≥ 75 % belegt" };
  if (pct >= 0.5) return { level: "50", text: "≥ 50 % belegt" };
  return { level: "0", text: "" };
}

function applyWarningClasses(el, level) {
  el.classList.remove("level-50", "level-75", "level-100");
  if (level !== "0") el.classList.add("level-" + level);
}

function subscribeToTrip() {
  const setStatus = session.rolle === "betrachter"
    ? (state) => applyConnStatus(viewerConnStatus, state)
    : (state) => applyConnStatus(connStatus, state);

  setStatus("connecting");
  unsubDoc = onSnapshot(docRef, (snap) => {
    setStatus(snap.metadata.fromCache ? "offline" : "online");
    if (!snap.exists()) return;
    const d = snap.data();
    currentTripData = d;
    // "einzel" fasst die neue Einzelperson-Kategorie plus alte erwachsene/kinder
    // (falls diese Fahrt noch mit der Vorgängerversion gezählt wurde) zusammen.
    const einzel = clamp0(d.einzelperson) + clamp0(d.erwachsene) + clamp0(d.kinder);
    const fam = clamp0(d.familien), grp = clamp0(d.gruppen);
    const total = computeTotal(d);
    const seats = clamp0(d.sitzplaetze);
    const free = seats - total;
    const pct = seats > 0 ? total / seats : 0;
    const info = warningLevelInfo(pct, free);

    if (session.rolle === "betrachter") {
      viewerOccupiedEl.textContent = total;
      viewerTotalSeatsEl.textContent = seats;
      viewerFreeEl.textContent = free;
      viewerFreeLabel.textContent = free < 0 ? "Überbucht" : "Frei";
      applyWarningClasses(viewerScreen, info.level);
      if (info.text) { viewerWarning.textContent = info.text; viewerWarning.classList.remove("hidden"); }
      else viewerWarning.classList.add("hidden");
    } else {
      countEinzelperson.textContent = einzel;
      countFamilien.textContent = fam;
      countGruppen.textContent = grp;
      totalTodayEl.textContent = total;
      seatsTotalEl.textContent = seats;
      seatsFreeEl.textContent = free;
      seatsFreeLabel.textContent = free < 0 ? "überbucht" : "frei";
      applyWarningClasses(seatsBanner, info.level);
      if (info.text) { seatsWarningBadge.textContent = info.text; seatsWarningBadge.classList.remove("hidden"); }
      else seatsWarningBadge.classList.add("hidden");
    }
  }, (err) => {
    setStatus("offline");
    showToast("Verbindungsfehler: " + err.message);
  });
}

function applyConnStatus(el, state) {
  el.className = "conn-status conn-" + state;
  el.textContent = state === "online" ? "live verbunden" : state === "offline" ? "keine Verbindung" : "verbinde…";
}
function setConnStatus(state) { applyConnStatus(connStatus, state); }

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

// Fragt zweimal nacheinander nach, für besonders folgenreiche Aktionen.
function openDoubleConfirm(text1, text2, onOk, okLabel = "Ja") {
  openConfirm(text1, () => {
    openConfirm(text2, onOk, okLabel);
  }, "Weiter");
}

async function resetTrip() {
  if (!docRef) return;
  try {
    await updateDoc(docRef, {
      einzelperson: 0, erwachsene: 0, kinder: 0, familien: 0, gruppen: 0, aktualisiert: serverTimestamp()
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

function openEntfernenNumpad(kategorie, label, countEl) {
  openNumpad(`${label} entfernen`, 0, (n) => {
    const aktuell = parseInt(countEl.textContent, 10) || 0;
    const menge = Math.min(n, aktuell);
    if (menge <= 0) { showToast("Niemand zum Entfernen vorhanden."); return; }
    addFahrgaeste(kategorie, -menge);
  });
}
minusEinzelperson.addEventListener("click", (e) => {
  e.stopPropagation();
  openEntfernenNumpad("einzelperson", "Einzelpersonen", countEinzelperson);
});
minusFamilien.addEventListener("click", (e) => {
  e.stopPropagation();
  openEntfernenNumpad("familien", "Personen aus Familie", countFamilien);
});
minusGruppen.addEventListener("click", (e) => {
  e.stopPropagation();
  openEntfernenNumpad("gruppen", "Personen aus Gruppe", countGruppen);
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
  openDoubleConfirm(
    "Zählung dieser Fahrt wirklich auf 0 zurücksetzen? Die Sitzplatzanzahl bleibt erhalten.",
    "Wirklich sicher? Alle bisherigen Zählungen dieser Fahrt gehen dabei unwiderruflich verloren.",
    resetTrip,
    "Ja, zurücksetzen"
  );
});
exportCsvBtn.addEventListener("click", exportCsv);
changeSessionBtn.addEventListener("click", leaveApp);
viewerChangeSessionBtn.addEventListener("click", leaveApp);

editSeatsBtn.addEventListener("click", openWagenEdit);
wagenEditCancel.addEventListener("click", closeWagenEdit);
wagenEditSave.addEventListener("click", saveWagenEdit);
toggleSeatEditOverrideBtn.addEventListener("click", () => {
  const visible = seatEditOverrideField.classList.toggle("hidden") === false;
  toggleSeatEditOverrideBtn.textContent = visible ? "abweichende Gesamtzahl ausblenden" : "abweichende Gesamtzahl…";
  if (!visible) sitzplaetzeEditOverrideInput.value = "";
  updateWagenEditTotal();
});
sitzplaetzeEditOverrideInput.addEventListener("input", updateWagenEditTotal);

window.addEventListener("online", () => { if (docRef) subscribeToTrip(); });
window.addEventListener("offline", () => {
  if (session?.rolle === "betrachter") applyConnStatus(viewerConnStatus, "offline");
  else applyConnStatus(connStatus, "offline");
});

// ---------------------------------------------------------
// Start
// ---------------------------------------------------------
initAuthScreen();
initSetupScreen();
