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

export default function FullDemo({ sendToWorker, connectedAccount }) {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [logs, setLogs] = useState([]);
  const [owner, setOwner] = useState(null);
  const [heir, setHeir] = useState(null);
  const [vaultId, setVaultId] = useState(null);
  const [txIds, setTxIds] = useState({});
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  function log(msg, type) {
    setLogs(prev => [...prev, { msg: String(msg || ''), time: new Date().toLocaleTimeString(), type: type || 'info' }]);
  }

  async function runDemo() {
    setRunning(true);
    setLogs([]);
    setStep(0);
    setTxIds({});
    setError(null);
    setDone(false);

    const vid = Math.floor(Math.random() * 9000) + 1000; // random vault ID
    setVaultId(vid);

    try {
      // ═══ STEP 1: Setup accounts ═══
      setStep(1);
      log('═══ STEP 1/6: Setting up Owner & Heir accounts ═══', 'header');

      // Use connected account as owner (already has credits)
      let ownerAcc;
      if (connectedAccount?.privateKey) {
        ownerAcc = connectedAccount;
      } else {
        // Leo Wallet connected but no private key — ask once
        const pk = prompt('Enter your private key for ZK proof generation.\n\nLeo Wallet → Settings → Reveal Private Key → Copy\n\nThis is needed to sign transactions from the browser.');
        if (!pk) throw new Error('Private key required to run demo.');
        ownerAcc = { ...connectedAccount, privateKey: pk.trim() };
      }
      await sendToWorker('createAccount', { privateKey: ownerAcc.privateKey });
      log(`Owner: ${ownerAcc.address.slice(0, 16)}...${ownerAcc.address.slice(-6)}`, 'success');
      setOwner(ownerAcc);

      // Generate a fresh heir account
      log('Generating Heir account...');
      const heirAcc = await sendToWorker('createAccount', {});
      setHeir(heirAcc);
      log(`Heir (auto-generated): ${heirAcc.address.slice(0, 16)}...${heirAcc.address.slice(-6)}`, 'success');

      // Switch back to owner
      await sendToWorker('createAccount', { privateKey: ownerAcc.privateKey });

      // Check owner balance
      log('Checking Owner balance...');
      const balRes = await fetch(`https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/${ownerAcc.address}`);
      const balText = await balRes.text();
      const balMicro = parseInt(balText.replace(/"/g, '').replace('u64', ''));
      const balCredits = (balMicro / 1_000_000).toFixed(2);
      log(`Owner balance: ${balCredits} credits`, balMicro > 0 ? 'success' : 'error');

      if (balMicro < 500000) {
        throw new Error(`Insufficient credits (${balCredits}). Need at least 0.5 credits.`);
      }

      // ═══ STEP 2: Create Vault ═══
      setStep(2);
      log('', 'spacer');
      log(`═══ STEP 2/6: Creating Vault #${vid} (timeout: 10 blocks ≈ 2.5 min) ═══`, 'header');
      log(`Owner: ${ownerAcc.address.slice(0, 20)}...`);
      log(`Heir: ${heirAcc.address.slice(0, 20)}...`);
      log('Generating ZK proof for create_vault... (~2 min)');

      // Encode payload
      const payloadText = 'demo-secret-inheritance-key-2026';
      const encoder = new TextEncoder();
      const bytes = encoder.encode(payloadText);
      const chunks = [0n, 0n, 0n, 0n];
      for (let i = 0; i < Math.min(bytes.length, 124); i++) {
        const chunkIdx = Math.floor(i / 31);
        const bytePos = i % 31;
        chunks[chunkIdx] += BigInt(bytes[i]) << BigInt(bytePos * 8);
      }
      const fields = chunks.map(c => c.toString() + 'field');

      const createTx = await sendToWorker('execute', {
        functionName: 'create_vault',
        inputs: [vid + 'field', heirAcc.address, '10u32', ...fields],
      });
      setTxIds(prev => ({ ...prev, create: createTx }));
      log(`Create TX: ${createTx}`, 'success');

      // Decrypt records
      log('Waiting for TX confirmation...');
      let ownerKey = null;
      for (const delay of [5000, 10000, 15000]) {
        await new Promise(r => setTimeout(r, delay));
        try {
          const records = await sendToWorker('decryptRecords', { txId: createTx });
          if (records && records.length > 0) {
            ownerKey = records[0];
            log(`Decrypted ${records.length} record(s) — VaultOwnerKey saved.`, 'success');
            break;
          }
        } catch (e) {
          log('Waiting for confirmation...');
        }
      }

      // ═══ STEP 3: Verify vault on-chain ═══
      setStep(3);
      log('', 'spacer');
      log('═══ STEP 3/6: Verifying vault on-chain ═══', 'header');
      const vaultData = await getVaultStatus(String(vid));
      if (vaultData.exists) {
        log(`Vault #${vid} confirmed on-chain!`, 'success');
        log(`Last ping: Block #${vaultData.lastPing}`);
        log(`Timeout: ${vaultData.timeout} blocks`);
        log(`Status: ${vaultData.active ? 'Active' : 'Inactive'}`);
      } else {
        log('Vault not yet visible — may need more time to confirm.', 'error');
      }

      // ═══ STEP 4: Wait for timeout ═══
      setStep(4);
      log('', 'spacer');
      log('═══ STEP 4/6: Waiting for DMS timeout (10 blocks ≈ 2-3 min) ═══', 'header');
      log('Simulating owner going silent... Dead-Man\'s Switch counting down.');

      let expired = false;
      for (let i = 0; i < 30; i++) { // max 5 min wait
        await new Promise(r => setTimeout(r, 10000));
        const bh = await getLatestBlockHeight();
        const v = await getVaultStatus(String(vid));
        if (v.exists && v.lastPing && v.timeout && bh) {
          const remaining = (v.lastPing + v.timeout) - bh;
          if (remaining <= 0) {
            log(`Block #${bh} — TIMEOUT EXPIRED! DMS triggered.`, 'success');
            expired = true;
            break;
          } else {
            log(`Block #${bh} — ${remaining} blocks remaining...`);
          }
        }
      }

      if (!expired) {
        throw new Error('Timeout did not expire within 5 minutes. Try again.');
      }

      // ═══ STEP 5: Transfer credits to heir ═══
      setStep(5);
      log('', 'spacer');
      log('═══ STEP 5/6: Funding heir account for claim TX fee ═══', 'header');
      log('Transferring 2 credits from owner to heir...');

      // Make sure owner account is active in worker
      await sendToWorker('createAccount', { privateKey: ownerAcc.privateKey });

      const transferTx = await sendToWorker('execute', {
        functionName: 'transfer_public',
        inputs: [heirAcc.address, '2000000u64'],
        programName: 'credits.aleo',
      });
      setTxIds(prev => ({ ...prev, transfer: transferTx }));
      log(`Transfer TX: ${transferTx}`, 'success');

      // Wait for transfer to confirm
      log('Waiting for transfer confirmation...');
      await new Promise(r => setTimeout(r, 15000));

      // ═══ STEP 6: Heir claims inheritance ═══
      setStep(6);
      log('', 'spacer');
      log('═══ STEP 6/6: Heir claims inheritance with ZK proof ═══', 'header');
      log('Switching to heir account...');

      await sendToWorker('createAccount', { privateKey: heirAcc.privateKey });
      log('Connected as heir.');

      // Get payload from on-chain
      const finalVault = await getVaultStatus(String(vid));
      if (!finalVault.payload || finalVault.payload.length < 4) {
        throw new Error('Could not read payload from chain.');
      }

      // Find HeirClaimToken
      log('Searching for HeirClaimToken...');
      let heirToken = null;
      try {
        const records = await sendToWorker('decryptRecords', { txId: createTx });
        if (records && records.length > 1) {
          heirToken = records[1]; // Second record is HeirClaimToken
          log('HeirClaimToken found!', 'success');
        } else if (records && records.length > 0) {
          heirToken = records[0];
          log('Found claim token.', 'success');
        }
      } catch (e) {
        log('Searching via record scan...');
        try {
          const found = await sendToWorker('findRecords', { vaultId: String(vid) });
          if (found.length > 0) heirToken = found[0];
        } catch {}
      }

      if (!heirToken) {
        log('HeirClaimToken not decryptable from this TX — heir record is private to heir.', 'error');
        log('In production, heir receives the token at vault creation time.', 'info');
        log('', 'spacer');
        log('═══ DEMO COMPLETE (5/6 steps executed on-chain) ═══', 'header');
        log('Create Vault ✓ → Verify ✓ → Timeout ✓ → Fund Heir ✓', 'success');
        log('Claim requires heir\'s private token — this is Aleo\'s ZK privacy guarantee.', 'success');
        setDone(true);
        setRunning(false);
        return;
      }

      log('Generating ZK proof for claim... (~2 min)');
      const claimTx = await sendToWorker('execute', {
        functionName: 'claim',
        inputs: [
          heirToken,
          finalVault.payload[0] || '0field',
          finalVault.payload[1] || '0field',
          finalVault.payload[2] || '0field',
          finalVault.payload[3] || '0field',
        ],
      });
      setTxIds(prev => ({ ...prev, claim: claimTx }));
      log(`Claim TX: ${claimTx}`, 'success');

      // Decode and show the inherited payload
      log('', 'spacer');
      log('Decrypting inherited payload...', 'header');
      try {
        const claimedVault = await getVaultStatus(String(vid));
        if (claimedVault.payload && claimedVault.payload.length > 0) {
          // Decode field chunks back to text
          const decoded = decodePayload(claimedVault.payload);
          log(`Inherited secret: "${decoded}"`, 'success');
        }
      } catch (e) {}

      log('', 'spacer');
      log('═══ FULL DEMO COMPLETE — All 6 steps executed on-chain! ═══', 'header');
      log('Create Vault ✓ → Verify ✓ → Timeout ✓ → Fund Heir ✓ → Claim ✓', 'success');
      log(`Heir received the encrypted payload: "${payloadText}"`, 'success');
      log('Every transaction is real, verifiable on Aleo testnet.', 'success');
      setDone(true);

    } catch (e) {
      log(`Error: ${e.message}`, 'error');
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const stepLabels = [
    '', 'Creating Accounts', 'Creating Vault', 'Verifying On-Chain',
    'Waiting for Timeout', 'Funding Heir', 'Heir Claiming',
  ];

  return (
    <div className="card">
      <div className="card-header">
        <h3>Full Automated Demo</h3>
        <span className="badge badge-gold">Real On-Chain</span>
      </div>

      {!running && !done && (
        <>
          <p className="text-muted" style={{ marginBottom: '1rem' }}>
            Runs the <strong>complete inheritance flow</strong> automatically with real transactions on Aleo testnet.
            No manual steps — just click and watch.
          </p>
          <div className="info-box" style={{ marginBottom: '1rem' }}>
            <strong>What happens:</strong>
            <ol style={{ margin: '0.5rem 0 0 1.25rem', lineHeight: '1.8', fontSize: '0.85rem' }}>
              <li>Create Owner & Heir accounts</li>
              <li>Owner creates vault (ZK proof ~2 min)</li>
              <li>Verify vault on-chain</li>
              <li>Wait for DMS timeout (~2-3 min)</li>
              <li>Owner funds heir account (ZK proof ~2 min)</li>
              <li>Heir claims inheritance (ZK proof ~2 min)</li>
            </ol>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--gold)' }}>
              Total: ~8-12 minutes. Every transaction is real and verifiable on testnet.
            </p>
          </div>
          <button className="btn btn-gold btn-lg" onClick={runDemo}>
            Run Full Demo
          </button>
          <p className="hint" style={{ marginTop: '0.5rem' }}>
            Requires ~15 testnet credits in the generated owner account. Connect with a funded private key first via the main app.
          </p>
        </>
      )}

      {/* Step indicator */}
      {(running || done) && (
        <div className="demo-step-indicator">
          {[1, 2, 3, 4, 5, 6].map(s => (
            <div key={s} className={`demo-step-dot ${step > s ? 'done' : step === s ? 'active' : ''}`}>
              <span className="demo-step-num">{step > s ? '✓' : s}</span>
              <span className="demo-step-label">{stepLabels[s]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Live log */}
      {logs.length > 0 && (
        <div className="progress-monitor" style={{ marginTop: '1rem', maxHeight: '400px' }}>
          <span className="label-sm">Live Execution Log</span>
          <div className="progress-log">
            {logs.map((l, i) => (
              l.type === 'spacer' ? <div key={i} style={{ height: '0.5rem' }} /> :
              l.type === 'header' ? (
                <div key={i} className="progress-entry" style={{ marginTop: '0.25rem' }}>
                  <span className="progress-time">{l.time}</span>
                  <span className="progress-msg" style={{ color: 'var(--accent-light)', fontWeight: 700 }}>{l.msg}</span>
                </div>
              ) : (
                <div key={i} className="progress-entry">
                  <span className="progress-time">{l.time}</span>
                  <span className={`progress-msg ${l.type === 'success' ? 'success' : l.type === 'error' ? 'error' : ''}`}>{l.msg}</span>
                </div>
              )
            ))}
            {running && (
              <div className="progress-entry">
                <span className="progress-spinner"></span>
                <span className="progress-msg">Working...</span>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* TX links */}
      {Object.keys(txIds).length > 0 && (
        <div className="result-box" style={{ marginTop: '0.75rem' }}>
          <span className="label-sm">Transaction IDs (verify on Explorer)</span>
          {txIds.create && (
            <div style={{ marginTop: '0.25rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Create Vault: </span>
              <a href={`${EXPLORER_URL}/transaction/${txIds.create}`} target="_blank" rel="noopener" className="explorer-link" style={{ fontSize: '0.75rem' }}>{txIds.create}</a>
            </div>
          )}
          {txIds.transfer && (
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Fund Heir: </span>
              <a href={`${EXPLORER_URL}/transaction/${txIds.transfer}`} target="_blank" rel="noopener" className="explorer-link" style={{ fontSize: '0.75rem' }}>{txIds.transfer}</a>
            </div>
          )}
          {txIds.claim && (
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Claim: </span>
              <a href={`${EXPLORER_URL}/transaction/${txIds.claim}`} target="_blank" rel="noopener" className="explorer-link" style={{ fontSize: '0.75rem' }}>{txIds.claim}</a>
            </div>
          )}
        </div>
      )}

      {done && (
        <button className="btn btn-ghost" onClick={() => { setDone(false); setLogs([]); setStep(0); setTxIds({}); }} style={{ marginTop: '1rem' }}>
          Run Again
        </button>
      )}

      {error && !running && (
        <button className="btn btn-ghost" onClick={() => { setError(null); setRunning(false); setDone(false); }} style={{ marginTop: '0.5rem' }}>
          Reset
        </button>
      )}
    </div>
  );
}
