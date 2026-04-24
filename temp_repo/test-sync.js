global.window = {};
global.document = { addEventListener: () => {}, getElementById: () => ({ style: {} }) };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.alert = console.log;
global.confirm = () => true;

import('./core/sync.js').then(m => {
  console.log('forcePullFromCloud type:', typeof m.SyncEngine.forcePullFromCloud);
}).catch(e => console.error(e));
