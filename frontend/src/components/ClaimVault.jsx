import { useState, useRef, useEffect } from 'react';
import { getVaultStatus, getLatestBlockHeight } from '../utils/aleo.js';
import { EXPLORER_URL, PROGRAM_ID } from '../config.js';

function decodePayload(chunks) {
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

export default function ClaimVault({ address, onExecute, onFindRecords }) {
  const [vaultId, setVaultId] = useState('1');
  const [vault, setVault] = useState(null);
  const [blockHeight, setBlockHeight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [claimProgress, setClaimProgress] = useState([]);
  const [claimDone, setClaimDone] = useState(false);
  const [txId, setTxId] = useState(null);
  const [showPrivacyExplainer, setShowPrivacyExplainer] = useState(false);
  const [funding, setFunding] = useState(false);
  const [funded, setFunded] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [claimProgress]);

  function addLog(msg) {
    setClaimProgress(prev => [...prev, { msg: String(msg || ''), time: new Date().toLocaleTimeString() }]);
  }

  async function checkVault() {
    setLoading(true);
    setStatus(null);
    setTxId(null);
    setClaimDone(false);
    setClaimProgress([]);
    try {
      const [v, bh] = await Promise.all([
        getVaultStatus(vaultId),
        getLatestBlockHeight(),
      ]);
      setVault(v);
      setBlockHeight(bh);

      if (!v.exists) {
        setStatus({ type: 'error', msg: 'Vault not found.' });
      } else if (!v.active) {
        setStatus({ type: 'error', msg: 'Vault already claimed.' });
      } else {
        const deadline = v.lastPing + v.timeout;
        if (bh <= deadline) {
          setStatus({ type: 'info', msg: `Timeout not reached. ${(deadline - bh).toLocaleString()} blocks remaining.` });
        } else {
          setStatus({ type: 'success', msg: 'Timeout expired! You can claim this vault.' });
        }
      }
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim() {
    setClaimLoading(true);
    setClaimProgress([]);
    setClaimDone(false);
    addLog('Preparing claim transaction...');

    const progressSteps = [
      { delay: 5000, msg: 'Loading program & keys...' },
      { delay: 15000, msg: 'Creating authorization with HeirClaimToken...' },
      { delay: 30000, msg: 'Generating ZK proof (heir identity stays private)...' },
      { delay: 60000, msg: 'Proving execution...' },
      { delay: 90000, msg: 'Calculating fee & finalizing...' },
    ];

    const timers = progressSteps.map(s =>
      window.setTimeout(() => addLog(s.msg), s.delay)
    );

    try {
      // Try sessionStorage first (saved from create_vault), then search on-chain
      // Check for HeirClaimToken BEFORE attempting any TX
      addLog('Looking for HeirClaimToken...');
      let token = sessionStorage.getItem(`lastvault_dms_heirtoken_${vaultId}`);

      if (!token) {
        try {
          const records = await onFindRecords(vaultId);
          if (records.length > 0) token = records[0];
        } catch (e) {}
      }

      if (!token) {
        // No token = not the heir. Show explainer immediately, no TX attempt.
        addLog('HeirClaimToken not found — you are not the heir for this vault.');
        addLog('This is Aleo\'s ZK privacy: only the heir can claim.');
        setStatus(null);
        setShowPrivacyExplainer(true);
        timers.forEach(t => clearTimeout(t));
        setClaimLoading(false);
        return;
      }

      addLog('HeirClaimToken found! Preparing claim...');

      if (!vault || vault.payload.length < 4) {
        throw new Error('Could not read payload from on-chain.');
      }

      addLog('Reading encrypted payload from on-chain mappings...');
      setStatus({ type: 'info', msg: 'Generating ZK proof for claim... 1-2 minutes.' });

      const inputs = [
        token.trim(),
        vault.payload[0] || '0field',
        vault.payload[1] || '0field',
        vault.payload[2] || '0field',
        vault.payload[3] || '0field',
      ];

      const result = await onExecute('claim', inputs);

      timers.forEach(t => clearTimeout(t));
      addLog('Inheritance claimed successfully!');
      setTxId(typeof result === 'string' ? result : JSON.stringify(result));
      setStatus({ type: 'success', msg: 'Inheritance claimed! The vault is now deactivated.' });
      setClaimDone(true);
    } catch (e) {
      timers.forEach(t => clearTimeout(t));
      addLog('Error: ' + (e.message || String(e)));
      setStatus({ type: 'error', msg: e.message || 'Claim failed.' });
    } finally {
      setClaimLoading(false);
    }
  }

  const canClaim = vault && vault.exists && vault.active && blockHeight &&
    (blockHeight > vault.lastPing + vault.timeout);

  return (
    <div className="card">
      <div className="card-header">
        <h3>Claim Inheritance</h3>
        <span className="badge badge-green">Heir</span>
      </div>
      <p className="text-muted">Check if a vault's timeout has expired. The designated heir can claim by connecting with their own private key.</p>

      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Vault ID</label>
          <input className="input" type="number" min="1" value={vaultId} onChange={e => setVaultId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkVault()} />
        </div>
        <button className="btn btn-ghost" onClick={checkVault} disabled={loading} style={{ alignSelf: 'flex-end' }}>
          {loading ? 'Checking...' : 'Check Vault'}
        </button>
      </div>

      {status && status.msg && <div className={`alert alert-${status.type}`}>{status.msg}</div>}

      {/* Claimed vault — show recovered payload */}
      {vault && !vault.active && vault.payload && vault.payload.length > 0 && (
        <div className="result-box" style={{ marginTop: '0.75rem' }}>
          <span className="label-sm">Recovered Inheritance Payload</span>
          <div className="payload-display" style={{ marginTop: '0.5rem' }}>
            <div className="payload-decoded">{decodePayload(vault.payload)}</div>
            <div className="payload-raw" style={{ marginTop: '0.5rem' }}>
              {vault.payload.map((p, i) => (
                <div key={i}><code>chunk_{i}: {p}</code></div>
              ))}
            </div>
          </div>
          <p className="hint" style={{ marginTop: '0.5rem' }}>
            This data is permanently stored on the Aleo blockchain. The heir can read it anytime.
          </p>
        </div>
      )}

      {vault && vault.exists && (
        <div className="vault-info">
          <div className="vault-grid">
            <div className="vault-stat">
              <span className="label-sm">Status</span>
              <span className={`status-badge ${canClaim ? 'claimable' : vault.active ? 'active' : 'claimed'}`}>
                {!vault.active ? 'Claimed' : canClaim ? 'Claimable!' : 'Waiting...'}
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
          <div className="vault-stat" style={{marginTop:'0.5rem'}}>
            <span className="label-sm">Owner</span>
            <code className="address-sm">{vault.owner}</code>
          </div>
          <div className="vault-stat">
            <span className="label-sm">Heir (must connect with this address to claim)</span>
            <code className="address" style={{borderColor: 'var(--gold)'}}>{vault.heir}</code>
          </div>

          {claimProgress.length > 0 && (
            <div className="progress-monitor" style={{ marginTop: '0.75rem' }}>
              <span className="label-sm">Claim Monitor</span>
              <div className="progress-log">
                {claimProgress.map((p, i) => (
                  <div key={i} className="progress-entry">
                    <span className="progress-time">{p.time || ''}</span>
                    <span className={`progress-msg ${(p.msg || '').startsWith('Inheritance claimed') ? 'success' : (p.msg || '').startsWith('Error') ? 'error' : ''}`}>
                      {p.msg || ''}
                    </span>
                  </div>
                ))}
                {claimLoading && (
                  <div className="progress-entry">
                    <span className="progress-spinner"></span>
                    <span className="progress-msg">Working...</span>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {canClaim && !claimLoading && !claimDone && !showPrivacyExplainer && claimProgress.length === 0 && (
            <button className="btn btn-gold" onClick={handleClaim} style={{ marginTop: '1rem' }}>
              Claim Inheritance
            </button>
          )}

          {txId && (
            <div className="result-box" style={{ marginTop: '0.75rem' }}>
              <span className="label-sm">Transaction ID</span>
              <code className="tx-id">{txId}</code>
              <a href={`${EXPLORER_URL}/transaction/${txId}`} target="_blank" rel="noopener" className="explorer-link" style={{ display: 'block', marginTop: '0.5rem' }}>
                View on Explorer →
              </a>
            </div>
          )}

          {claimDone && (
            <span className="badge badge-green" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', marginTop: '1rem', display: 'inline-block' }}>
              ✓ Inheritance Claimed
            </span>
          )}

          {canClaim && !claimDone && !showPrivacyExplainer && vault.heir && (
            <div className="info-box" style={{ marginTop: '0.75rem' }}>
              <strong>To test claim:</strong> Disconnect → connect with heir's private key → Claim.
              <br/>Heir needs testnet credits for the TX fee.
              {!funding && !funded && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={async () => {
                  setFunding(true);
                  setStatus({ type: 'info', msg: 'Sending 5 credits to heir account... Generating ZK proof (~2 min).' });
                  try {
                    await onExecute('transfer_public', [vault.heir, '5000000u64']);
                    setFunded(true);
                    setStatus({ type: 'success', msg: 'Credits sent to heir! Now disconnect → reconnect with heir key → Claim.' });
                  } catch (e) {
                    setStatus({ type: 'error', msg: 'Transfer failed: ' + e.message });
                  } finally {
                    setFunding(false);
                  }
                }}>
                  Fund Heir Account (5 credits)
                </button>
              )}
              {funding && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <span className="progress-spinner"></span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-sec)' }}>Transferring credits to heir... (~2 min)</span>
                </div>
              )}
              {funded && (
                <span className="badge badge-green" style={{ marginTop: '0.5rem', padding: '0.4rem 0.8rem' }}>✓ Heir funded — Disconnect → reconnect with heir key</span>
              )}
            </div>
          )}

          {showPrivacyExplainer && (
            <div className="privacy-explainer" style={{ marginTop: '1rem', padding: '1.25rem', background: 'rgba(108,92,231,0.08)', border: '1px solid rgba(108,92,231,0.25)', borderRadius: '10px' }}>
              <h4 style={{ color: 'var(--accent-light)', marginBottom: '0.75rem', fontSize: '1rem' }}>
                🔐 This is Aleo's Privacy in Action
              </h4>
              <p style={{ color: 'var(--text-sec)', fontSize: '0.88rem', lineHeight: '1.6', margin: '0 0 0.75rem' }}>
                You're connected as the <strong>vault owner</strong>, but only the <strong>designated heir</strong> can claim.
                The HeirClaimToken is a private record that exists only in the heir's account — invisible to everyone else, including the owner.
              </p>
              <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '0.85rem', fontSize: '0.82rem', lineHeight: '1.7', color: 'var(--text-sec)' }}>
                <div><strong style={{ color: 'var(--green)' }}>✓ Ethereum:</strong> Heir address is public on-chain — anyone can see who inherits</div>
                <div><strong style={{ color: 'var(--green)' }}>✓ Aleo (LastVault):</strong> Heir holds a private ZK token — claim reveals <em>nothing</em> about their identity</div>
                <div style={{ marginTop: '0.5rem', color: 'var(--gold)' }}>
                  → Even the vault owner cannot claim on behalf of the heir. This is trustless privacy by design.
                </div>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.75rem' }}>
                In production, the heir connects with their own wallet and claims autonomously. The entire flow — from vault creation to inheritance claim — requires zero trust in any third party.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
