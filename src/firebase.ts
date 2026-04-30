import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  initializeAuth, 
  browserLocalPersistence, 
  browserPopupRedirectResolver, 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  initializeFirestore, 
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

// Support environment variables for production deployments (like Vercel)
const getEnv = (key: string) => {
  if (typeof (import.meta as any).env !== 'undefined' && (import.meta as any).env[key]) {
    return (import.meta as any).env[key];
  }
  if (typeof process !== 'undefined' && (process as any).env && (process as any).env[key]) {
    return (process as any).env[key];
  }
  return undefined;
};

const firebaseConfig: any = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY') || firebaseConfigPlaceholder.apiKey,
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || firebaseConfigPlaceholder.authDomain,
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || firebaseConfigPlaceholder.projectId,
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || firebaseConfigPlaceholder.storageBucket,
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || firebaseConfigPlaceholder.messagingSenderId,
  appId: getEnv('VITE_FIREBASE_APP_ID') || firebaseConfigPlaceholder.appId,
  measurementId: getEnv('VITE_FIREBASE_MEASUREMENT_ID') || firebaseConfigPlaceholder.measurementId,
  firestoreDatabaseId: getEnv('VITE_FIREBASE_DATABASE_ID') || firebaseConfigPlaceholder.firestoreDatabaseId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with specific settings for better iframe/popup stability
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

// Initialize Firestore with settings to improve connectivity in restrictive environments
const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
  ? firebaseConfig.firestoreDatabaseId 
  : undefined;

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: true,
}, firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, onAuthStateChanged, collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot, deleteDoc, updateDoc };
export type { User };

// Silent connection check
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (e) {
      // Ignore initial connection warming errors
    }
  }
});
