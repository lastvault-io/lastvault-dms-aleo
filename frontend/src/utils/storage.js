const STORAGE_PREFIX = 'lastvault_dms_';

export function saveRecord(key, record) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(record));
  } catch (e) {
    console.error('Failed to save record:', e);
  }
}

export function loadRecord(key) {
  try {
    const data = localStorage.getItem(STORAGE_PREFIX + key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Failed to load record:', e);
    return null;
  }
}

export function removeRecord(key) {
  localStorage.removeItem(STORAGE_PREFIX + key);
}

export function savePrivateKey(pk) {
  sessionStorage.setItem(STORAGE_PREFIX + 'pk', pk);
}

export function loadPrivateKey() {
  return sessionStorage.getItem(STORAGE_PREFIX + 'pk');
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_PREFIX + 'pk');
}
