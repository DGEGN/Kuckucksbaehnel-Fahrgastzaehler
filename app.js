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
  signInWithEmailAndPassword, signInAnonymously, signOut, sendPasswordResetEmail
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

// currentUser wird beim Anmelden/Registrieren/Betrachter-Einstieg gesetzt,
// siehe Abschnitt "ANMELDUNG / REGISTRIERUNG". firebaseUser hält lediglich
// das zuletzt bekannte Firebase-Auth-Objekt nach, um beim Klick auf
// "Bearbeiter" zu prüfen, ob schon eine echte Anmeldung besteht.
let currentUser = null; // { uid, email, rolle }
let firebaseUser = null;

// Nur Konten mit dieser E-Mail-Domain dürfen sich als Bearbeiter registrieren.
// Hinweis: Das ist zusätzlich in firestore.rules serverseitig abgesichert –
// diese Prüfung hier ist nur für eine freundliche Fehlermeldung im Browser.
const ALLOWED_EMAIL_DOMAIN = "eisenbahnmuseum-neustadt.de";
function isAllowedEmailDomain(email) {
  return email.toLowerCase().endsWith("@" + ALLOWED_EMAIL_DOMAIN);
}

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
const STANDORT_LABEL = { neustadt: "Neustadt", lambrecht: "Lambrecht", elmstein: "Elmstein" };
const ZUG_LABEL = { d3: "D3", d4: "D4", d5: "D5", d6: "D6", sonderzug: "Sonderzug" };
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
// Wird live aus der Firestore-Collection "wagen" geladen (siehe
// subscribeToWagenKatalog). Admins pflegen die Wagen im Admin-Bereich der
// App (Name, Sitzplätze, Bild) – kein Code-Eingriff mehr nötig.
// ---------------------------------------------------------
let WAGEN = [];
let unsubWagenKatalog = null;
let editingWagenId = null; // null = Neuanlage im Admin-Bereich, sonst Bearbeiten-Modus
let selectedWagen = new Set();

// ---------------------------------------------------------
// DOM-Referenzen
// ---------------------------------------------------------
const el = (id) => document.getElementById(id);

const roleChoiceScreen = el("roleChoice");
const chooseBearbeiterBtn = el("chooseBearbeiter");
const chooseBetrachterBtn = el("chooseBetrachter");
const roleChoiceError = el("roleChoiceError");

const authScreen = el("auth");
const authModeGroup = el("authModeGroup");
const authBackBtn = el("authBack");
const loginFormEl = el("loginForm");
const registerFormEl = el("registerForm");
const loginEmailInput = el("loginEmail");
const loginPasswordInput = el("loginPassword");
const loginBtn = el("loginBtn");
const forgotPasswordBtn = el("forgotPasswordBtn");
const registerEmailInput = el("registerEmail");
const registerPasswordInput = el("registerPassword");
const registerPasswordRepeatInput = el("registerPasswordRepeat");
const registerBtn = el("registerBtn");
const authInfo = el("authInfo");
const authError = el("authError");

const pendingScreen = el("pending");
const pendingEmailEl = el("pendingEmail");
const pendingRefreshBtn = el("pendingRefreshBtn");
const pendingGuestBtn = el("pendingGuestBtn");
const pendingLogoutBtn = el("pendingLogoutBtn");
const pendingInfo = el("pendingInfo");

const adminScreen = el("admin");
const adminList = el("adminList");
const adminBackBtn = el("adminBack");
const openAdminBtn = el("openAdmin");
const adminWagenList = el("adminWagenList");
const adminWagenNameInput = el("adminWagenName");
const adminWagenSitzplaetzeInput = el("adminWagenSitzplaetze");
const adminWagenFileInput = el("adminWagenBild");
const adminWagenFileNameEl = el("adminWagenFileName");
const adminWagenSaveBtn = el("adminWagenSaveBtn");
const adminWagenCancelBtn = el("adminWagenCancelBtn");
const adminWagenInfo = el("adminWagenInfo");
const adminWagenError = el("adminWagenError");

const impressumOverlay = el("impressumOverlay");
const impressumCloseBtn = el("impressumClose");
const fullOverlay = el("fullOverlay");
const fullOverlayCloseBtn = el("fullOverlayClose");
const openImpressumBtns = document.querySelectorAll(".open-impressum-link");

const setupScreen = el("setup");
const appScreen = el("app");
const viewerScreen = el("viewer");
const accountRow = el("accountRow");
const accountEmail = el("accountEmail");
const logoutBtn = el("logoutBtn");
const logoutBtnApp = el("logoutBtnApp");
const setupBackToRoleBtn = el("setupBackToRole");
const fahrtagInput = el("fahrtag");
const zugGroup = el("zugGroup");
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
const zugLabel = el("zugLabel");
const standortLabel = el("standortLabel");
const kasseLabel = el("kasseLabel");
const changeSessionBtn = el("changeSession");
const previewViewerBtn = el("previewViewerBtn");
const connStatus = el("connStatus");

const seatsBanner = el("seatsBanner");
const totalTodayEl = el("totalToday");
const seatsTotalEl = el("seatsTotal");
const seatsFreeEl = el("seatsFree");
const seatsFreeLabel = el("seatsFreeLabel");
const seatsReservedEl = el("seatsReserved");
const seatsWarningBadge = el("seatsWarningBadge");
const editSeatsBtn = el("editSeatsBtn");
const reservationsList = el("reservationsList");
const reservationNameInput = el("reservationName");
const reservationAnzahlInput = el("reservationAnzahl");
const reservationAddBtn = el("reservationAdd");
const newTripReservationsList = el("newTripReservationsList");
const newTripResNameInput = el("newTripResName");
const newTripResAnzahlInput = el("newTripResAnzahl");
const newTripResAddBtn = el("newTripResAdd");
const viewerReservedEl = el("viewerReserved");

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
const backToEditorBtn = el("backToEditorBtn");
const viewerFahrtagLabel = el("viewerFahrtagLabel");
const viewerZugLabel = el("viewerZugLabel");
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
let selectedZug = null;
let pendingGruppe = 1;
let numpadValue = "";
let numpadOnConfirm = null;
let latestHistoryRows = [];
let currentTripData = null;   // letzter bekannter Snapshot-Inhalt der aktiven Fahrt
let unsubReservierungen = null;
let currentReservations = [];   // vorreservierte Gruppen der aktiven Fahrt
let reservedSum = 0;            // Summe der noch nicht bestätigten Reservierungen
let pendingNewTripReservations = []; // Reservierungen, die beim Anlegen einer neuen Fahrt gesammelt werden
let selectedWagenEdit = new Set();
let unsubAdminList = null;
let lastWarnLevel = null; // verfolgt die zuletzt gesehene Belegungsstufe dieser Fahrt
// Welcher Bildschirm gerade angezeigt wird ("bearbeiter" | "betrachter").
// Kann während einer aktiven Sitzung vom eigentlichen session.rolle abweichen,
// wenn ein Bearbeiter kurz in die Betrachter-Vorschau wechselt.
let displayMode = null;

// ===========================================================
// ROLLENWAHL / ANMELDUNG / REGISTRIERUNG
// ===========================================================
function initAuthScreen() {
  chooseBearbeiterBtn.addEventListener("click", onChooseBearbeiter);
  chooseBetrachterBtn.addEventListener("click", onChooseBetrachter);
  authBackBtn.addEventListener("click", () => showOnly(roleChoiceScreen));
  setupBackToRoleBtn.addEventListener("click", () => showOnly(roleChoiceScreen));

  authModeGroup.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => setAuthMode(btn.dataset.mode));
  });
  loginBtn.addEventListener("click", doLogin);
  registerBtn.addEventListener("click", doRegister);
  forgotPasswordBtn.addEventListener("click", doPasswordReset);
  logoutBtn.addEventListener("click", doLogout);
  logoutBtnApp.addEventListener("click", doLogout);

  pendingRefreshBtn.addEventListener("click", () => {
    if (firebaseUser) checkApprovalAndEnter(firebaseUser);
  });
  pendingGuestBtn.addEventListener("click", viewAsBetrachterWhilePending);
  pendingLogoutBtn.addEventListener("click", doLogout);

  openAdminBtn.addEventListener("click", openAdminPanel);
  adminBackBtn.addEventListener("click", closeAdminPanel);
  adminWagenSaveBtn.addEventListener("click", saveWagenForm);
  adminWagenCancelBtn.addEventListener("click", cancelEditWagen);
  adminWagenFileInput.addEventListener("change", () => {
    adminWagenFileNameEl.textContent = adminWagenFileInput.files[0]?.name || "";
  });

  openImpressumBtns.forEach((btn) => btn.addEventListener("click", () => impressumOverlay.classList.remove("hidden")));
  impressumCloseBtn.addEventListener("click", () => impressumOverlay.classList.add("hidden"));
  fullOverlayCloseBtn.addEventListener("click", () => fullOverlay.classList.add("hidden"));

  onAuthStateChanged(auth, (user) => { firebaseUser = user; });
}

// Zeigt genau einen der Hauptbildschirme, versteckt alle anderen.
function showOnly(target) {
  [roleChoiceScreen, authScreen, pendingScreen, setupScreen, adminScreen, appScreen, viewerScreen].forEach((s) => {
    s.classList.toggle("hidden", s !== target);
  });
  if (target === roleChoiceScreen) { roleChoiceError.textContent = ""; }
}

async function onChooseBearbeiter() {
  roleChoiceError.textContent = "";
  if (firebaseUser && !firebaseUser.isAnonymous) {
    chooseBearbeiterBtn.disabled = true;
    try {
      await checkApprovalAndEnter(firebaseUser);
    } finally {
      chooseBearbeiterBtn.disabled = false;
    }
  } else {
    showAuthError(""); showAuthInfo("");
    setAuthMode("login");
    showOnly(authScreen);
  }
}

// Prüft, ob das Konto von einem Admin freigeschaltet wurde, und zeigt
// je nach Ergebnis den Setup- oder den Warte-auf-Freigabe-Screen.
async function checkApprovalAndEnter(user) {
  try {
    const snap = await getDoc(doc(db, "benutzer", user.uid));
    const freigegeben = snap.exists() && snap.data().freigegeben === true;
    if (freigegeben) {
      currentUser = { uid: user.uid, email: user.email, rolle: "bearbeiter" };
      enterSetupForRole("bearbeiter");
    } else {
      showPendingScreen(user.email);
    }
  } catch (err) {
    roleChoiceError.textContent = "Fehler beim Prüfen des Kontos: " + err.message;
  }
}

function showPendingScreen(email) {
  pendingEmailEl.textContent = email || "";
  pendingInfo.textContent = "";
  showOnly(pendingScreen);
}

function viewAsBetrachterWhilePending() {
  if (!firebaseUser) return;
  currentUser = { uid: firebaseUser.uid, email: firebaseUser.isAnonymous ? null : firebaseUser.email, rolle: "betrachter" };
  enterSetupForRole("betrachter");
}

async function onChooseBetrachter() {
  roleChoiceError.textContent = "";
  chooseBetrachterBtn.disabled = true;
  try {
    const user = auth.currentUser || (await signInAnonymously(auth)).user;
    currentUser = { uid: user.uid, email: user.isAnonymous ? null : user.email, rolle: "betrachter" };
    enterSetupForRole("betrachter");
  } catch (err) {
    roleChoiceError.textContent = "Verbindung fehlgeschlagen: " + err.message;
  } finally {
    chooseBetrachterBtn.disabled = false;
  }
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
    const cred = await signInWithEmailAndPassword(auth, email, password);
    firebaseUser = cred.user;
    await checkApprovalAndEnter(cred.user);
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
  if (!isAllowedEmailDomain(email)) {
    showAuthError(`Registrierung ist nur mit einer @${ALLOWED_EMAIL_DOMAIN}-E-Mail-Adresse möglich.`);
    return;
  }
  if (password.length < 6) { showAuthError("Das Passwort muss mindestens 6 Zeichen lang sein."); return; }
  if (password !== passwordRepeat) { showAuthError("Die Passwörter stimmen nicht überein."); return; }

  registerBtn.disabled = true; registerBtn.textContent = "Konto wird erstellt…";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    firebaseUser = cred.user;
    await setDoc(doc(db, "benutzer", cred.user.uid), {
      email: cred.user.email,
      freigegeben: false,
      erstellt: serverTimestamp()
    });
    showPendingScreen(cred.user.email);
  } catch (err) {
    showAuthError(authErrorMessage(err));
  } finally {
    registerBtn.disabled = false; registerBtn.textContent = "Konto erstellen";
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
    if (unsubAdminList) { unsubAdminList(); unsubAdminList = null; }
    if (unsubReservierungen) { unsubReservierungen(); unsubReservierungen = null; }
    if (unsubWagenKatalog) { unsubWagenKatalog(); unsubWagenKatalog = null; }
    docRef = null; currentTripData = null; session = null; currentUser = null;
    currentReservations = []; reservedSum = 0; WAGEN = [];
    fullOverlay.classList.add("hidden");
    await signOut(auth);
    showOnly(roleChoiceScreen);
  } catch (err) {
    showToast("Fehler beim Abmelden: " + err.message);
  }
}

// ---------------------------------------------------------
// Admin-Bereich (Bearbeiter-Konten freigeben)
// ---------------------------------------------------------
async function checkAdminStatus() {
  if (!currentUser || currentUser.rolle !== "bearbeiter") {
    openAdminBtn.classList.add("hidden");
    return;
  }
  try {
    const snap = await getDoc(doc(db, "admins", currentUser.uid));
    currentUser.istAdmin = snap.exists();
  } catch (e) {
    currentUser.istAdmin = false;
  }
  openAdminBtn.classList.toggle("hidden", !currentUser.istAdmin);
}

function openAdminPanel() {
  showOnly(adminScreen);
  adminList.innerHTML = '<p class="trip-empty">Lade Konten…</p>';
  const q = query(collection(db, "benutzer"));
  unsubAdminList = onSnapshot(q, renderAdminList, () => {
    adminList.innerHTML = '<p class="trip-empty">Konten konnten nicht geladen werden.</p>';
  });
  cancelEditWagen();
  renderAdminWagenList();
}

function closeAdminPanel() {
  if (unsubAdminList) { unsubAdminList(); unsubAdminList = null; }
  cancelEditWagen();
  showOnly(setupScreen);
}

function renderAdminList(snap) {
  const pending = [];
  const approved = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    (data.freigegeben ? approved : pending).push({ id: docSnap.id, email: data.email || "(unbekannt)" });
  });

  let html = `<h2 class="trip-heading">Warten auf Freigabe (${pending.length})</h2>`;
  if (!pending.length) {
    html += `<p class="trip-empty">Keine offenen Anfragen.</p>`;
  } else {
    html += `<div class="admin-list">` + pending.map((u) => `
      <div class="admin-item">
        <span class="admin-email">${escapeHtml(u.email)}</span>
        <button type="button" class="btn btn-brass btn-small" data-approve="${u.id}">Freigeben</button>
      </div>`).join("") + `</div>`;
  }

  html += `<h2 class="trip-heading admin-approved-heading">Freigegebene Bearbeiter (${approved.length})</h2>`;
  if (!approved.length) {
    html += `<p class="trip-empty">Noch niemand freigegeben.</p>`;
  } else {
    html += `<div class="admin-list">` + approved.map((u) => `
      <div class="admin-item">
        <span class="admin-email">${escapeHtml(u.email)}</span>
        <button type="button" class="btn btn-danger-outline btn-small" data-revoke="${u.id}">Sperren</button>
      </div>`).join("") + `</div>`;
  }

  adminList.innerHTML = html;
  adminList.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", () => setFreigabe(btn.dataset.approve, true));
  });
  adminList.querySelectorAll("[data-revoke]").forEach((btn) => {
    btn.addEventListener("click", () => setFreigabe(btn.dataset.revoke, false));
  });
}

async function setFreigabe(uid, wert) {
  try {
    await updateDoc(doc(db, "benutzer", uid), { freigegeben: wert, aktualisiert: serverTimestamp() });
    showToast(wert ? "Konto freigegeben." : "Konto gesperrt.");
  } catch (err) {
    showToast("Fehler: " + err.message);
  }
}

// ---------------------------------------------------------
// Wagen-Katalog verwalten (Admin-Bereich)
// ---------------------------------------------------------
function subscribeToWagenKatalog() {
  const q = query(collection(db, "wagen"), orderBy("erstellt", "asc"));
  unsubWagenKatalog = onSnapshot(q, (snap) => {
    WAGEN = [];
    snap.forEach((docSnap) => WAGEN.push({ id: docSnap.id, ...docSnap.data() }));
    renderWagenGrid();
    if (!adminScreen.classList.contains("hidden")) renderAdminWagenList();
  }, () => {
    showToast("Wagen-Katalog konnte nicht geladen werden.");
  });
}

function renderAdminWagenList() {
  if (!WAGEN.length) {
    adminWagenList.innerHTML = '<p class="trip-empty">Noch keine Wagen angelegt.</p>';
    return;
  }
  adminWagenList.innerHTML = "";
  WAGEN.forEach((w) => {
    const item = document.createElement("div");
    item.className = "admin-wagen-item";
    item.innerHTML = `
      <img src="${w.bild}" class="admin-wagen-thumb" alt="${escapeHtml(w.name)}">
      <div class="admin-wagen-meta">
        <span class="admin-wagen-name">${escapeHtml(w.name)}</span>
        <span class="admin-wagen-seats">${clamp0(w.sitzplaetze)} Plätze</span>
      </div>
      <button type="button" class="btn btn-ghost btn-small" data-edit-wagen="${w.id}">✏️</button>
      <button type="button" class="btn btn-danger-outline btn-small" data-delete-wagen="${w.id}">🗑</button>
    `;
    adminWagenList.appendChild(item);
  });
  adminWagenList.querySelectorAll("[data-edit-wagen]").forEach((btn) => {
    btn.addEventListener("click", () => startEditWagen(btn.dataset.editWagen));
  });
  adminWagenList.querySelectorAll("[data-delete-wagen]").forEach((btn) => {
    btn.addEventListener("click", () => deleteWagen(btn.dataset.deleteWagen));
  });
}

function startEditWagen(wagenId) {
  const w = WAGEN.find((x) => x.id === wagenId);
  if (!w) return;
  editingWagenId = wagenId;
  adminWagenNameInput.value = w.name;
  adminWagenSitzplaetzeInput.value = w.sitzplaetze;
  adminWagenFileInput.value = "";
  adminWagenFileNameEl.textContent = "Bild unverändert lassen oder neues Bild wählen";
  adminWagenSaveBtn.textContent = "Änderungen speichern";
  adminWagenCancelBtn.classList.remove("hidden");
  adminWagenError.textContent = ""; adminWagenInfo.textContent = "";
  adminWagenNameInput.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEditWagen() {
  editingWagenId = null;
  adminWagenNameInput.value = "";
  adminWagenSitzplaetzeInput.value = "";
  adminWagenFileInput.value = "";
  adminWagenFileNameEl.textContent = "";
  adminWagenSaveBtn.textContent = "+ Wagen hinzufügen";
  adminWagenCancelBtn.classList.add("hidden");
  adminWagenError.textContent = ""; adminWagenInfo.textContent = "";
}

function deleteWagen(wagenId) {
  openConfirm(
    "Diesen Wagen wirklich löschen? Falls er in bestehenden Fahrten verwendet wird, verschwindet er dort einfach aus der Auswahl.",
    async () => {
      try {
        await deleteDoc(doc(db, "wagen", wagenId));
        showToast("Wagen gelöscht.");
        if (editingWagenId === wagenId) cancelEditWagen();
      } catch (err) {
        showToast("Fehler: " + err.message);
      }
    },
    "Ja, löschen"
  );
}

// Verkleinert/komprimiert ein Bild im Browser (Canvas), damit es sicher
// als Base64-Data-URI in ein Firestore-Dokument passt (Limit ca. 1 MB).
function compressImageFile(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Datei ist kein gültiges Bild."));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function getCompressedWagenImage(file) {
  // Mehrere Qualitätsstufen probieren, bis das Ergebnis sicher unter dem
  // Firestore-Dokumentlimit liegt.
  const stufen = [[480, 0.72], [360, 0.6], [280, 0.5], [200, 0.4]];
  for (const [maxWidth, quality] of stufen) {
    const dataUrl = await compressImageFile(file, maxWidth, quality);
    if (dataUrl.length < 700000) return dataUrl;
  }
  throw new Error("Das Bild ist auch verkleinert noch zu groß. Bitte ein anderes Foto versuchen.");
}

async function saveWagenForm() {
  adminWagenError.textContent = ""; adminWagenInfo.textContent = "";
  const name = adminWagenNameInput.value.trim();
  const sitzplaetze = parseInt(adminWagenSitzplaetzeInput.value, 10);
  const file = adminWagenFileInput.files[0] || null;

  if (!name) { adminWagenError.textContent = "Bitte einen Namen eingeben."; return; }
  if (!sitzplaetze || sitzplaetze < 1) { adminWagenError.textContent = "Bitte eine gültige Sitzplatzzahl eingeben."; return; }
  if (!editingWagenId && !file) { adminWagenError.textContent = "Bitte ein Bild auswählen."; return; }

  const wasEditing = !!editingWagenId;
  adminWagenSaveBtn.disabled = true;
  adminWagenSaveBtn.textContent = wasEditing ? "Speichert…" : "Wird hinzugefügt…";
  try {
    let bild = null;
    if (file) bild = await getCompressedWagenImage(file);

    if (wasEditing) {
      const updateData = { name, sitzplaetze };
      if (bild) updateData.bild = bild;
      await updateDoc(doc(db, "wagen", editingWagenId), updateData);
      showToast("Wagen aktualisiert.");
    } else {
      await addDoc(collection(db, "wagen"), { name, sitzplaetze, bild, erstellt: serverTimestamp() });
      showToast("Wagen hinzugefügt.");
    }
    cancelEditWagen();
  } catch (err) {
    adminWagenError.textContent = "Fehler: " + err.message;
  } finally {
    adminWagenSaveBtn.disabled = false;
    adminWagenSaveBtn.textContent = wasEditing ? "Änderungen speichern" : "+ Wagen hinzufügen";
  }
}

// Wechselt vom Anmelde- bzw. Rollenwahl-Bildschirm in die Fahrtenliste.
function enterSetupForRole(rolle) {
  showOnly(setupScreen);
  loginPasswordInput.value = "";
  registerPasswordInput.value = ""; registerPasswordRepeatInput.value = "";
  showAuthError(""); showAuthInfo("");

  const istBearbeiter = rolle === "bearbeiter";
  accountRow.classList.toggle("hidden", !istBearbeiter);
  if (istBearbeiter) { accountEmail.textContent = currentUser?.email || ""; checkAdminStatus(); }
  else openAdminBtn.classList.add("hidden");

  // Betrachter legen keine neuen Fahrten an, nur bestehende ansehen
  newTripDivider.classList.toggle("hidden", !istBearbeiter);
  toggleNewTripBtn.classList.toggle("hidden", !istBearbeiter);
  if (!istBearbeiter) setNewTripVisible(false);

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { /* ignore */ }
  if (saved?.kasse) kasseInput.value = saved.kasse;
  if (saved?.standort) selectStandort(saved.standort);

  subscribeToExistingTrips();
  if (!unsubWagenKatalog) subscribeToWagenKatalog();
}

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

  zugGroup.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectZug(btn.dataset.zug));
  });

  renderWagenGrid();

  toggleSeatOverrideBtn.addEventListener("click", () => {
    const visible = seatOverrideField.classList.toggle("hidden") === false;
    toggleSeatOverrideBtn.textContent = visible ? "abweichende Gesamtzahl ausblenden" : "abweichende Gesamtzahl…";
    if (!visible) { sitzplaetzeOverrideInput.value = ""; updateWagenTotal(); }
  });
  sitzplaetzeOverrideInput.addEventListener("input", updateWagenTotal);

  renderNewTripReservations();
  newTripResAddBtn.addEventListener("click", addNewTripReservation);
  reservationAddBtn.addEventListener("click", addReservation);

  startBtn.addEventListener("click", startSession);
  toggleNewTripBtn.addEventListener("click", () => setNewTripVisible(!newTripVisible));
}

function setNewTripVisible(visible) {
  newTripVisible = visible;
  newTripForm.classList.toggle("hidden", !visible);
  toggleNewTripBtn.textContent = visible ? "Abbrechen" : "+ Neue Fahrt anlegen";
}

function renderWagenGrid() {
  if (!WAGEN.length) {
    wagenGrid.innerHTML = '<p class="trip-empty">Noch keine Wagen angelegt. Ein Admin kann sie im Admin-Bereich hinzufügen.</p>';
    updateWagenTotal();
    return;
  }
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
  if (!WAGEN.length) {
    wagenEditGrid.innerHTML = '<p class="trip-empty">Noch keine Wagen angelegt.</p>';
    return;
  }
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
        <span class="trip-item-standort">${ZUG_LABEL[d.zug] || d.zug}</span>
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
  const label = `${formatDateDE(data.fahrtag)} (${ZUG_LABEL[data.zug] || data.zug})`;
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
  if (!selectedStandort) { showSetupError("Bitte zuerst oben Neustadt oder Lambrecht auswählen."); return; }
  const kasse = kasseInput.value.trim() || "Kasse";
  try {
    session = {
      fahrtag: data.fahrtag, zug: data.zug, standort: selectedStandort, kasse,
      sitzplaetze: clamp0(data.sitzplaetze), rolle: currentUser.rolle
    };
    docRef = doc(db, "fahrten", docId);
    localStorage.setItem(LS_KEY, JSON.stringify({ kasse, standort: selectedStandort }));
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

function selectZug(value) {
  selectedZug = value;
  zugGroup.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.zug === value);
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

  if (!selectedStandort) { showSetupError("Bitte oben zuerst Neustadt oder Lambrecht auswählen."); return; }
  if (!fahrtag) { showSetupError("Bitte einen Fahrtag wählen."); return; }
  if (!selectedZug) { showSetupError("Bitte einen Zug auswählen (D3, D4, D5, D6 oder Sonderzug)."); return; }
  if (!sitzplaetze || sitzplaetze < 1) { showSetupError("Bitte mindestens einen Wagen auswählen oder eine abweichende Sitzplatzzahl eingeben."); return; }

  startBtn.disabled = true;
  startBtn.textContent = "Verbinde…";

  try {
    const docId = `${fahrtag}_${selectedZug}`;
    const ref = doc(db, "fahrten", docId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      if (data.sitzplaetze !== sitzplaetze || wagenAuswahl.length) {
        await updateDoc(ref, { sitzplaetze, wagen: wagenAuswahl, aktualisiert: serverTimestamp() });
      }
      showSetupInfo(`Fahrt gefunden – bisher ${computeTotal(data)} Fahrgäste gezählt (Neustadt + Lambrecht zusammen). Du zählst live mit.`);
    } else {
      await setDoc(ref, {
        fahrtag, zug: selectedZug, sitzplaetze, wagen: wagenAuswahl,
        einzelperson: 0, familien: 0, gruppen: 0,
        erstellt: serverTimestamp(), aktualisiert: serverTimestamp()
      });
    }

    if (pendingNewTripReservations.length) {
      await Promise.all(pendingNewTripReservations.map((r) =>
        addDoc(collection(ref, "reservierungen"), { name: r.name, anzahl: r.anzahl, erstellt: serverTimestamp() })
      ));
      pendingNewTripReservations = [];
      renderNewTripReservations();
    }

    session = { fahrtag, zug: selectedZug, standort: selectedStandort, kasse, sitzplaetze, rolle: currentUser.rolle };
    docRef = ref;
    localStorage.setItem(LS_KEY, JSON.stringify({ kasse, standort: selectedStandort }));
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
  resetFullAlertTracking();
  fullOverlay.classList.add("hidden");
  displayMode = session.rolle === "betrachter" ? "betrachter" : "bearbeiter";

  if (displayMode === "betrachter") {
    appScreen.classList.add("hidden");
    viewerScreen.classList.remove("hidden");
    viewerFahrtagLabel.textContent = formatDateDE(session.fahrtag);
    viewerZugLabel.textContent = ZUG_LABEL[session.zug] || session.zug;
    viewerStandortLabel.textContent = STANDORT_LABEL[session.standort] || session.standort;
    backToEditorBtn.classList.add("hidden");
  } else {
    viewerScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    fahrtagLabel.textContent = formatDateDE(session.fahrtag);
    zugLabel.textContent = ZUG_LABEL[session.zug] || session.zug;
    standortLabel.textContent = STANDORT_LABEL[session.standort] || session.standort;
    kasseLabel.textContent = session.kasse;
    subscribeToActivity();
    subscribeToHistory();
  }

  subscribeToTrip();
  subscribeToReservierungen();
}

// Wechselt innerhalb derselben Fahrt kurz in die große Betrachter-Anzeige,
// ohne die Bearbeiter-Sitzung zu verlassen (z. B. um die Auslastung von
// weitem zu prüfen). Über "Zur Zählansicht" geht es zurück.
function showViewerPreview() {
  if (!docRef || !session) return;
  displayMode = "betrachter";
  appScreen.classList.add("hidden");
  viewerScreen.classList.remove("hidden");
  viewerFahrtagLabel.textContent = formatDateDE(session.fahrtag);
  viewerZugLabel.textContent = ZUG_LABEL[session.zug] || session.zug;
  viewerStandortLabel.textContent = STANDORT_LABEL[session.standort] || session.standort;
  backToEditorBtn.classList.remove("hidden");
}

function backToEditorView() {
  if (session?.rolle !== "bearbeiter") return;
  displayMode = "bearbeiter";
  viewerScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
}

function leaveApp() {
  if (unsubDoc) unsubDoc();
  if (unsubActivity) unsubActivity();
  if (unsubHistory) unsubHistory();
  if (unsubReservierungen) { unsubReservierungen(); unsubReservierungen = null; }
  docRef = null;
  currentTripData = null;
  currentReservations = [];
  reservedSum = 0;
  pendingNewTripReservations = [];
  displayMode = null;
  backToEditorBtn.classList.add("hidden");
  fullOverlay.classList.add("hidden");
  showSetupError(""); showSetupInfo("");
  fahrtagInput.value = session?.fahrtag || todayISO();
  if (session?.standort) selectStandort(session.standort);
  kasseInput.value = session?.kasse || "";
  selectedWagen = new Set();
  selectedZug = null;
  zugGroup.querySelectorAll(".toggle-btn").forEach((btn) => btn.classList.remove("active"));
  seatOverrideField.classList.add("hidden");
  sitzplaetzeOverrideInput.value = "";
  toggleSeatOverrideBtn.textContent = "abweichende Gesamtzahl…";
  renderWagenGrid();
  renderNewTripReservations();
  setNewTripVisible(false);
  enterSetupForRole(currentUser?.rolle || "betrachter");
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

// ---------------------------------------------------------
// Vollbesetzt-Warnung (Popup + Ton bei 100 % Belegung)
// ---------------------------------------------------------
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [0, 0.22].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.26);
    });
  } catch (e) { /* Ton ist optional (z. B. Autoplay-Einschränkungen) – Fehler ignorieren */ }
}

function triggerFullAlert() {
  playAlertSound();
  fullOverlay.classList.remove("hidden");
}

// Wird beim Beitreten/Anlegen einer Fahrt zurückgesetzt, damit die Warnung
// pro Fahrt genau einmal beim Erreichen von 100 % auslöst.
function resetFullAlertTracking() { lastWarnLevel = null; }

function subscribeToTrip() {
  const setStatus = (state) => {
    applyConnStatus(displayMode === "betrachter" ? viewerConnStatus : connStatus, state);
  };

  setStatus("connecting");
  unsubDoc = onSnapshot(docRef, (snap) => {
    setStatus(snap.metadata.fromCache ? "offline" : "online");
    if (!snap.exists()) return;
    currentTripData = snap.data();
    renderCounts();
  }, (err) => {
    setStatus("offline");
    showToast("Verbindungsfehler: " + err.message);
  });
}

// Rendert Zähl-, Sitzplatz- und Warnanzeige aus currentTripData + reservedSum.
// Wird sowohl vom Fahrt-Listener als auch vom Reservierungs-Listener aufgerufen,
// damit beide Datenquellen konsistent zusammen berücksichtigt werden.
function renderCounts() {
  if (!currentTripData) return;
  const d = currentTripData;
  // "einzel" fasst die neue Einzelperson-Kategorie plus alte erwachsene/kinder
  // (falls diese Fahrt noch mit der Vorgängerversion gezählt wurde) zusammen.
  const einzel = clamp0(d.einzelperson) + clamp0(d.erwachsene) + clamp0(d.kinder);
  const fam = clamp0(d.familien), grp = clamp0(d.gruppen);
  const total = computeTotal(d);
  const seats = clamp0(d.sitzplaetze);
  const reserviert = reservedSum;
  // Reservierte Plätze gelten als "schon vergeben", auch bevor die Gruppe da ist.
  const free = seats - total - reserviert;
  const pct = seats > 0 ? (total + reserviert) / seats : 0;
  const info = warningLevelInfo(pct, free);

  if (info.level === "100" && lastWarnLevel !== "100") {
    triggerFullAlert();
  }
  lastWarnLevel = info.level;

  if (displayMode === "betrachter") {
    viewerOccupiedEl.textContent = total;
    viewerReservedEl.textContent = reserviert;
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
    seatsReservedEl.textContent = reserviert;
    seatsTotalEl.textContent = seats;
    seatsFreeEl.textContent = free;
    seatsFreeLabel.textContent = free < 0 ? "überbucht" : "frei";
    applyWarningClasses(seatsBanner, info.level);
    if (info.text) { seatsWarningBadge.textContent = info.text; seatsWarningBadge.classList.remove("hidden"); }
    else seatsWarningBadge.classList.add("hidden");
  }
}

function applyConnStatus(el, state) {
  el.className = "conn-status conn-" + state;
  el.textContent = state === "online" ? "live verbunden" : state === "offline" ? "keine Verbindung" : "verbinde…";
}

// ---------------------------------------------------------
// Vorreservierte Gruppen
// ---------------------------------------------------------
function subscribeToReservierungen() {
  const q = query(collection(docRef, "reservierungen"), orderBy("erstellt", "asc"));
  unsubReservierungen = onSnapshot(q, (snap) => {
    currentReservations = [];
    snap.forEach((docSnap) => currentReservations.push({ id: docSnap.id, ...docSnap.data() }));
    reservedSum = currentReservations.reduce((sum, r) => sum + clamp0(r.anzahl), 0);
    renderReservationsList();
    renderCounts();
  }, () => {
    reservationsList.innerHTML = '<li class="activity-empty">Reservierungen konnten nicht geladen werden.</li>';
  });
}

function renderReservationsList() {
  if (!currentReservations.length) {
    reservationsList.innerHTML = '<li class="activity-empty">Keine Reservierungen für diese Fahrt.</li>';
    return;
  }
  reservationsList.innerHTML = "";
  currentReservations.forEach((r) => {
    const li = document.createElement("li");
    li.className = "reservation-item";
    li.innerHTML = `
      <span class="reservation-name">${escapeHtml(r.name)}</span>
      <span class="reservation-anzahl">${clamp0(r.anzahl)} Pers.</span>
      <button type="button" class="btn btn-brass btn-small" data-confirm="${r.id}">✓ Angekommen</button>
      <button type="button" class="reservation-remove" data-remove="${r.id}" aria-label="Reservierung entfernen">✕</button>
    `;
    reservationsList.appendChild(li);
  });
  reservationsList.querySelectorAll("[data-confirm]").forEach((btn) => {
    btn.addEventListener("click", () => confirmReservation(btn.dataset.confirm));
  });
  reservationsList.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeReservation(btn.dataset.remove));
  });
}

async function confirmReservation(resId) {
  const res = currentReservations.find((r) => r.id === resId);
  if (!res || !docRef) return;
  try {
    await deleteDoc(doc(collection(docRef, "reservierungen"), resId));
    await addFahrgaeste("gruppen", clamp0(res.anzahl));
    showToast(`„${res.name}" bestätigt (+${res.anzahl} zur Gruppe).`);
  } catch (err) {
    showToast("Fehler: " + err.message);
  }
}

async function removeReservation(resId) {
  if (!docRef) return;
  try {
    await deleteDoc(doc(collection(docRef, "reservierungen"), resId));
  } catch (err) {
    showToast("Fehler: " + err.message);
  }
}

async function addReservation() {
  if (!docRef) return;
  const name = reservationNameInput.value.trim();
  const anzahl = parseInt(reservationAnzahlInput.value, 10);
  if (!name) { showToast("Bitte einen Gruppennamen eingeben."); return; }
  if (!anzahl || anzahl < 1) { showToast("Bitte eine gültige Personenzahl eingeben."); return; }
  try {
    await addDoc(collection(docRef, "reservierungen"), { name, anzahl, erstellt: serverTimestamp() });
    reservationNameInput.value = "";
    reservationAnzahlInput.value = "";
  } catch (err) {
    showToast("Fehler: " + err.message);
  }
}

// --- Vorreservierte Gruppen beim Anlegen einer NEUEN Fahrt (noch ohne docRef) ---
function renderNewTripReservations() {
  if (!pendingNewTripReservations.length) {
    newTripReservationsList.innerHTML = '<li class="activity-empty">Noch keine Reservierung hinzugefügt.</li>';
    return;
  }
  newTripReservationsList.innerHTML = "";
  pendingNewTripReservations.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = "reservation-item";
    li.innerHTML = `
      <span class="reservation-name">${escapeHtml(r.name)}</span>
      <span class="reservation-anzahl">${clamp0(r.anzahl)} Pers.</span>
      <button type="button" class="reservation-remove" data-remove-index="${i}" aria-label="Reservierung entfernen">✕</button>
    `;
    newTripReservationsList.appendChild(li);
  });
  newTripReservationsList.querySelectorAll("[data-remove-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingNewTripReservations.splice(parseInt(btn.dataset.removeIndex, 10), 1);
      renderNewTripReservations();
    });
  });
}

function addNewTripReservation() {
  const name = newTripResNameInput.value.trim();
  const anzahl = parseInt(newTripResAnzahlInput.value, 10);
  if (!name) { showToast("Bitte einen Gruppennamen eingeben."); return; }
  if (!anzahl || anzahl < 1) { showToast("Bitte eine gültige Personenzahl eingeben."); return; }
  pendingNewTripReservations.push({ name, anzahl });
  newTripResNameInput.value = "";
  newTripResAnzahlInput.value = "";
  renderNewTripReservations();
}
function setConnStatus(state) { applyConnStatus(connStatus, state); }

async function addFahrgaeste(kategorie, delta) {
  if (!docRef || !delta) return;
  try {
    await updateDoc(docRef, { [kategorie]: increment(delta), aktualisiert: serverTimestamp() });
    await addDoc(collection(docRef, "ereignisse"), {
      kategorie, anzahl: delta, kasse: session.kasse, standort: session.standort, zeit: serverTimestamp()
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
      const ort = d.standort ? `${STANDORT_LABEL[d.standort] || d.standort} – ` : "";
      li.innerHTML = `
        <span>${ort}${escapeHtml(d.kasse || "Kasse")} · ${KATEGORIE_LABEL[d.kategorie] || d.kategorie}</span>
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
      latestHistoryRows.push({ fahrtag: d.fahrtag, zug: d.zug, total, seats, free });
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDateDE(d.fahrtag)}</td>
        <td>${ZUG_LABEL[d.zug] || d.zug}</td>
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
  const header = "Datum,Zug,Fahrgaeste,Sitzplaetze,Frei\n";
  const rows = latestHistoryRows.map(r =>
    `${r.fahrtag},${ZUG_LABEL[r.zug] || r.zug},${r.total},${r.seats},${r.free}`
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
previewViewerBtn.addEventListener("click", showViewerPreview);
backToEditorBtn.addEventListener("click", backToEditorView);

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
// Design-Umschalter (klassisch / modern)
// ---------------------------------------------------------
const THEME_KEY = "kb_theme";
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeToggleLabel = document.getElementById("themeToggleLabel");

function applyThemeToggleLabel() {
  const current = document.documentElement.getAttribute("data-theme") || "classic";
  themeToggleLabel.textContent = current === "classic" ? "Modernes Design" : "Klassisches Design";
  themeToggleBtn.querySelector(".theme-toggle-icon").textContent = current === "classic" ? "🚉" : "🎫";
}

function initThemeToggle() {
  applyThemeToggleLabel();
  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "classic";
    const next = current === "classic" ? "modern" : "classic";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    applyThemeToggleLabel();
  });
}

// ---------------------------------------------------------
// Start
// ---------------------------------------------------------
initThemeToggle();
initAuthScreen();
initSetupScreen();
