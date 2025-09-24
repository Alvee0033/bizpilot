// Firebase client bridge (ES module) for Firestore reads/writes
// Uses the user's provided Firebase project (blzpilot)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, serverTimestamp, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCpyk5H3coipz0HBJzuCXsBhwYPCcj2Asc',
  authDomain: 'blzpilot.firebaseapp.com',
  projectId: 'blzpilot',
  storageBucket: 'blzpilot.firebasestorage.app',
  messagingSenderId: '697661556177',
  appId: '1:697661556177:web:17ab41202f66748e02ccf0',
  measurementId: 'G-YBJGYKE3N5'
};

let app = null; let db = null;
export function init() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
  return { db };
}

export async function loadUserData(uid) {
  init();
  const userRef = doc(db, 'users', uid);
  const wizRef = doc(db, 'users', uid, 'wizard', 'default');
  const ideasCol = collection(db, 'users', uid, 'ideas');
  const [userSnap, wizSnap, ideasSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(wizRef),
    getDocs(query(ideasCol, orderBy('createdAt', 'asc')))
  ]);
  const profile = userSnap.exists() ? {
    language: userSnap.data().language || 'en',
    stage: userSnap.data().stage || 'Idea'
  } : { language: 'en', stage: 'Idea' };
  const wizard = wizSnap.exists() ? wizSnap.data() : null;
  const ideas = [];
  ideasSnap.forEach(d => ideas.push({ id: d.id, name: d.data().name || 'Idea' }));
  return { profile, wizard, ideas };
}

export async function writeProfile(uid, profile) {
  init();
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, { language: profile.language, stage: profile.stage, updatedAt: serverTimestamp() }, { merge: true });
}

export async function writeWizard(uid, wizard) {
  init();
  const wizRef = doc(db, 'users', uid, 'wizard', 'default');
  await setDoc(wizRef, { ...wizard, updatedAt: serverTimestamp() }, { merge: true });
}

export async function writeIdeas(uid, items) {
  init();
  const writes = items.map(async it => {
    const ref = doc(db, 'users', uid, 'ideas', it.id);
    await setDoc(ref, { name: it.name, createdAt: serverTimestamp() }, { merge: true });
  });
  await Promise.all(writes);
}

export async function deleteIdea(uid, id) {
  init();
  const ref = doc(db, 'users', uid, 'ideas', id);
  await deleteDoc(ref);
}

export async function readIdea(uid, id) {
  init();
  const ref = doc(db, 'users', uid, 'ideas', id);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function writeIdeaChat(uid, ideaId, history){
  init();
  const ref = doc(db, 'users', uid, 'ideas', ideaId);
  await setDoc(ref, { chat: Array.isArray(history) ? history : [], chatUpdatedAt: serverTimestamp() }, { merge: true });
}

// NOTE: Storage uploads removed per request. We store inline data URLs in Firestore instead.

export async function saveIdeaAssetsFromWizard(uid, ideaId, wizard, gps) {
  init();
  const ideaDoc = doc(db, 'users', uid, 'ideas', ideaId);
  const images = (wizard && wizard.images) || [];
  const pdf = (wizard && wizard.pdf) || null;
  // Persist inline data directly into Firestore to avoid Storage/CORS
  const photos = [];
  for (const img of images) {
    if (img && (img.data || img.url)) {
      // Prefer data URL; fall back to existing URL if present
      photos.push({ name: img.name || 'image', data: String(img.data || ''), url: img.url ? String(img.url) : undefined });
    }
  }
  const pdfInfo = (pdf && (pdf.data || pdf.url)) ? { name: pdf.name || 'document.pdf', data: pdf.data ? String(pdf.data) : undefined, url: pdf.url ? String(pdf.url) : undefined } : null;
  const payload = { photos, pdf: pdfInfo, gps: gps || null, updatedAt: serverTimestamp() };
  await setDoc(ideaDoc, payload, { merge: true });
  return payload;
}

window.DB = { init, loadUserData, writeProfile, writeWizard, writeIdeas, deleteIdea, readIdea, saveIdeaAssetsFromWizard, writeIdeaChat };



