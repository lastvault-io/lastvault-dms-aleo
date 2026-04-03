import { useState, useEffect } from 'react';
import { getVaultStatus, getLatestBlockHeight } from '../utils/aleo.js';
import { EXPLORER_URL, PROGRAM_ID } from '../config.js';

const DEPLOY_TX = 'at1v3fhe2nwpvjftg775fj4dulutr2s24xjyv4al9vjnh846hutus9snnsqww';
const EXEC_TX = 'at1quccv4xm6ffze50038l9a9n7en4udgfufevlt0lxts8a7w353qyqfdwun7';

export default function VaultDemo() {
  const [vault, setVault] = useState(null);
  const [blockHeight, setBlockHeight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => { loadVault(); }, []);

  async function loadVault() {
    setLoading(true);
    try {
      const [v, bh] = await Promise.all([getVaultStatus('1'), getLatestBlockHeight()]);
      setVault(v);
      setBlockHeight(bh);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function nextStep() {
    setSimulating(true);
    await new Promise(r => setTimeout(r, 1200));
    setStep(s => Math.min(s + 1, 4));
    setSimulating(false);
  }

  const remaining = vault?.lastPing && vault?.timeout && blockHeight
    ? Math.max(0, (vault.lastPing + vault.timeout) - blockHeight) : null;
  const isExpired = remaining !== null && remaining <= 0;
  const progress = vault?.timeout && remaining !== null
    ? Math.min(100, ((vault.timeout - remaining) / vault.timeout) * 100) : 0;

  return (
    <div>
      {/* Real On-Chain Vault Data */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <h3>Live Vault #1 on Aleo Testnet</h3>
          <span className="badge badge-green">Real On-Chain Data</span>
        </div>

        {loading ? (
          <div className="alert alert-info">Reading from Aleo testnet...</div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : vault?.exists ? (
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

            <div className="vault-stat" style={{marginTop:'0.75rem'}}>
              <span className="label-sm">Owner</span>
              <code className="address">{vault.owner}</code>
            </div>
            <div className="vault-stat">
              <span className="label-sm">Heir (ZK-private, shown for demo)</span>
              <code className="address">{vault.heir}</code>
            </div>

            {vault.active && remaining !== null && (
              <div className="timer-section">
                <span className="label-sm">Dead-Man's Switch Timer</span>
                <div className="progress-bar">
                  <div className="progress-fill" style={{
                    width: `${progress}%`,
                    background: isExpired ? 'var(--red)' : progress > 75 ? 'var(--orange)' : 'var(--green)',
                  }}></div>
                </div>
                <div className="timer-text">
                  {isExpired
                    ? <span className="text-red">TIMEOUT EXPIRED — Heir can claim</span>
                    : <span>{remaining?.toLocaleString()} blocks remaining</span>}
                </div>
              </div>
            )}

            <div className="explorer-links" style={{marginTop:'0.75rem'}}>
              <a href={`${EXPLORER_URL}/transaction/${DEPLOY_TX}`} target="_blank" rel="noopener">Deploy TX</a>
              <span style={{color:'var(--text-muted)',margin:'0 0.5rem'}}>•</span>
              <a href={`${EXPLORER_URL}/transaction/${EXEC_TX}`} target="_blank" rel="noopener">create_vault TX</a>
              <span style={{color:'var(--text-muted)',margin:'0 0.5rem'}}>•</span>
              <a href={`${EXPLORER_URL}/program/${PROGRAM_ID}`} target="_blank" rel="noopener">Program Code</a>
            </div>
          </div>
        ) : (
          <div className="alert alert-error">Vault #1 not found on testnet.</div>
        )}

        <button className="btn btn-ghost" onClick={loadVault} disabled={loading} style={{marginTop:'0.75rem'}}>
          {loading ? 'Loading...' : 'Refresh On-Chain Data'}
        </button>
      </div>

      {/* Interactive Walkthrough */}
      <div className="card">
        <div className="card-header">
          <h3>Interactive Walkthrough</h3>
          <span className="badge badge-accent">Step-by-Step</span>
        </div>
        <p className="text-muted" style={{marginBottom:'1rem'}}>Walk through the complete inheritance flow. Click each step to proceed.</p>

        <div className="demo-steps">
          {/* Step 1 */}
          <div className={`demo-step ${step >= 0 ? 'active' : ''}`}>
            <div className="step-header">
              <span className="step-num">{step > 0 ? '✓' : '1'}</span>
              <span className="step-title">Owner Creates Vault</span>
            </div>
            {step === 0 && (
              <div className="step-content">
                <p>Alice creates an inheritance vault with her heir Bob and a 1000-block timeout:</p>
                <div className="code-block">
                  <div><span className="code-key">transition</span> create_vault(</div>
                  <div style={{paddingLeft:'1rem'}}>vault_id: <span className="code-val">1field</span>,</div>
                  <div style={{paddingLeft:'1rem'}}>heir: <span className="code-val">aleo1bob...rf2</span>,</div>
                  <div style={{paddingLeft:'1rem'}}>timeout: <span className="code-val">1000u32</span>,</div>
                  <div style={{paddingLeft:'1rem'}}>payload: <span className="code-val">[encrypted_master_key]</span></div>
                  <div>)</div>
                </div>
                <div className="step-detail">
                  <strong>Output:</strong> VaultOwnerKey (private, Alice only) + HeirClaimToken (private, Bob only).<br/>
                  <span style={{color:'var(--green)'}}>Bob's identity never appears on-chain in plaintext.</span>
                </div>
                <button className="btn btn-primary" onClick={nextStep} disabled={simulating}>
                  {simulating ? 'Generating ZK Proof...' : 'Execute create_vault →'}
                </button>
              </div>
            )}
          </div>

          {/* Step 2 */}
          <div className={`demo-step ${step >= 1 ? 'active' : ''}`}>
            <div className="step-header">
              <span className="step-num">{step > 1 ? '✓' : '2'}</span>
              <span className="step-title">Owner Pings (Proof of Life)</span>
            </div>
            {step === 1 && (
              <div className="step-content">
                <p>Alice periodically calls <code>ping()</code> to prove she's alive:</p>
                <div className="code-block">
                  <div><span className="code-key">transition</span> ping(key: VaultOwnerKey)</div>
                  <div style={{paddingLeft:'1rem'}}>→ Old key <span className="code-val">consumed</span> (replay protection)</div>
                  <div style={{paddingLeft:'1rem'}}>→ New key <span className="code-val">issued</span></div>
                  <div style={{paddingLeft:'1rem'}}>→ Timer <span className="code-val">reset</span> to current block</div>
                </div>
                <button className="btn btn-primary" onClick={nextStep} disabled={simulating}>
                  {simulating ? 'Pinging...' : 'Execute ping →'}
                </button>
              </div>
            )}
          </div>

          {/* Step 3 */}
          <div className={`demo-step ${step >= 2 ? 'active' : ''}`}>
            <div className="step-header">
              <span className="step-num">{step > 2 ? '✓' : '3'}</span>
              <span className="step-title">Timeout Expires</span>
            </div>
            {step === 2 && (
              <div className="step-content">
                <p>Alice stops pinging. After 1000 blocks (~4 hours), the DMS triggers:</p>
                <div className="timeout-visual">
                  <div className="progress-bar"><div className="progress-fill" style={{width:'100%',background:'var(--red)'}}></div></div>
                  <span style={{color:'var(--red)',fontWeight:600}}>TIMEOUT EXPIRED — Dead-Man's Switch activated</span>
                </div>
                <p className="step-detail">Verification: <code>block.height &gt; last_ping + timeout_period</code> — pure on-chain, no trusted third party.</p>
                <button className="btn btn-gold" onClick={nextStep} disabled={simulating}>
                  {simulating ? 'Processing...' : 'Proceed to Claim →'}
                </button>
              </div>
            )}
          </div>

          {/* Step 4 */}
          <div className={`demo-step ${step >= 3 ? 'active' : ''}`}>
            <div className="step-header">
              <span className="step-num">{step > 3 ? '✓' : '4'}</span>
              <span className="step-title">Heir Claims with ZK Proof</span>
            </div>
            {step === 3 && (
              <div className="step-content">
                <p>Bob submits his HeirClaimToken — a zero-knowledge proof verifies his right to claim:</p>
                <div className="code-block">
                  <div><span className="code-key">transition</span> claim(token: HeirClaimToken, p0..p3)</div>
                  <div style={{paddingLeft:'1rem'}}>→ ZK proof: Bob is heir <span className="code-val">WITHOUT revealing identity</span></div>
                  <div style={{paddingLeft:'1rem'}}>→ Returns: InheritancePayload (encrypted)</div>
                  <div style={{paddingLeft:'1rem'}}>→ Vault <span className="code-val">deactivated</span> (one-time claim)</div>
                </div>
                <button className="btn btn-gold" onClick={nextStep} disabled={simulating}>
                  {simulating ? 'Generating ZK Proof...' : 'Execute claim →'}
                </button>
              </div>
            )}
          </div>

          {/* Step 5: Done */}
          <div className={`demo-step ${step >= 4 ? 'active' : ''}`}>
            <div className="step-header">
              <span className="step-num" style={{background:'var(--gold)'}}>★</span>
              <span className="step-title">Inheritance Received</span>
            </div>
            {step === 4 && (
              <div className="step-content">
                <div className="success-box">
                  <h4>Inheritance Claimed Successfully</h4>
                  <p>Bob received the InheritancePayload record (private, only he can decrypt).</p>
                </div>
                <div className="code-block" style={{marginTop:'0.75rem'}}>
                  <div style={{color:'var(--gold)'}}>record InheritancePayload {'{'}</div>
                  <div style={{paddingLeft:'1rem'}}><span className="code-key">owner:</span> aleo1bob...rf2</div>
                  <div style={{paddingLeft:'1rem'}}><span className="code-key">vault_id:</span> 1field</div>
                  <div style={{paddingLeft:'1rem'}}><span className="code-key">payload_0:</span> 6930495...field</div>
                  <div style={{paddingLeft:'1rem'}}><span className="code-key">payload_1-3:</span> 0field</div>
                  <div style={{color:'var(--gold)'}}>{'}'}</div>
                </div>

                <div className="privacy-summary">
                  <h4>Privacy Guarantees</h4>
                  <table className="privacy-table">
                    <thead><tr><th></th><th>Ethereum</th><th>Aleo (LastVault)</th></tr></thead>
                    <tbody>
                      <tr><td>Heir identity</td><td className="comp-bad">Public on-chain</td><td className="comp-good">ZK-private ✓</td></tr>
                      <tr><td>Claim TX</td><td className="comp-bad">Reveals address</td><td className="comp-good">Zero-knowledge ✓</td></tr>
                      <tr><td>Replay protection</td><td className="comp-bad">Manual code</td><td className="comp-good">Record model ✓</td></tr>
                      <tr><td>Payload privacy</td><td className="comp-bad">Manual ECIES</td><td className="comp-good">Native encryption ✓</td></tr>
                    </tbody>
                  </table>
                </div>

                <button className="btn btn-ghost" onClick={() => setStep(0)} style={{marginTop:'1rem'}}>
                  Restart Walkthrough
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
