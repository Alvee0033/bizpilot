// Firebase client bridge (ES module) for Firestore/Storage reads/writes
// Uses the user's provided Firebase project (blzpilot)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, serverTimestamp, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCpyk5H3coipz0HBJzuCXsBhwYPCcj2Asc',
  authDomain: 'blzpilot.firebaseapp.com',
  projectId: 'blzpilot',
  storageBucket: 'blzpilot.firebasestorage.app',
  messagingSenderId: '697661556177',
  appId: '1:697661556177:web:17ab41202f66748e02ccf0',
  measurementId: 'G-YBJGYKE3N5'
};

let app = null; let db = null; let storage = null;
export function init() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
  }
  return { db, storage };
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

async function uploadDataUrl(uid, ideaId, fileName, dataUrl, folder) {
  init();
  const safeName = String(fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `users/${uid}/ideas/${ideaId}/${folder}/${Date.now()}_${safeName}`;
  const r = storageRef(storage, path);
  await uploadString(r, String(dataUrl), 'data_url');
  const url = await getDownloadURL(r);
  return { url, path };
}

export async function saveIdeaAssetsFromWizard(uid, ideaId, wizard, gps) {
  init();
  const ideaDoc = doc(db, 'users', uid, 'ideas', ideaId);
  const images = (wizard && wizard.images) || [];
  const pdf = (wizard && wizard.pdf) || null;
  const uploads = [];
  const photos = [];
  for (const img of images) {
    if (img && img.data) {
      uploads.push(
        uploadDataUrl(uid, ideaId, img.name || 'image', img.data, 'photos')
          .then(({ url, path }) => { photos.push({ name: img.name || 'image', url, path }); })
          .catch(() => {})
      );
    }
  }
  let pdfInfo = null;
  if (pdf && pdf.data) {
    uploads.push(
      uploadDataUrl(uid, ideaId, pdf.name || 'document.pdf', pdf.data, 'docs')
        .then(({ url, path }) => { pdfInfo = { name: pdf.name || 'document.pdf', url, path }; })
        .catch(() => {})
    );
  }
  await Promise.all(uploads);
  const payload = {
    photos: photos,
    pdf: pdfInfo || null,
    gps: gps || null,
    updatedAt: serverTimestamp()
  };
  await setDoc(ideaDoc, payload, { merge: true });
  return payload;
}

window.DB = { init, loadUserData, writeProfile, writeWizard, writeIdeas, deleteIdea, readIdea, saveIdeaAssetsFromWizard, writeIdeaChat };


