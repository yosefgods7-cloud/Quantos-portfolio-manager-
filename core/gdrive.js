import { FirebaseService } from './firebase.js';

export const GDriveSync = {
  getAccessToken() {
    return FirebaseService.getWorkspaceAccessToken();
  },

  async login() {
    try {
      const result = await FirebaseService.loginWithGoogle();
      if (result === null) {
        // Redirecting, don't throw
        return false;
      }
      if (result && result.accessToken) {
        return true;
      }
      throw new Error("Google Drive permission was not granted. Please ensure you check the box to allow Google Drive access during sign-in.");
    } catch(err) {
      console.error("GDrive Login failed:", err);
      // Let handleGDriveSync catch and display this error
      throw err;
    }
  },

  // Search for the QuantEdge sync file
  async findSyncFile() {
    const token = this.getAccessToken();
    if (!token) throw new Error("No Drive access token. Please login with Google.");

    const res = await fetch('https://www.googleapis.com/drive/v3/files?q=name="quantedge_sync.json" and trashed=false&fields=files(id,name,modifiedTime)', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.error) {
       let errorMsg = data.error.message;
       if (data.error.code === 403) {
          errorMsg += " (If you are using a custom Firebase Config, please ensure the 'Google Drive API' is ENABLED in your Google Cloud Console project).";
       }
       throw new Error(errorMsg);
    }
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
    window.updateGDriveStatusIndicator();
  }
};

window.GDriveSync = GDriveSync;

window.updateGDriveStatusIndicator = async function() {
  const statusIcon = document.querySelector("#sidebar-gdrive-status i");
  const statusText = document.getElementById("sidebar-gdrive-text");
  
  if (!statusText || !statusIcon) return;

  if (!GDriveSync.getAccessToken()) {
    statusIcon.style.color = "var(--muted)";
    statusText.style.color = "var(--muted)";
    statusText.innerText = "Drive: Not Connected";
    return;
  }

  statusText.innerText = "Drive: Checking...";
  statusIcon.style.color = "var(--warning)";
  statusText.style.color = "var(--warning)";

  try {
    const file = await GDriveSync.findSyncFile();
    if (file && file.modifiedTime) {
      const date = new Date(file.modifiedTime);
      statusIcon.style.color = "var(--success)";
      statusText.style.color = "var(--success)";
      statusText.innerText = `Drive: Synced at ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    } else {
      statusIcon.style.color = "var(--muted)";
      statusText.style.color = "var(--muted)";
      statusText.innerText = "Drive: No Sync File";
    }
  } catch (error) {
    statusIcon.style.color = "var(--danger)";
    statusText.style.color = "var(--danger)";
    statusText.innerText = "Drive: Error";
  }
};

// Initialize the status indicator if token is available
setTimeout(() => {
  if (window.FirebaseService) {
    // Wait for auth to settle
    setTimeout(() => {
      window.updateGDriveStatusIndicator();
    }, 1500);
  }
}, 500);

// Attach functions to window for UI usage
window.doGDriveExport = async function() {
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
      dailyGoals: window.Store.dailyGoals || [],
      weeklyReviews: window.Store.weeklyReviews || [],
      accounts: window.Store.accounts || [],
      settings: window.Store.settings || {},
      trades: window.Store.trades || []
    };

    await GDriveSync.exportData(dataToSync);
    
    // update local synced time
    const updatedFile = await GDriveSync.findSyncFile();
    if (updatedFile && updatedFile.modifiedTime) {
        localStorage.setItem('qe_last_synced', updatedFile.modifiedTime);
    } else {
        localStorage.setItem('qe_last_synced', new Date().toISOString());
    }
    
    if (overlay) overlay.style.display = 'none';
    alert("Success! Data successfully exported to Google Drive.");
    window.updateGDriveStatusIndicator();
}

window.doGDriveImport = async function() {
    const overlay = document.getElementById('sync-loading-overlay');
    const overlayText = document.getElementById('sync-loading-text');
    
    const data = await GDriveSync.importData();
    if (!data) return;

    if (overlay) {
      overlay.style.display = 'flex';
      if (overlayText) overlayText.innerText = 'Importing data from Google Drive...';
    }

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
        dailyGoals: "qe_daily_goals",
        weeklyReviews: "qe_weekly_reviews"
    };

    saveToLocal(coreKeys, data);
    if (data.accounts) localStorage.setItem('qe_accounts', JSON.stringify(data.accounts));
    if (data.settings) localStorage.setItem('qe_settings', JSON.stringify(data.settings));
    if (data.trades) localStorage.setItem('qe_trades', JSON.stringify(data.trades));

    // Update synced times
    const syncedFile = await GDriveSync.findSyncFile();
    const syncTime = (syncedFile && syncedFile.modifiedTime) ? syncedFile.modifiedTime : new Date().toISOString();
    
    localStorage.setItem('qe_last_synced', syncTime);
    localStorage.setItem('qe_last_modified', syncTime);

    if (overlay) overlay.style.display = 'none';
    
    if (window.reloadAppState) {
        window.reloadAppState();
    } else {
        alert("Import successful! Reloading page...");
        window.location.reload();
    }
}

window.handleGDriveSync = async function() {
  try {
    if (!GDriveSync.getAccessToken()) {
       const loggedIn = await GDriveSync.login();
       if (!loggedIn) return;
    }
    
    const overlay = document.getElementById('sync-loading-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      document.getElementById('sync-loading-text').innerText = 'Checking Cloud Version...';
    }

    const file = await GDriveSync.findSyncFile();
    
    const localModifiedRaw = localStorage.getItem('qe_last_modified');
    const localSyncedRaw = localStorage.getItem('qe_last_synced') || "1970-01-01T00:00:00.000Z";
    const localModTime = localModifiedRaw ? new Date(localModifiedRaw).getTime() : 0;
    const localSyncTime = new Date(localSyncedRaw).getTime();

    if (overlay) overlay.style.display = 'none';

    if (!file) {
        // No cloud file, safe to export
        await window.doGDriveExport();
        return;
    }

    const cloudTime = new Date(file.modifiedTime).getTime();
    
    const localNewer = localModTime > localSyncTime;
    const cloudNewer = cloudTime > localSyncTime;

    if (localNewer && cloudNewer) {
        // CONFLICT
        document.getElementById('gdrive-local-time').innerText = "Last modified: " + new Date(localModTime).toLocaleString();
        document.getElementById('gdrive-cloud-time').innerText = "Last modified: " + new Date(cloudTime).toLocaleString();
        window.openModal('modal-gdrive-conflict');
    } else if (cloudNewer) {
        // Safe to import
        await window.doGDriveImport();
    } else if (localNewer) {
        // Safe to export
        await window.doGDriveExport();
    } else {
        alert("Your data is already perfectly in sync with Google Drive.");
    }
  } catch(error) {
    const overlay = document.getElementById('sync-loading-overlay');
    if (overlay) overlay.style.display = 'none';
    alert("Sync failed: " + error.message);
  }
};

window.resolveGDriveConflict = async function(choice) {
    window.closeModal('modal-gdrive-conflict');
    try {
        if (choice === 'local') {
            await window.doGDriveExport();
        } else {
            await window.doGDriveImport();
        }
    } catch(err) {
        alert("Action failed: " + err.message);
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
