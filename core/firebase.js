import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, collection, doc, setDoc, getDoc, getDocs, onSnapshot, query, where, orderBy, serverTimestamp, deleteDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAn9rHtNupm6t8q7VfkaLL7ejie732S8lc",
  authDomain: "gen-lang-client-0940321923.firebaseapp.com",
  projectId: "gen-lang-client-0940321923",
  storageBucket: "gen-lang-client-0940321923.firebasestorage.app",
  messagingSenderId: "259751023246",
  appId: "1:259751023246:web:1bde2eb99b7bf211b1efdf"
};

let app;
let auth;
let db;
let storage;

let cachedWorkspaceAccessToken = null;

export const FirebaseService = {
  isInitialized: false,

  init(config = firebaseConfig) {
    if (this.isInitialized) return { app, auth, db, storage };
    
    let finalConfig = config;
    try {
      const savedConfig = localStorage.getItem('quantedge_firebase_config');
      if (savedConfig) {
        finalConfig = JSON.parse(savedConfig);
      }
    } catch(e) {
      console.warn("Failed to parse saved firebase config.");
    }

    if (!getApps().length) {
      app = initializeApp(finalConfig);
    } else {
      app = getApp();
    }

    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    // Try to enable offline persistence
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code == 'failed-precondition') {
        console.warn("Firebase persistence failed: Multiple tabs open.");
      } else if (err.code == 'unimplemented') {
        console.warn("Firebase persistence failed: Browser doesn't support it.");
      }
    });

    this.isInitialized = true;
    return { app, auth, db, storage };
  },

  getAuth() {
    if (!this.isInitialized) throw new Error("Firebase not initialized");
    return auth;
  },

  getDb() {
    if (!this.isInitialized) throw new Error("Firebase not initialized");
    return db;
  },

  getStorage() {
    if (!this.isInitialized) throw new Error("Firebase not initialized");
    return storage;
  },

  async login(email, password) {
    if (!auth) throw new Error("Firebase not initialized");
    return signInWithEmailAndPassword(auth, email, password);
  },

  async signup(email, password) {
    if (!auth) throw new Error("Firebase not initialized");
    return createUserWithEmailAndPassword(auth, email, password);
  },

  async loginAnonymously() {
    if (!auth) throw new Error("Firebase not initialized");
    return signInAnonymously(auth);
  },

  async loginWithGoogle() {
    if (!auth) throw new Error("Firebase not initialized");
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/chat.messages');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
         cachedWorkspaceAccessToken = credential.accessToken;
      }
      return { user: result.user, accessToken: cachedWorkspaceAccessToken };
    } catch(err) {
      console.error("Google Auth failed:", err);
      throw err;
    }
  },

  getWorkspaceAccessToken() {
    return cachedWorkspaceAccessToken;
  },

  async logout() {
    if (!auth) throw new Error("Firebase not initialized");
    cachedWorkspaceAccessToken = null;
    return signOut(auth);
  },

  onAuthStateChanged(callback) {
    if (!auth) return () => {};
    return onAuthStateChanged(auth, callback);
  }
};
