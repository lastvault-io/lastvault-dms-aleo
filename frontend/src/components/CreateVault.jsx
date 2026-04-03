import { useState, useRef, useEffect } from 'react';
import { EXPLORER_URL } from '../config.js';

export default function CreateVault({ address, onExecute, onDecryptRecords, onNavigate }) {
  const [vaultId, setVaultId] = useState('2');
  const [heir, setHeir] = useState('aleo1kjguhtwv7t6ljhmlyfeld6g0lp6a23w3tnuewc46kjnu8uez5qpsetrrf2');
  const [timeout, setTimeout] = useState('100');
  const [payload, setPayload] = useState('my-secret-master-key');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [txId, setTxId] = useState(null);
  const [progress, setProgress] = useState([]);
  const [done, setDone] = useState(false);
  const logEndRef = useRef(null);

  // Auto-scroll: scroll to bottom element
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress]);

  function addLog(msg) {
    setProgress(prev => [...prev, { msg: String(msg || ''), time: new Date().toLocaleTimeString() }]);
  }

  function encodePayload(text) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const chunks = [0n, 0n, 0n, 0n];
    for (let i = 0; i < Math.min(bytes.length, 124); i++) {
      const chunkIdx = Math.floor(i / 31);
      const bytePos = i % 31;
      chunks[chunkIdx] += BigInt(bytes[i]) << BigInt(bytePos * 8);
    }
    return chunks.map(c => c.toString() + 'field');
  }

  async function handleCreate() {
    if (!heir.trim() || !vaultId.trim() || !timeout.trim()) {
      setStatus({ type: 'error', msg: 'All fields are required.' });
      return;
    }

    setLoading(true);
    setTxId(null);
    setProgress([]);
    setDone(false);

    addLog('Encoding payload into field chunks...');

    try {
      const [p0, p1, p2, p3] = encodePayload(payload);
      const inputs = [vaultId + 'field', heir.trim(), timeout + 'u32', p0, p1, p2, p3];

      addLog('Sending to Aleo SDK worker...');
      addLog('Spawning threads for ZK proof generation...');
      setStatus({ type: 'info', msg: 'Generating ZK proof... This takes 1-3 minutes.' });

      const progressSteps = [
        { delay: 5000, msg: 'Loading program & synthesizing keys...' },
        { delay: 15000, msg: 'Creating authorization & parsing inputs...' },
        { delay: 30000, msg: 'Executing program (ZK circuit evaluation)...' },
        { delay: 60000, msg: 'Proving execution (heavy computation)...' },
        { delay: 120000, msg: 'Preparing inclusion proofs...' },
        { delay: 150000, msg: 'Calculating fee & proving fee execution...' },
      ];

      const timers = progressSteps.map(s =>
        window.setTimeout(() => addLog(s.msg), s.delay)
      );

      const result = await onExecute('create_vault', inputs);

      timers.forEach(t => clearTimeout(t));
      const txIdStr = typeof result === 'string' ? result : JSON.stringify(result);
      addLog('Transaction submitted: ' + txIdStr);
      setTxId(txIdStr);

      // Decrypt and save records from TX output (poll until confirmed)
      addLog('Waiting for TX confirmation on testnet...');
      const pollDelays = [5000, 10000, 15000, 20000, 30000];
      let recordsSaved = false;
      for (const delay of pollDelays) {
        await new Promise(r => window.setTimeout(r, delay));
        try {
          addLog(`Checking TX status (${delay / 1000}s)...`);
          const records = await onDecryptRecords(txIdStr);
          if (records && records.length > 0) {
            addLog(`Decrypted ${records.length} record(s). Saving for ping/claim.`);
            if (records[0]) sessionStorage.setItem(`lastvault_dms_ownerkey_${vaultId}`, records[0]);
            if (records[1]) sessionStorage.setItem(`lastvault_dms_heirtoken_${vaultId}`, records[1]);
            recordsSaved = true;
            break;
          }
        } catch (e) {
          addLog(`Not confirmed yet... retrying.`);
        }
      }
      if (!recordsSaved) {
        addLog('Records not yet available. They will sync when TX is fully confirmed.');
      }

      addLog('Transaction created successfully!');
      setStatus({ type: 'success', msg: `Vault #${vaultId} created! Go to "My Vault" tab to monitor it.` });
      setDone(true);
    } catch (e) {
      addLog('Error: ' + (e.message || String(e)));
      setStatus({ type: 'error', msg: e.message || 'Transaction failed.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Create Vault</h3>
        <span className="badge badge-gold">Owner</span>
      </div>
      <p className="text-muted">Create an inheritance vault. Heir can claim after timeout expires.</p>

      {!loading && !done && (
        <>
          <div className="form-group">
            <label>Vault ID</label>
            <input className="input" type="number" min="1" value={vaultId} onChange={e => setVaultId(e.target.value)} />
            <span className="hint">Unique identifier (vault #1 already exists on testnet)</span>
          </div>

          <div className="form-group">
            <label>Heir Address</label>
            <input className="input" value={heir} onChange={e => setHeir(e.target.value)} placeholder="aleo1..." />
            <span className="hint">
              Pre-filled with a demo heir for testing. You can enter any Aleo address.
              <br/><span style={{color:'var(--gold)'}}>Important:</span> Owner ≠ Heir (ZK privacy). To claim, the heir must connect with their own private key.
            </span>
          </div>

          <div className="form-group">
            <label>Timeout (blocks)</label>
            <input className="input" type="number" min="10" value={timeout} onChange={e => setTimeout(e.target.value)} />
            <span className="hint">~15 sec/block. 100 blocks ≈ 25 min.</span>
          </div>

          <div className="form-group">
            <label>Payload (secret for heir)</label>
            <textarea className="input textarea" value={payload} onChange={e => setPayload(e.target.value)} rows={2} />
            <span className="hint">Encoded into 4 field chunks on-chain (max ~124 bytes)</span>
          </div>
        </>
      )}

      {status && <div className={`alert alert-${status.type}`}>{status.msg}</div>}

      {progress.length > 0 && (
        <div className="progress-monitor">
          <span className="label-sm">ZK Proof Generation Monitor</span>
          <div className="progress-log">
            {progress.map((p, i) => (
              <div key={i} className="progress-entry">
                <span className="progress-time">{p.time || ''}</span>
                <span className={`progress-msg ${(p.msg || '').startsWith('Transaction created') ? 'success' : (p.msg || '').startsWith('Error') ? 'error' : ''}`}>
                  {p.msg || ''}
                </span>
              </div>
            ))}
            {loading && (
              <div className="progress-entry">
                <span className="progress-spinner"></span>
                <span className="progress-msg">Working...</span>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {txId && (
        <div className="result-box">
          <span className="label-sm">Transaction ID</span>
          <code className="tx-id">{txId}</code>
          <a href={`${EXPLORER_URL}/transaction/${txId}`} target="_blank" rel="noopener" className="explorer-link" style={{marginTop:'0.5rem', display:'block'}}>View on Explorer →</a>
        </div>
      )}

      {!done ? (
        <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
          {loading ? 'Generating ZK Proof...' : 'Create Vault'}
        </button>
      ) : (
        <div style={{display:'flex', gap:'0.75rem', marginTop:'0.5rem', flexWrap:'wrap'}}>
          <span className="badge badge-green" style={{padding:'0.5rem 1rem', fontSize:'0.9rem'}}>✓ Vault #{vaultId} Created</span>
          <button className="btn btn-primary" onClick={() => onNavigate('dashboard', vaultId)}>
            Go to My Vault →
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setDone(false); setTxId(null); setProgress([]); setStatus(null); setVaultId(String(Number(vaultId) + 1)); }}>
            Create Another
          </button>
        </div>
      )}
    </div>
  );
}
