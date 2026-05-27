import { FirebaseService } from './firebase.js';

export const GDriveSync = {
  getAccessToken() {
    return FirebaseService.getWorkspaceAccessToken();
  },

  async login() {
    try {
      const result = await FirebaseService.loginWithGoogle();
      if (result && result.accessToken) {
        return true;
      }
      return false;
    } catch(err) {
      console.error("GDrive Login failed:", err);
      return false;
    }
  },

  // Search for the QuantEdge sync file
  async findSyncFile() {
    const token = this.getAccessToken();
    if (!token) throw new Error("No Drive access token. Please login with Google.");

    const res = await fetch('https://www.googleapis.com/drive/v3/files?q=name="quantedge_sync.json" and trashed=false', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
    return null;
  },

  // Export current local Store to Google Drive
  async exportData(storeData) {
    const token = this.getAccessToken();
    if (!token) throw new Error("No Drive access token. Please login with Google.");

    const fileContent = JSON.stringify(storeData, null, 2);
    const metadata = {
      name: 'quantedge_sync.json',
      mimeType: 'application/json'
    };

    const existingFile = await this.findSyncFile();
    let fileId;

    if (existingFile && existingFile.id) {
      fileId = existingFile.id;
      const confirmed = window.confirm("You are about to overwrite your existing Google Drive sync file. If you haven't pulled recent changes, they will be lost. Continue with export?");
      if (!confirmed) return;
    } else {
      // 1. Create the file metadata
      const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });
      if (!metaRes.ok) throw new Error(`Failed to create file: ${metaRes.statusText}`);
      const metaData = await metaRes.json();
      fileId = metaData.id;
    }

    // 2. Upload the file content (media)
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: fileContent
    });
    
    if (!res.ok) {
       const text = await res.text();
       throw new Error(`Upload failed: ${res.statusText} - ${text}`);
    }
    return await res.json();
  },

  // Import data from Google Drive
  async importData() {
    const token = this.getAccessToken();
    if (!token) throw new Error("No Drive access token. Please login with Google.");

    const file = await this.findSyncFile();
    if (!file) throw new Error("No quantedge_sync.json file found in Google Drive.");

    const confirmed = window.confirm("You are about to overwrite all local QuantEdge data with the data from Google Drive. This cannot be undone. Continue?");
    if (!confirmed) return null;

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
        throw new Error("Failed to download file from Drive.");
    }
    const data = await res.json();
    return data;
  },

  async deleteData() {
    const token = this.getAccessToken();
    if (!token) throw new Error("No Drive access token. Please login with Google.");

    const file = await this.findSyncFile();
    if (!file) {
      alert("No sync file found in Google Drive.");
      return;
    }

    const confirmed = window.confirm("Are you sure you want to delete the QuantEdge sync file from Google Drive? This action cannot be undone.");
    if (!confirmed) return;

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to delete file from Drive. ${res.statusText}`);
    }
    alert("Sync file deleted from Google Drive.");
  }
};

window.GDriveSync = GDriveSync;

// Attach functions to window for UI usage
window.handleGDriveExport = async function() {
  try {
    if (!GDriveSync.getAccessToken()) {
       const loggedIn = await GDriveSync.login();
       if (!loggedIn) return;
    }
    const overlay = document.getElementById('sync-loading-overlay');
    const overlayText = document.getElementById('sync-loading-text');
    if (overlay) {
      overlay.style.display = 'flex';
      if (overlayText) overlayText.innerText = 'Exporting data to Google Drive...';
    }

    const dataToSync = {
      transactions: window.Store.transactions || [],
      allocations: window.Store.allocations || [],
      wishlist: window.Store.wishlist || [],
      investments: window.Store.investments || [],
      payouts: window.Store.payouts || [],
      milestones: window.Store.milestones || [],
      activeTrades: window.Store.activeTrades || [],
      plannedTrades: window.Store.plannedTrades || [],
      backtests: window.Store.backtests || [],
      planner: window.Store.planner || {},
      snapshots: window.Store.snapshots || {},
      scalingMilestones: window.Store.scalingMilestones || [],
      expenses: window.Store.expenses || [],
      budgets: window.Store.budgets || [],
      stocks: window.Store.stocks || [],
      dividends: window.Store.dividends || [],
      locks: window.Store.locks || [],
      journalConfig: window.Store.journalConfig || {},
      debriefs: window.Store.debriefs || [],
      weeklyReviews: window.Store.weeklyReviews || [],
      accounts: window.Store.accounts || [],
      settings: window.Store.settings || {},
      trades: window.Store.trades || [] // Note: Large arrays of trades might impact size limits if not careful
    };

    await GDriveSync.exportData(dataToSync);
    
    if (overlay) overlay.style.display = 'none';
    alert("Success! Data successfully exported to Google Drive.");
  } catch (error) {
    const overlay = document.getElementById('sync-loading-overlay');
    if (overlay) overlay.style.display = 'none';
    alert("Export failed: " + error.message);
  }
};

window.handleGDriveImport = async function() {
  try {
    if (!GDriveSync.getAccessToken()) {
       const loggedIn = await GDriveSync.login();
       if (!loggedIn) return;
    }

    const overlay = document.getElementById('sync-loading-overlay');
    const overlayText = document.getElementById('sync-loading-text');
    
    const data = await GDriveSync.importData();
    if (!data) return; // User cancelled

    if (overlay) {
      overlay.style.display = 'flex';
      if (overlayText) overlayText.innerText = 'Importing data from Google Drive...';
    }

    // Process and save all data properties locally
    const saveToLocal = (keyMap, data) => {
        for (const [key, localKey] of Object.entries(keyMap)) {
            if (data[key] !== undefined) {
               localStorage.setItem(localKey, JSON.stringify(data[key]));
            }
        }
    };

    const coreKeys = {
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

    saveToLocal(coreKeys, data);

    if (data.accounts) localStorage.setItem('qe_accounts', JSON.stringify(data.accounts));
    if (data.settings) localStorage.setItem('qe_settings', JSON.stringify(data.settings));
    if (data.trades) localStorage.setItem('qe_trades', JSON.stringify(data.trades));

    if (overlay) overlay.style.display = 'none';
    
    if (window.reloadAppState) {
        window.reloadAppState();
    } else {
        alert("Import successful! Reloading page...");
        window.location.reload();
    }
  } catch (error) {
    const overlay = document.getElementById('sync-loading-overlay');
    if (overlay) overlay.style.display = 'none';
    alert("Import failed: " + error.message);
  }
};

window.handleGDriveDelete = async function() {
    try {
        if (!GDriveSync.getAccessToken()) {
            const loggedIn = await GDriveSync.login();
            if (!loggedIn) return;
         }
         await GDriveSync.deleteData();
    } catch(error) {
        alert("Delete failed: " + error.message);
    }
};
