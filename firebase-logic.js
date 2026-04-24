import { initializeApp } from "firebase/app";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    serverTimestamp, 
    enableIndexedDbPersistence 
} from "firebase/firestore";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged, 
    signOut 
} from "firebase/auth";

let app, db, auth;

export const syncService = {
    isInitialized: false,
    
    async initialize(config) {
        if (this.isInitialized) return;
        
        try {
            app = initializeApp(config);
            db = getFirestore(app);
            auth = getAuth(app);
            
            // Enable Offline Persistence
            try {
                await enableIndexedDbPersistence(db);
                console.log("Offline persistence enabled.");
            } catch (err) {
                if (err.code == 'failed-precondition') {
                    console.warn("Persistence failed: Multiple tabs open.");
                } else if (err.code == 'unimplemented') {
                    console.warn("Persistence failed: Browser doesn't support it.");
                }
            }
            
            this.isInitialized = true;
            return { db, auth };
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
            throw error;
        }
    },

    async signIn() {
        if (!auth) throw new Error("Firebase not initialized");
        return signInAnonymously(auth);
    },

    async logout() {
        if (!auth) throw new Error("Firebase not initialized");
        return signOut(auth);
    },

    onAuth(callback) {
        if (!auth) return;
        return onAuthStateChanged(auth, callback);
    },

    async addEntry(text, tags = []) {
        if (!db || !auth.currentUser) throw new Error("Not authenticated");
        
        return addDoc(collection(db, "journal"), {
            text,
            tags,
            userId: auth.currentUser.uid,
            timestamp: serverTimestamp()
        });
    },

    getEntries(callback) {
        if (!db || !auth.currentUser) return;
        
        const q = query(
            collection(db, "journal"),
            where("userId", "==", auth.currentUser.uid),
            orderBy("timestamp", "desc")
        );
        
        return onSnapshot(q, (snapshot) => {
            const entries = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                // Handle null timestamp for local optimistic updates
                timestamp: doc.data().timestamp?.toDate() || new Date()
            }));
            callback(entries);
        }, (error) => {
            console.error("Firestore Snapshot Error:", error);
        });
    }
};
