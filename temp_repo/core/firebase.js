import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, collection, doc, setDoc, getDoc, getDocs, onSnapshot, query, where, orderBy, serverTimestamp, deleteDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBW43DIMLEA4igVq8Un5-pQKsBlv6lGOnc",
  authDomain: "quantos-edge.firebaseapp.com",
  projectId: "quantos-edge",
  storageBucket: "quantos-edge.firebasestorage.app",
  messagingSenderId: "336499583255",
  appId: "1:336499583255:web:394b2bbdd354916689af52",
  measurementId: "G-WWMY0EESRB"
};

let app;
let auth;
let db;
let storage;

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

  async logout() {
    if (!auth) throw new Error("Firebase not initialized");
    return signOut(auth);
  },

  onAuthStateChanged(callback) {
    if (!auth) return () => {};
    return onAuthStateChanged(auth, callback);
  }
};
