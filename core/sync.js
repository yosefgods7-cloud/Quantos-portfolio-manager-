import { FirebaseService } from './firebase.js';
import { doc, setDoc, getDoc, getDocs, collection, onSnapshot, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

export const SyncEngine = {
  isSyncing: false,
  unsubscribeTrades: null,
  unsubscribeStats: null,
  unsubscribeSettings: null,

  async init() {
    try {
      FirebaseService.init();
      this.updateStatusUI('Connected', 'var(--success)');
      
      // Show auth section
      const authSection = document.getElementById('auth-section');
      if (authSection) authSection.style.display = 'block';

      // Listen for auth state changes
      FirebaseService.onAuthStateChanged(async (user) => {
        if (user) {
          this.updateAuthUI(user);
          this.updateStatusUI('Syncing...', 'var(--warning)');
          
          const overlay = document.getElementById('sync-loading-overlay');
          const overlayText = document.getElementById('sync-loading-text');
          
          try {
            const db = FirebaseService.getDb();
            const metaRef = doc(db, `users/${user.uid}/meta/syncInfo`);
            const metaSnap = await getDoc(metaRef);
            
            if (metaSnap.exists() && metaSnap.data().lastPushed) {
              // Cloud has data, pull it first
              if (overlay) {
                overlay.style.display = 'flex';
                if (overlayText) overlayText.innerText = 'Syncing your data...';
              }
              await this.hydrateAppFromFirestore(user.uid);
            }
            
            this.updateStatusUI('Synced ✓', 'var(--success)');
          } catch (err) {
            const errMsg = err.message || String(err);
            if (errMsg.includes("client is offline")) {
              console.warn("Client is offline, starting in offline mode.");
              this.updateStatusUI('Offline Mode', 'var(--warning)');
            } else {
              console.error("Hydration failed:", err);
              this.updateStatusUI('Sync Error', 'var(--danger)');
            }
          } finally {
            if (overlay) overlay.style.display = 'none';
            this.startSync(user.uid);
          }
        } else {
          this.updateAuthUI(null);
          this.stopSync('Connected (Please Login)', 'var(--warning)');
        }
      });
    } catch (e) {
      console.error("Failed to init Firebase", e);
      this.updateStatusUI('Failed to connect', 'var(--danger)');
    }
  },

  updateStatusUI(text, color) {
    const textEl = document.getElementById('firebase-status-text');
    const indicatorEl = document.getElementById('firebase-status-indicator');
    if (textEl) textEl.innerText = text;
    if (indicatorEl) indicatorEl.style.background = color;

    const sidebarTextEl = document.getElementById('sidebar-firebase-text');
    const sidebarIndicatorEl = document.getElementById('sidebar-firebase-indicator');
    if (sidebarTextEl) sidebarTextEl.innerText = text;
    if (sidebarIndicatorEl) sidebarIndicatorEl.style.background = color;
  },

  updateAuthUI(user) {
    const loggedOut = document.getElementById('auth-logged-out');
    const loggedIn = document.getElementById('auth-logged-in');
    const userEmail = document.getElementById('auth-user-email');
    
    if (user) {
      if (loggedOut) loggedOut.style.display = 'none';
      if (loggedIn) loggedIn.style.display = 'block';
      if (userEmail) userEmail.innerText = user.isAnonymous ? 'Anonymous User' : user.email;
    } else {
      if (loggedOut) loggedOut.style.display = 'block';
      if (loggedIn) loggedIn.style.display = 'none';
    }
  },

  async hydrateAppFromFirestore(uid) {
    const db = FirebaseService.getDb();
    
    // 1. Fetch Trades
    try {
      const tradesRef = collection(db, `users/${uid}/trades`);
      const tradesSnapshot = await getDocs(tradesRef);
      if (!tradesSnapshot.empty) {
        const trades = [];
        tradesSnapshot.forEach(doc => {
          trades.push({ ...doc.data(), id: parseInt(doc.id) });
        });
        localStorage.setItem('qe_trades', JSON.stringify(trades));
      }
    } catch (err) {
      console.warn("Failed to hydrate trades:", err);
    }

    // 2. Fetch Core Stats
    try {
      const coreRef = doc(db, `users/${uid}/stats/core`);
      const coreSnap = await getDoc(coreRef);
      if (coreSnap.exists()) {
        const data = coreSnap.data();
        const keyMap = {
          transactions: "qe_transactions",
          allocations: "qe_allocations",
          wishlist: "qe_wishlist",
          investments: "qe_investments",
          payouts: "qe_payouts",
          milestones: "qe_milestones",
          activeTrades: "qe_active_trades",
          plannedTrades: "qe_planned_trades",
          backtests: "qe_backtests",
          planner: "qe_planner",
          snapshots: "qe_snapshots",
          scalingMilestones: "qe_scaling_milestones",
          expenses: "qe_expenses",
          budgets: "qe_budgets",
          stocks: "qe_stocks",
          dividends: "qe_dividends",
          locks: "qe_locks",
          journalConfig: "qe_journal_config",
          debriefs: "qe_debriefs",
          weeklyReviews: "qe_weekly_reviews"
        };
        
        for (const [key, localKey] of Object.entries(keyMap)) {
          if (data[key] !== undefined) {
            localStorage.setItem(localKey, JSON.stringify(data[key]));
          }
        }
      }
    } catch (err) {
      console.warn("Failed to hydrate core stats:", err);
    }

    // 3. Fetch Accounts
    try {
      const accountsRef = doc(db, `users/${uid}/stats/accounts`);
      const accountsSnap = await getDoc(accountsRef);
      if (accountsSnap.exists()) {
        const data = accountsSnap.data();
        if (data.data) {
          localStorage.setItem('qe_accounts', JSON.stringify(data.data));
        }
      }
    } catch (err) {
      console.warn("Failed to hydrate accounts:", err);
    }

    // 4. Fetch Settings
    try {
      const settingsRef = doc(db, `users/${uid}/settings/main`);
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        localStorage.setItem('qe_settings', JSON.stringify(settingsSnap.data()));
      }
    } catch (err) {
      console.warn("Failed to hydrate settings:", err);
    }

    // Update sync meta
    try {
      const metaRef = doc(db, `users/${uid}/meta/syncInfo`);
      await setDoc(metaRef, {
        lastPulled: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn("Failed to update sync meta:", err);
    }

    if (window.reloadAppState) {
      window.reloadAppState();
    }
  },

  async forcePullFromCloud() {
    const auth = FirebaseService.getAuth();
    const user = auth.currentUser;
    if (!user) return alert("Not connected to Firebase.");
    
    if (!confirm("This will overwrite your local data with cloud data. Continue?")) return;
    
    const overlay = document.getElementById('sync-loading-overlay');
    const overlayText = document.getElementById('sync-loading-text');
    
    try {
      this.updateStatusUI('Pulling from cloud...', 'var(--warning)');
      if (overlay) {
        overlay.style.display = 'flex';
        if (overlayText) overlayText.innerText = 'Pulling data from cloud...';
      }
      await this.hydrateAppFromFirestore(user.uid);
      this.updateStatusUI('Synced ✓', 'var(--success)');
      alert("Cloud data loaded successfully");
    } catch (e) {
      const errMsg = e.message || String(e);
      if (errMsg.includes("client is offline")) {
        console.warn("Pull data offline:", e);
        alert("Cannot pull data while offline.");
      } else {
        console.error("Failed to pull data", e);
        alert("Failed to pull data: " + e.message);
      }
      this.updateStatusUI('Sync Failed', 'var(--danger)');
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  },

  async startSync(userId) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateStatusUI('Syncing...', 'var(--warning)');
    
    const db = FirebaseService.getDb();
    
    // Sync Trades
    const tradesRef = collection(db, `users/${userId}/trades`);
    this.unsubscribeTrades = onSnapshot(tradesRef, (snapshot) => {
      let localTrades = JSON.parse(localStorage.getItem('qe_trades') || '[]');
      let updated = false;

      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const tradeId = parseInt(change.doc.id);
        
        if (change.type === 'added' || change.type === 'modified') {
          const index = localTrades.findIndex(t => t.id === tradeId);
          if (index > -1) {
            // Conflict resolution: latest wins
            const localTime = localTrades[index].updatedAt || 0;
            const remoteTime = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0;
            if (remoteTime >= localTime) {
              localTrades[index] = { ...data, id: tradeId };
              updated = true;
            }
          } else {
            localTrades.push({ ...data, id: tradeId });
            updated = true;
          }
        } else if (change.type === 'removed') {
          localTrades = localTrades.filter(t => t.id !== tradeId);
          updated = true;
        }
      });

      if (updated) {
        localStorage.setItem('qe_trades', JSON.stringify(localTrades));
        if (window.Store) {
          window.Store.trades = localTrades;
          if (window.renderAll) window.renderAll();
        }
      }
      this.updateStatusUI('Synced', 'var(--success)');
    }, (error) => {
      const errMsg = error.message || String(error);
      if (errMsg.includes("client is offline")) {
        console.warn("Trades sync offline:", error);
      } else {
        console.error("Trades sync error:", error);
        this.stopSync('Sync Error: Permissions/Rules', 'var(--danger)');
      }
    });

    // Sync Stats/Core
    const coreRef = doc(db, `users/${userId}/stats/core`);
    this.unsubscribeStats = onSnapshot(coreRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (window.Store) {
          if (data.transactions) window.Store.transactions = data.transactions;
          if (data.allocations) window.Store.allocations = data.allocations;
          if (data.wishlist) window.Store.wishlist = data.wishlist;
          if (data.investments) window.Store.investments = data.investments;
          if (data.payouts) window.Store.payouts = data.payouts;
          if (data.milestones) window.Store.milestones = data.milestones;
          if (data.activeTrades) window.Store.activeTrades = data.activeTrades;
          if (data.plannedTrades) window.Store.plannedTrades = data.plannedTrades;
          if (data.backtests) window.Store.backtests = data.backtests;
          if (data.planner) window.Store.planner = data.planner;
          if (data.snapshots) window.Store.snapshots = data.snapshots;
          if (data.scalingMilestones) window.Store.scalingMilestones = data.scalingMilestones;
          if (data.expenses) window.Store.expenses = data.expenses;
          if (data.budgets) window.Store.budgets = data.budgets;
          if (data.stocks) window.Store.stocks = data.stocks;
          if (data.dividends) window.Store.dividends = data.dividends;
          if (data.locks) window.Store.locks = data.locks;
          if (data.journalConfig) {
            window.Store.journalConfig = {
              pairs: data.journalConfig.pairs || window.Store.journalConfig.pairs || ['EURUSD', 'GBPUSD'],
              setups: data.journalConfig.setups || window.Store.journalConfig.setups || ['OB', 'FVG'],
              confluences: data.journalConfig.confluences || window.Store.journalConfig.confluences || ['HTF zone']
            };
          }
          if (data.debriefs) window.Store.debriefs = data.debriefs;
          if (data.weeklyReviews) window.Store.weeklyReviews = data.weeklyReviews;
          
          // Save to local storage without triggering sync loop
          localStorage.setItem("qe_transactions", JSON.stringify(window.Store.transactions));
          localStorage.setItem("qe_allocations", JSON.stringify(window.Store.allocations));
          localStorage.setItem("qe_wishlist", JSON.stringify(window.Store.wishlist));
          localStorage.setItem("qe_investments", JSON.stringify(window.Store.investments));
          localStorage.setItem("qe_payouts", JSON.stringify(window.Store.payouts));
          localStorage.setItem("qe_milestones", JSON.stringify(window.Store.milestones));
          localStorage.setItem("qe_active_trades", JSON.stringify(window.Store.activeTrades));
          localStorage.setItem("qe_planned_trades", JSON.stringify(window.Store.plannedTrades));
          localStorage.setItem("qe_backtests", JSON.stringify(window.Store.backtests));
          localStorage.setItem("qe_planner", JSON.stringify(window.Store.planner));
          localStorage.setItem("qe_snapshots", JSON.stringify(window.Store.snapshots));
          localStorage.setItem("qe_scaling_milestones", JSON.stringify(window.Store.scalingMilestones));
          localStorage.setItem("qe_expenses", JSON.stringify(window.Store.expenses));
          localStorage.setItem("qe_budgets", JSON.stringify(window.Store.budgets));
          localStorage.setItem("qe_stocks", JSON.stringify(window.Store.stocks));
          localStorage.setItem("qe_dividends", JSON.stringify(window.Store.dividends));
          localStorage.setItem("qe_locks", JSON.stringify(window.Store.locks));
          localStorage.setItem("qe_journal_config", JSON.stringify(window.Store.journalConfig));
          localStorage.setItem("qe_debriefs", JSON.stringify(window.Store.debriefs));
          localStorage.setItem("qe_weekly_reviews", JSON.stringify(window.Store.weeklyReviews));
          
          if (window.renderAll) window.renderAll();
        }
      }
    }, (error) => {
      const errMsg = error.message || String(error);
      if (errMsg.includes("client is offline")) {
        console.warn("Core stats sync offline:", error);
      } else {
        console.error("Core stats sync error:", error);
        this.stopSync('Sync Error: Permissions/Rules', 'var(--danger)');
      }
    });

    // Sync Accounts
    const accountsRef = doc(db, `users/${userId}/stats/accounts`);
    onSnapshot(accountsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (window.Store && data.data) {
          window.Store.accounts = data.data;
          localStorage.setItem("qe_accounts", JSON.stringify(window.Store.accounts));
          if (window.renderAll) window.renderAll();
        }
      }
    }, (error) => {
      const errMsg = error.message || String(error);
      if (errMsg.includes("client is offline")) {
        console.warn("Accounts sync offline:", error);
      } else {
        console.error("Accounts sync error:", error);
      }
    });

    // Sync Settings
    const settingsRef = doc(db, `users/${userId}/settings/main`);
    this.unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (window.Store) {
          window.Store.settings = { ...window.Store.settings, ...data };
          localStorage.setItem("qe_settings", JSON.stringify(window.Store.settings));
          if (window.renderAll) window.renderAll();
        }
      }
    }, (error) => {
      const errMsg = error.message || String(error);
      if (errMsg.includes("client is offline")) {
        console.warn("Settings sync offline:", error);
      } else {
        console.error("Settings sync error:", error);
        this.stopSync('Sync Error: Permissions/Rules', 'var(--danger)');
      }
    });
  },

  stopSync(reason = 'Offline', color = 'var(--danger)') {
    this.isSyncing = false;
    if (this.unsubscribeTrades) { this.unsubscribeTrades(); this.unsubscribeTrades = null; }
    if (this.unsubscribeStats) { this.unsubscribeStats(); this.unsubscribeStats = null; }
    if (this.unsubscribeSettings) { this.unsubscribeSettings(); this.unsubscribeSettings = null; }
    this.updateStatusUI(reason, color);
  },

  async updateSyncMeta() {
    if (!this.isSyncing) return;
    try {
      const db = FirebaseService.getDb();
      const auth = FirebaseService.getAuth();
      if (!auth.currentUser) return;
      
      const uid = auth.currentUser.uid;
      const metaRef = doc(db, `users/${uid}/meta/syncInfo`);
      await setDoc(metaRef, {
        lastPushed: serverTimestamp()
      }, { merge: true });
    } catch(e) {}
  },
  
  async syncTrade(trade, skipMetaUpdate = false) {
    if (!this.isSyncing) return;
    try {
      const db = FirebaseService.getDb();
      const auth = FirebaseService.getAuth();
      if (!auth.currentUser) return;
      
      const uid = auth.currentUser.uid;
      const tradeRef = doc(db, `users/${uid}/trades/${trade.id}`);
      await setDoc(tradeRef, {
        ...trade,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Update sync meta
      if (!skipMetaUpdate) {
        const metaRef = doc(db, `users/${uid}/meta/syncInfo`);
        await setDoc(metaRef, {
          lastPushed: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      const errMsg = e.message || String(e);
      if (errMsg.includes("client is offline")) {
        console.warn("Sync trade offline:", e);
      } else {
        console.error("Failed to sync trade", e);
      }
    }
  },

  async syncAll(store) {
    if (!this.isSyncing) return;
    try {
      const db = FirebaseService.getDb();
      const auth = FirebaseService.getAuth();
      if (!auth.currentUser) return;
      
      const uid = auth.currentUser.uid;
      
      // Sync settings
      if (store.settings) {
        await setDoc(doc(db, `users/${uid}/settings/main`), {
          ...store.settings,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // Sync stats/accounts
      if (store.accounts) {
        await setDoc(doc(db, `users/${uid}/stats/accounts`), {
          data: store.accounts,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      
      // Sync other core data
      const coreData = {
        transactions: store.transactions || [],
        allocations: store.allocations || [],
        wishlist: store.wishlist || [],
        investments: store.investments || [],
        payouts: store.payouts || [],
        milestones: store.milestones || [],
        activeTrades: store.activeTrades || [],
        plannedTrades: store.plannedTrades || [],
        backtests: store.backtests || [],
        planner: store.planner || {},
        snapshots: store.snapshots || {},
        scalingMilestones: store.scalingMilestones || [],
        expenses: store.expenses || [],
        budgets: store.budgets || [],
        stocks: store.stocks || [],
        dividends: store.dividends || [],
        locks: store.locks || [],
        journalConfig: store.journalConfig || {},
        debriefs: store.debriefs || [],
        weeklyReviews: store.weeklyReviews || []
      };
      
      await setDoc(doc(db, `users/${uid}/stats/core`), {
        ...coreData,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      // Update sync meta
      const metaRef = doc(db, `users/${uid}/meta/syncInfo`);
      await setDoc(metaRef, {
        lastPushed: serverTimestamp()
      }, { merge: true });
      
    } catch (e) {
      const errMsg = e.message || String(e);
      if (errMsg.includes("client is offline")) {
        console.warn("Sync all data offline:", e);
      } else {
        console.error("Failed to sync all data", e);
      }
    }
  },

  async deleteTrade(tradeId, screenshotUrl) {
    if (!this.isSyncing) return;
    try {
      const db = FirebaseService.getDb();
      const auth = FirebaseService.getAuth();
      if (!auth.currentUser) return;
      
      const tradeRef = doc(db, `users/${auth.currentUser.uid}/trades/${tradeId}`);
      await deleteDoc(tradeRef);
      
      if (screenshotUrl) {
        let urls = [];
        if (Array.isArray(screenshotUrl)) urls = screenshotUrl;
        else if (typeof screenshotUrl === 'string') urls = screenshotUrl.split(',').map(s => s.trim()).filter(s => s);
        
        for (const url of urls) {
           if (url.includes('firebasestorage')) {
             const storage = FirebaseService.getStorage();
             const fileRef = ref(storage, url);
             await deleteObject(fileRef).catch(e => console.warn("Screenshot delete failed", e));
           }
        }
      }
    } catch (e) {
      const errMsg = e.message || String(e);
      if (errMsg.includes("client is offline")) {
        console.warn("Delete trade offline:", e);
      } else {
        console.error("Failed to delete trade", e);
      }
    }
  },

  async uploadScreenshot(file, onProgress) {
    const auth = FirebaseService.getAuth();
    if (!auth.currentUser) throw new Error("Not authenticated");
    
    const storage = FirebaseService.getStorage();
    const uid = auth.currentUser.uid;
    const ext = file.name.split('.').pop();
    const filename = `screenshot_${Date.now()}.${ext}`;
    const storageRef = ref(storage, `users/${uid}/screenshots/${filename}`);
    
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) onProgress(progress);
        }, 
        (error) => {
          const errMsg = error.message || String(error);
          if (errMsg.includes("client is offline")) {
            console.warn("Upload offline:", error);
          } else {
            console.error("Upload failed:", error);
          }
          reject(error);
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  }
};

// Expose global functions for the UI
window.SyncEngine = SyncEngine;

window.saveFirebaseConfig = function() {
  const config = {
    apiKey: document.getElementById('fb-apiKey').value,
    authDomain: document.getElementById('fb-authDomain').value,
    projectId: document.getElementById('fb-projectId').value,
    storageBucket: document.getElementById('fb-storageBucket').value,
    messagingSenderId: document.getElementById('fb-messagingSenderId').value,
    appId: document.getElementById('fb-appId').value,
  };
  
  if (!config.apiKey || !config.projectId) {
    alert("API Key and Project ID are required.");
    return;
  }
  
  localStorage.setItem('quantedge_firebase_config', JSON.stringify(config));
  alert("Firebase Config saved! Reloading application...");
  window.location.reload();
};

window.clearFirebaseConfig = function() {
  localStorage.removeItem('quantedge_firebase_config');
  alert("Custom Firebase Config cleared! Reloading application...");
  window.location.reload();
};

window.handleLogin = async function() {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  if (!email || !password) return alert("Email and password required");
  
  try {
    await FirebaseService.login(email, password);
  } catch (e) {
    alert("Login failed: " + e.message);
  }
};

window.handleSignup = async function() {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  if (!email || !password) return alert("Email and password required");
  
  try {
    await FirebaseService.signup(email, password);
  } catch (e) {
    alert("Signup failed: " + e.message);
  }
};

window.handleAnonLogin = async function() {
  try {
    await FirebaseService.loginAnonymously();
  } catch (e) {
    alert("Anon login failed: " + e.message);
  }
};

window.handleLogout = async function() {
  try {
    await FirebaseService.logout();
  } catch (e) {
    alert("Logout failed: " + e.message);
  }
};

window.forcePullFromCloud = async function() {
  if (!SyncEngine) return alert("SyncEngine not initialized.");
  await SyncEngine.forcePullFromCloud();
};

window.forceSyncLocalToCloud = async function() {
  if (!SyncEngine.isSyncing) return alert("Not connected to Firebase.");
  if (!confirm("This will overwrite your cloud data with your current local data. Are you sure?")) return;
  
  const overlay = document.getElementById('sync-loading-overlay');
  const overlayText = document.getElementById('sync-loading-text');
  
  try {
    SyncEngine.updateStatusUI('Pushing data...', 'var(--warning)');
    if (overlay) {
      overlay.style.display = 'flex';
      if (overlayText) overlayText.innerText = 'Pushing data to cloud...';
    }
    await SyncEngine.syncAll(window.Store);
    
    // Also push all trades
    if (window.Store.trades && window.Store.trades.length > 0) {
      const promises = window.Store.trades.map(trade => SyncEngine.syncTrade(trade, true));
      await Promise.allSettled(promises);
      
      // Update meta once at the end
      const db = FirebaseService.getDb();
      const auth = FirebaseService.getAuth();
      if (auth.currentUser) {
         const metaRef = doc(db, `users/${auth.currentUser.uid}/meta/syncInfo`);
         await setDoc(metaRef, { lastPushed: serverTimestamp() }, { merge: true });
      }
    }
    
    alert("Local data successfully pushed to cloud!");
    SyncEngine.updateStatusUI('Synced', 'var(--success)');
  } catch (e) {
    const errMsg = e.message || String(e);
    if (errMsg.includes("client is offline")) {
      console.warn("Push data offline:", e);
      alert("Cannot push data while offline.");
    } else {
      console.error("Failed to push data", e);
      alert("Failed to push data: " + e.message);
    }
    SyncEngine.updateStatusUI('Sync Failed', 'var(--danger)');
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  SyncEngine.init();
});
