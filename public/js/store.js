/* Storage adapter. The rest of the app only uses: onAuth, signIn, signOut, watch, set, remove.
   - firebaseConfig filled in  -> Firestore + Google sign-in (shared, saved online)
   - firebaseConfig is null    -> localStorage (this browser only, no sign-in) */
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const KEY = 'amc-report-builder-v1';

function localStore() {
  const empty = () => ({ clients: {}, reports: {} });
  const load = () => { try { return Object.assign(empty(), JSON.parse(localStorage.getItem(KEY))); } catch (e) { return empty(); } };
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));
  const subs = { clients: new Set(), reports: new Set() };
  const emit = name => { const docs = Object.entries(load()[name]).map(([id, data]) => ({ id, data })); subs[name].forEach(cb => cb(docs)); };
  return {
    mode: 'local',
    onAuth(cb) { Promise.resolve().then(() => cb({ email: '' })); return () => {}; },
    async signIn() {}, async signOut() {},
    watch(name, cb) { subs[name].add(cb); Promise.resolve().then(() => emit(name)); return () => subs[name].delete(cb); },
    async set(name, id, doc) { const d = load(); d[name][id] = JSON.parse(JSON.stringify(doc)); save(d); emit(name); },
    async remove(name, id) { const d = load(); delete d[name][id]; save(d); emit(name); }
  };
}

async function cloudStore(cfg) {
  const [app, auth, fs] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  const a = auth.getAuth(app.initializeApp(cfg)), db = fs.getFirestore(app.getApp());
  return {
    mode: 'cloud',
    onAuth(cb) { return auth.onAuthStateChanged(a, u => cb(u ? { email: u.email || '' } : null)); },
    signIn() { return auth.signInWithPopup(a, new auth.GoogleAuthProvider()); },
    signOut() { return auth.signOut(a); },
    watch(name, cb, err) { return fs.onSnapshot(fs.collection(db, name), s => cb(s.docs.map(d => ({ id: d.id, data: d.data() }))), err); },
    set(name, id, doc) { return fs.setDoc(fs.doc(db, name, id), doc); },
    remove(name, id) { return fs.deleteDoc(fs.doc(db, name, id)); }
  };
}

export async function createStore() { return firebaseConfig ? cloudStore(firebaseConfig) : localStore(); }
