import { FirebaseService } from './firebase.js';
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

export const SyncEngine = {
    async syncToCloud(storeData) {
        if (!FirebaseService.isInitialized) return;
        const auth = FirebaseService.getAuth();
        const db = FirebaseService.getDb();
        if (!auth.currentUser) return;

        const userId = auth.currentUser.uid;
        
        try {
            // We sync the entire store to users/{userId}/store/data for simplicity and atomic updates,
            // or we can split it into collections. The user requested:
            // users/{userId}/trades/{tradeId}
            // users/{userId}/stats/{doc}
            // users/{userId}/settings/{doc}
            
            // Sync Settings
            if (storeData.settings) {
                await setDoc(doc(db, `users/${userId}/settings/main`), {
                    ...storeData.settings,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            // Sync Stats (Accounts, Allocations, etc.)
            const statsData = {
                accounts: storeData.accounts || [],
                transactions: storeData.transactions || [],
                allocations: storeData.allocations || [],
                wishlist: storeData.wishlist || [],
                investments: storeData.investments || [],
                payouts: storeData.payouts || [],
                milestones: storeData.milestones || [],
                backtests: storeData.backtests || [],
                planner: storeData.planner || {},
                snapshots: storeData.snapshots || {},
                scalingMilestones: storeData.scalingMilestones || [],
                updatedAt: serverTimestamp()
            };
            await setDoc(doc(db, `users/${userId}/stats/main`), statsData, { merge: true });

            // Sync Trades
            if (storeData.trades && storeData.trades.length > 0) {
                for (const trade of storeData.trades) {
                    await setDoc(doc(db, `users/${userId}/trades/${trade.id}`), {
                        ...trade,
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }
            }
            
            // Sync Active Trades
            if (storeData.activeTrades && storeData.activeTrades.length > 0) {
                for (const trade of storeData.activeTrades) {
                    await setDoc(doc(db, `users/${userId}/activeTrades/${trade.id}`), {
                        ...trade,
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }
            }

            // Sync Planned Trades
            if (storeData.plannedTrades && storeData.plannedTrades.length > 0) {
                for (const trade of storeData.plannedTrades) {
                    await setDoc(doc(db, `users/${userId}/plannedTrades/${trade.id}`), {
                        ...trade,
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }
            }

            console.log("Synced to cloud successfully.");
            document.dispatchEvent(new CustomEvent('sync-status', { detail: 'Synced' }));
        } catch (error) {
            console.error("Error syncing to cloud:", error);
            document.dispatchEvent(new CustomEvent('sync-status', { detail: 'Failed' }));
        }
    },

    async fetchFromCloud() {
        if (!FirebaseService.isInitialized) return null;
        const auth = FirebaseService.getAuth();
        const db = FirebaseService.getDb();
        if (!auth.currentUser) return null;

        const userId = auth.currentUser.uid;
        document.dispatchEvent(new CustomEvent('sync-status', { detail: 'Syncing...' }));

        try {
            const storeData = {};
            
            // Fetch Settings
            const settingsDoc = await getDoc(doc(db, `users/${userId}/settings/main`));
            if (settingsDoc.exists()) {
                storeData.settings = settingsDoc.data();
            }

            // Fetch Stats
            const statsDoc = await getDoc(doc(db, `users/${userId}/stats/main`));
            if (statsDoc.exists()) {
                const data = statsDoc.data();
                storeData.accounts = data.accounts || [];
                storeData.transactions = data.transactions || [];
                storeData.allocations = data.allocations || [];
                storeData.wishlist = data.wishlist || [];
                storeData.investments = data.investments || [];
                storeData.payouts = data.payouts || [];
                storeData.milestones = data.milestones || [];
                storeData.backtests = data.backtests || [];
                storeData.planner = data.planner || {};
                storeData.snapshots = data.snapshots || {};
                storeData.scalingMilestones = data.scalingMilestones || [];
            }

            // Fetch Trades (We would need getDocs here, let's import it)
            const { getDocs, collection } = await import("firebase/firestore");
            
            const tradesSnap = await getDocs(collection(db, `users/${userId}/trades`));
            storeData.trades = tradesSnap.docs.map(d => d.data());

            const activeTradesSnap = await getDocs(collection(db, `users/${userId}/activeTrades`));
            storeData.activeTrades = activeTradesSnap.docs.map(d => d.data());

            const plannedTradesSnap = await getDocs(collection(db, `users/${userId}/plannedTrades`));
            storeData.plannedTrades = plannedTradesSnap.docs.map(d => d.data());

            document.dispatchEvent(new CustomEvent('sync-status', { detail: 'Synced' }));
            return storeData;
        } catch (error) {
            console.error("Error fetching from cloud:", error);
            document.dispatchEvent(new CustomEvent('sync-status', { detail: 'Failed' }));
            return null;
        }
    }
};
