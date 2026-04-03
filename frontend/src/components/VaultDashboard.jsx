import { useState, useRef, useEffect } from 'react';
import { getVaultStatus, getLatestBlockHeight } from '../utils/aleo.js';
import { EXPLORER_URL, PROGRAM_ID } from '../config.js';

export default function VaultDashboard({ address, onExecute, onFindRecords, onDecryptRecords, initialVaultId, onNavigate }) {
  const [vaultId, setVaultId] = useState(initialVaultId || '2');
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [vault, setVault] = useState(null);
  const [blockHeight, setBlockHeight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pingLoading, setPingLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [pingProgress, setPingProgress] = useState([]);
  const [pingDone, setPingDone] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pingProgress]);

  function addLog(msg) {
    setPingProgress(prev => [...prev, { msg: String(msg || ''), time: new Date().toLocaleTimeString() }]);
  }

  // Auto-load when navigated from Create Vault
  useEffect(() => {
    if (initialVaultId && !autoLoaded) {
      setVaultId(initialVaultId);
      setAutoLoaded(true);
      loadVault();
    }
  }, [initialVaultId]);

  // Auto-refresh block height every 10s
  useEffect(() => {
    if (!vault || !vault.exists) return;
    const interval = setInterval(async () => {
      try {
        const bh = await getLatestBlockHeight();
        if (bh) setBlockHeight(bh);
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [vault]);

  async function loadVault() {
    setLoading(true);
    setStatus(null);
    try {
      const [v, bh] = await Promise.all([
        getVaultStatus(vaultId),
        getLatestBlockHeight(),
      ]);
      setVault(v);
      setBlockHeight(bh);
      if (!v.exists) setStatus({ type: 'error', msg: 'Vault not found on testnet.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handlePing() {
    setPingLoading(true);
    setPingProgress([]);
    setPingDone(false);
    setStatus({ type: 'info', msg: 'Generating ZK proof for ping... This takes 1-2 minutes.' });
    addLog('Preparing ping transaction...');
    addLog('VaultOwnerKey record will be consumed and re-issued (replay protection)');

    const progressSteps = [
      { delay: 5000, msg: 'Loading program & synthesizing keys...' },
      { delay: 15000, msg: 'Creating authorization...' },
      { delay: 30000, msg: 'Executing ping (ZK proof generation)...' },
      { delay: 60000, msg: 'Proving execution...' },
      { delay: 90000, msg: 'Calculating fee & finalizing...' },
    ];

    const timers = progressSteps.map(s =>
      window.setTimeout(() => addLog(s.msg), s.delay)
    );

    try {
      addLog('Searching for VaultOwnerKey record on-chain...');

      // Auto-find records belonging to this account
      let records = [];
      try {
        records = await onFindRecords(vaultId);
        addLog(`Found ${records.length} record(s) for this account.`);
      } catch (e) {
        addLog('Record search failed: ' + e.message);
      }

      // Use stored record first (from create_vault), then try found records
      let record = sessionStorage.getItem(`lastvault_dms_ownerkey_${vaultId}`) || (records.length > 0 ? records[0] : null);

      if (!record) {
        throw new Error('VaultOwnerKey record not found. Make sure you are the vault owner and have sufficient transaction history on testnet.');
      }

      addLog('VaultOwnerKey found. Sending ping...');
      const result = await onExecute('ping', [record.trim()]);
      const txIdStr = typeof result === 'string' ? result : JSON.stringify(result);

      timers.forEach(t => clearTimeout(t));
      addLog('Ping TX submitted: ' + txIdStr);

      // Decrypt new VaultOwnerKey from ping TX output (old one consumed, new one issued)
      addLog('Waiting for TX confirmation & decrypting new VaultOwnerKey...');
      for (const delay of [5000, 10000, 15000, 20000]) {
        await new Promise(r => window.setTimeout(r, delay));
        try {
          const records = await onDecryptRecords(txIdStr);
          if (records && records.length > 0) {
            sessionStorage.setItem(`lastvault_dms_ownerkey_${vaultId}`, records[0]);
            addLog('New VaultOwnerKey saved for next ping.');
            break;
          }
        } catch (e) {
          addLog('Waiting for confirmation...');
        }
      }

      addLog('Ping successful! Timer reset.');
      setStatus({ type: 'success', msg: 'Ping sent! Timer has been reset.' });
      setPingDone(true);

      // Reload vault data
      await loadVault();

      // Reset UI after 5s so ping button reappears
      window.setTimeout(() => {
        setPingDone(false);
        setPingProgress([]);
      }, 5000);
    } catch (e) {
      timers.forEach(t => clearTimeout(t));
      addLog('Error: ' + (e.message || String(e)));
      setStatus({ type: 'error', msg: e.message || 'Ping failed.' });
    } finally {
      setPingLoading(false);
    }
  }

  const remaining = vault && vault.lastPing && vault.timeout && blockHeight
    ? Math.max(0, (vault.lastPing + vault.timeout) - blockHeight) : null;
  const isExpired = remaining !== null && remaining <= 0;
  const progress = vault && vault.timeout && remaining !== null
    ? Math.min(100, ((vault.timeout - remaining) / vault.timeout) * 100) : 0;

  return (
    <div className="card">
      <div className="card-header">
        <h3>My Vault</h3>
        <span className="badge badge-accent">Live On-Chain</span>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Vault ID</label>
          <input className="input" type="number" min="1" value={vaultId} onChange={e => setVaultId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadVault()} />
        </div>
        <button className="btn btn-ghost" onClick={loadVault} disabled={loading} style={{ alignSelf: 'flex-end' }}>
          {loading ? 'Loading...' : 'Load Vault'}
        </button>
      </div>

      {status && <div className={`alert alert-${status.type}`}>{status.msg}</div>}

      {vault && vault.exists && (
        <div className="vault-info">
          <div className="vault-grid">
            <div className="vault-stat">
              <span className="label-sm">Status</span>
              <span className={`status-badge ${vault.active ? 'active' : 'claimed'}`}>
                {vault.active ? 'Active' : 'Claimed'}
              </span>
            </div>
            <div className="vault-stat">
              <span className="label-sm">Last Ping</span>
              <span className="value">Block #{vault.lastPing?.toLocaleString()}</span>
            </div>
            <div className="vault-stat">
              <span className="label-sm">Timeout</span>
              <span className="value">{vault.timeout?.toLocaleString()} blocks</span>
            </div>
            <div className="vault-stat">
              <span className="label-sm">Current Block</span>
              <span className="value">#{blockHeight?.toLocaleString()}</span>
            </div>
          </div>

          <div className="vault-stat" style={{ marginTop: '0.75rem' }}>
            <span className="label-sm">Owner</span>
            <code className="address">{vault.owner}</code>
          </div>
          <div className="vault-stat">
            <span className="label-sm">Heir</span>
            <code className="address">{vault.heir}</code>
          </div>

          {vault.active && remaining !== null && (
            <div className="timer-section">
              <span className="label-sm">Dead-Man's Switch Timer</span>
              <div className="progress-bar">
                <div className="progress-fill progress-animated" style={{
                  width: `${progress}%`,
                  background: isExpired
                    ? 'var(--red)'
                    : progress > 75 ? 'linear-gradient(90deg, var(--orange), var(--red))'
                    : progress > 40 ? 'linear-gradient(90deg, var(--green), var(--orange))'
                    : 'var(--green)',
                }}></div>
              </div>
              <div className="timer-text">
                {isExpired
                  ? <span className="text-red">TIMEOUT EXPIRED — Heir can claim</span>
                  : (
                    <span>
                      <strong>{remaining.toLocaleString()}</strong> blocks remaining
                      <span style={{color:'var(--text-muted)', marginLeft:'0.5rem'}}>
                        (~{Math.ceil(remaining * 15 / 60)} min)
                      </span>
                    </span>
                  )
                }
              </div>
              {!isExpired && (
                <div className="timer-detail">
                  <span>Deadline: Block #{(vault.lastPing + vault.timeout).toLocaleString()}</span>
                  <span>Current: #{blockHeight?.toLocaleString()}</span>
                  <span>{progress.toFixed(1)}% elapsed</span>
                </div>
              )}
            </div>
          )}

          {pingProgress.length > 0 && (
            <div className="progress-monitor" style={{ marginTop: '0.75rem' }}>
              <span className="label-sm">Ping Monitor</span>
              <div className="progress-log">
                {pingProgress.map((p, i) => (
                  <div key={i} className="progress-entry">
                    <span className="progress-time">{p.time || ''}</span>
                    <span className={`progress-msg ${(p.msg || '').startsWith('Ping successful') ? 'success' : (p.msg || '').startsWith('Error') ? 'error' : ''}`}>
                      {p.msg || ''}
                    </span>
                  </div>
                ))}
                {pingLoading && (
                  <div className="progress-entry">
                    <span className="progress-spinner"></span>
                    <span className="progress-msg">Working...</span>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {vault.active && !isExpired && !pingLoading && !pingDone && (
            <button className="btn btn-primary" onClick={handlePing} style={{ marginTop: '1rem' }}>
              Ping (Reset Timer)
            </button>
          )}

          {vault.active && isExpired && (
            <div style={{ marginTop: '1rem' }}>
              <button className="btn btn-gold" onClick={() => onNavigate && onNavigate('claim', vaultId)}>
                Go to Claim →
              </button>
              <p className="hint" style={{ marginTop: '0.5rem' }}>Timeout expired. The designated heir can now claim this vault's inheritance.</p>
            </div>
          )}

          {pingDone && (
            <span className="badge badge-green" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', marginTop: '1rem', display: 'inline-block' }}>
              ✓ Ping Sent — Timer Reset
            </span>
          )}

          <div className="explorer-links" style={{ marginTop: '1rem' }}>
            <a href={`${EXPLORER_URL}/program/${PROGRAM_ID}`} target="_blank" rel="noopener">View Contract</a>
          </div>
        </div>
      )}
    </div>
  );
}
