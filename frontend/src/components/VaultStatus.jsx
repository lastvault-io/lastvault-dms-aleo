import { useState } from 'react';
import { getVaultStatus, getLatestBlockHeight } from '../utils/aleo.js';
import { EXPLORER_URL, PROGRAM_ID } from '../config.js';

function decodePayloadChunks(chunks) {
  try {
    const bytes = [];
    for (const chunk of chunks) {
      let val = BigInt(chunk.replace('field', ''));
      for (let i = 0; i < 31; i++) {
        const byte = Number(val & 0xFFn);
        if (byte > 0) bytes.push(byte);
        val >>= 8n;
      }
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return chunks.join(', ');
  }
}

export default function VaultStatus() {
  const [vaultId, setVaultId] = useState('1');
  const [vault, setVault] = useState(null);
  const [blockHeight, setBlockHeight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setVault(null);
    try {
      const [v, bh] = await Promise.all([
        getVaultStatus(vaultId),
        getLatestBlockHeight(),
      ]);
      setVault(v);
      setBlockHeight(bh);
      if (!v.exists) setError('Vault not found on-chain.');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const remaining = vault && vault.lastPing && vault.timeout && blockHeight
    ? Math.max(0, (vault.lastPing + vault.timeout) - blockHeight) : null;

  return (
    <div className="card">
      <div className="card-header">
        <h3>Vault Explorer</h3>
        <span className="badge badge-accent">Public</span>
      </div>
      <p className="text-muted">Query any vault's public on-chain state. No wallet connection required.</p>

      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Vault ID</label>
          <input className="input" type="number" min="1" value={vaultId} onChange={e => setVaultId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        </div>
        <button className="btn btn-primary" onClick={handleSearch} disabled={loading} style={{ alignSelf: 'flex-end' }}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {vault && vault.exists && (
        <div className="vault-info">
          <div className="explorer-grid">
            <div className="explorer-row">
              <span className="explorer-label">Status</span>
              <span className={`status-badge ${vault.active ? 'active' : 'claimed'}`}>
                {vault.active ? 'Active' : 'Claimed'}
              </span>
            </div>
            <div className="explorer-row">
              <span className="explorer-label">Owner</span>
              <code className="address">{vault.owner}</code>
            </div>
            <div className="explorer-row">
              <span className="explorer-label">Heir</span>
              <code className="address">{vault.heir}</code>
            </div>
            <div className="explorer-row">
              <span className="explorer-label">Last Ping</span>
              <span>Block #{vault.lastPing?.toLocaleString()}</span>
            </div>
            <div className="explorer-row">
              <span className="explorer-label">Timeout</span>
              <span>{vault.timeout?.toLocaleString()} blocks</span>
            </div>
            <div className="explorer-row">
              <span className="explorer-label">Current Block</span>
              <span>#{blockHeight?.toLocaleString()}</span>
            </div>
            {remaining !== null && (
              <div className="explorer-row">
                <span className="explorer-label">Time Remaining</span>
                <span style={{ color: remaining === 0 ? 'var(--red)' : 'var(--green)' }}>
                  {remaining === 0 ? 'EXPIRED' : `${remaining.toLocaleString()} blocks`}
                </span>
              </div>
            )}
            {vault.payload.length > 0 && (
              <div className="explorer-row">
                <span className="explorer-label">Payload</span>
                <div>
                  <div className="payload-decoded" style={{marginBottom:'0.5rem'}}>{decodePayloadChunks(vault.payload)}</div>
                  <div className="payload-raw">
                    {vault.payload.map((p, i) => (
                      <div key={i}><code>chunk_{i}: {p}</code></div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="explorer-links">
            <a href={`${EXPLORER_URL}/program/${PROGRAM_ID}`} target="_blank" rel="noopener">
              View Program on Explorer
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
