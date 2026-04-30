import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getAuth,
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  getFirestore,
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  updateDoc, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfigPlaceholder from '../firebase-applet-config.json';

const firebaseConfig: any = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || firebaseConfigPlaceholder.apiKey,
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigPlaceholder.authDomain,
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || firebaseConfigPlaceholder.projectId,
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigPlaceholder.storageBucket,
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigPlaceholder.messagingSenderId,
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || firebaseConfigPlaceholder.appId,
  measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigPlaceholder.measurementId,
  firestoreDatabaseId: (import.meta as any).env.VITE_FIREBASE_DATABASE_ID || firebaseConfigPlaceholder.firestoreDatabaseId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
  ? firebaseConfig.firestoreDatabaseId 
  : undefined;

export const db = getFirestore(app, dbId);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, onAuthStateChanged, collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot, deleteDoc, updateDoc };
export type { User };

// Silent connection check
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (e) {
      // Ignore
    }
  }
});
