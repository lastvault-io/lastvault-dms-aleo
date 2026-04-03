import { PROGRAM_ID, NETWORK_URL } from '../config.js';

// Lightweight RPC client for reading public mappings
// Does NOT require WASM — works in main thread

async function fetchMapping(mappingName, key) {
  const url = `${NETWORK_URL}/testnet/program/${PROGRAM_ID}/mapping/${mappingName}/${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    // Remove quotes and type suffixes for display
    return text.replace(/^"|"$/g, '');
  } catch (e) {
    console.error(`Failed to fetch mapping ${mappingName}[${key}]:`, e);
    return null;
  }
}

export async function getVaultStatus(vaultId) {
  const fieldKey = vaultId.endsWith('field') ? vaultId : vaultId + 'field';

  const [lastPing, timeout, active, owner, heir, p0, p1, p2, p3] = await Promise.all([
    fetchMapping('last_ping', fieldKey),
    fetchMapping('timeout_period', fieldKey),
    fetchMapping('vault_active', fieldKey),
    fetchMapping('vault_owner', fieldKey),
    fetchMapping('vault_heir', fieldKey),
    fetchMapping('payload_chunk_0', fieldKey),
    fetchMapping('payload_chunk_1', fieldKey),
    fetchMapping('payload_chunk_2', fieldKey),
    fetchMapping('payload_chunk_3', fieldKey),
  ]);

  return {
    exists: lastPing !== null,
    lastPing: lastPing ? parseInt(lastPing.replace('u32', '')) : null,
    timeout: timeout ? parseInt(timeout.replace('u32', '')) : null,
    active: active === 'true',
    owner: owner || null,
    heir: heir || null,
    payload: [p0, p1, p2, p3].filter(Boolean),
  };
}

export async function getLatestBlockHeight() {
  try {
    const res = await fetch(`${NETWORK_URL}/testnet/latest/height`);
    if (!res.ok) return null;
    const text = await res.text();
    return parseInt(text);
  } catch (e) {
    console.error('Failed to fetch block height:', e);
    return null;
  }
}
