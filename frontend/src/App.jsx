import { useState, useEffect, useRef, useCallback } from 'react';
import CreateVault from './components/CreateVault.jsx';
import VaultDashboard from './components/VaultDashboard.jsx';
import ClaimVault from './components/ClaimVault.jsx';
import VaultStatus from './components/VaultStatus.jsx';
import FullDemo from './components/FullDemo.jsx';
import { PROGRAM_ID, EXPLORER_URL } from './config.js';

const TABS = [
  { id: 'fulldemo', label: 'Full Demo', icon: '🚀' },
  { id: 'create', label: 'Create Vault', icon: '🏗️' },
  { id: 'dashboard', label: 'My Vault', icon: '📊' },
  { id: 'claim', label: 'Claim', icon: '🎯' },
  { id: 'explorer', label: 'Explorer', icon: '🔍' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState(null);
  const [account, setAccount] = useState(null); // { privateKey, address }
  const [navVaultId, setNavVaultId] = useState(null);
  const [balance, setBalance] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [hasLeoWallet, setHasLeoWallet] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
  const [error, setError] = useState(null);
  const [pkInput, setPkInput] = useState('');
  const workerRef = useRef(null);
  const msgIdRef = useRef(0);

  // Detect Leo Wallet
  useEffect(() => {
    const check = () => {
      if (window.leoWallet || window.leo) setHasLeoWallet(true);
    };
    check();
    const t = setTimeout(check, 1000);
    return () => clearTimeout(t);
  }, []);

  // Connect via Leo Wallet extension
  async function connectLeoWallet() {
    setConnecting(true);
    setError(null);
    try {
      const wallet = window.leoWallet || window.leo;
      await wallet.connect('DECRYPT_UPON_REQUEST', 'testnetbeta');
      const address = wallet.publicKey;
      if (!address) throw new Error('No address returned');
      setAccount({ address, privateKey: null, leoWallet: true });
      setActiveTab('fulldemo');
    } catch (e) {
      setError(e.message || 'Failed to connect Leo Wallet');
    } finally {
      setConnecting(false);
    }
  }

  // Init worker on mount
  useEffect(() => {
    const w = new Worker(new URL('./workers/worker.js', import.meta.url), { type: 'module' });
    workerRef.current = w;

    // Wait for worker to be ready (initThreadPool completes)
    const readyTimeout = setTimeout(() => setWorkerReady(true), 3000);

    w.onerror = (e) => {
      console.error('Worker error:', e);
      setError('Failed to initialize Aleo SDK. Try refreshing.');
    };

    setWorkerReady(true);

    return () => {
      clearTimeout(readyTimeout);
      w.terminate();
    };
  }, []);

  function sendToWorker(type, payload) {
    return new Promise((resolve, reject) => {
      const id = ++msgIdRef.current;
      const handler = (e) => {
        if (e.data.id === id) {
          workerRef.current.removeEventListener('message', handler);
          if (e.data.success) resolve(e.data.result);
          else reject(new Error(e.data.error));
        }
      };
      workerRef.current.addEventListener('message', handler);
      workerRef.current.postMessage({ id, type, payload });

      // Timeout after 5 min (ZK proof can take long)
      setTimeout(() => {
        workerRef.current.removeEventListener('message', handler);
        reject(new Error('Operation timed out (5 min)'));
      }, 300000);
    });
  }

  async function fetchBalance(address) {
    try {
      const res = await fetch(`https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/${address}`);
      if (!res.ok) { setBalance(0); return; }
      const text = await res.text();
      const microcredits = parseInt(text.replace(/"/g, '').replace('u64', ''));
      setBalance(isNaN(microcredits) ? 0 : microcredits);
    } catch { setBalance(0); }
  }

  // Refresh balance every 15s when connected
  useEffect(() => {
    if (!account) return;
    fetchBalance(account.address);
    const interval = setInterval(() => fetchBalance(account.address), 15000);
    return () => clearInterval(interval);
  }, [account]);

  const handleConnect = useCallback(async (privateKey) => {
    setConnecting(true);
    setError(null);
    try {
      const result = await sendToWorker('createAccount', { privateKey: privateKey || undefined });
      setAccount(result);
      setActiveTab('fulldemo');
    } catch (e) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  }, [workerReady]);

  async function ensureWorkerAccount() {
    const pk = account?.privateKey;
    if (pk) {
      await sendToWorker('createAccount', { privateKey: pk });
    }
  }

  const handleFindRecords = useCallback(async (vaultId) => {
    await ensureWorkerAccount();
    return await sendToWorker('findRecords', { vaultId });
  }, [account]);

  const handleDecryptRecords = useCallback(async (txId) => {
    await ensureWorkerAccount();
    return await sendToWorker('decryptRecords', { txId });
  }, [account]);

  const handleExecute = useCallback(async (functionName, inputs) => {
    let pk = account?.privateKey;

    // If no private key (Leo Wallet only), ask for it
    if (!pk) {
      pk = prompt('Enter your Aleo private key to sign this transaction.\n\nLeo Wallet → Settings → Reveal Private Key → Copy');
      if (!pk) throw new Error('Transaction cancelled — private key required for ZK proof generation.');
      pk = pk.trim();
      setAccount(prev => ({ ...prev, privateKey: pk }));
    }

    // Always ensure worker has the account set before executing
    await sendToWorker('createAccount', { privateKey: pk });

    // Check if this is a credits.aleo call (e.g. transfer_public)
    const isCredits = functionName === 'transfer_public' || functionName === 'transfer_private';
    return await sendToWorker('execute', { functionName, inputs, programName: isCredits ? 'credits.aleo' : undefined });
  }, [account]);

  const handleDisconnect = useCallback(() => {
    setAccount(null);
    setActiveTab(null);
  }, []);

  // Not connected — show landing
  if (!account) {
    return (
      <div className="app">
        <Header />
        <div className="hero-section">
          <h2>Trustless Digital Inheritance on Aleo</h2>
          <p className="text-muted" style={{maxWidth:540, margin:'0 auto 1.5rem'}}>
            Dead-Man's Switch powered by zero-knowledge proofs. Owner pings to prove liveness.
            If they stop, the heir claims — <strong>no identity revealed on-chain.</strong>
          </p>

          <div className="flow-section" style={{maxWidth:600, margin:'0 auto 2rem'}}>
            <div className="flow-visual">
              <div className="flow-step"><span className="flow-num">1</span><span className="flow-text"><strong>Create Vault</strong> — set heir + timeout</span></div>
              <div className="flow-arrow">→</div>
              <div className="flow-step"><span className="flow-num">2</span><span className="flow-text"><strong>Ping</strong> — prove liveness</span></div>
              <div className="flow-arrow">→</div>
              <div className="flow-step"><span className="flow-num">3</span><span className="flow-text"><strong>Claim</strong> — ZK proof after timeout</span></div>
            </div>
          </div>

          <div className="connect-section">
            <div className="connect-options">
              {hasLeoWallet && (
                <>
                  <button className="btn btn-primary btn-lg" onClick={connectLeoWallet} disabled={connecting}>
                    {connecting ? 'Connecting...' : '🦁 Connect Leo Wallet'}
                  </button>
                  <span className="text-muted" style={{fontSize:'0.82rem'}}>or connect with private key</span>
                </>
              )}
              {!hasLeoWallet && (
                <p className="text-muted" style={{fontSize:'0.85rem', marginBottom:'0.5rem'}}>
                  <a href="https://leo.app/" target="_blank" rel="noopener" style={{color:'var(--accent-light)'}}>Install Leo Wallet</a> for the best experience, or connect with a private key below.
                </p>
              )}
              <div className="pk-input-row">
                <input
                  type="password"
                  className="input"
                  placeholder="Paste your Aleo private key..."
                  value={pkInput}
                  onChange={e => setPkInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && pkInput.trim() && handleConnect(pkInput.trim())}
                  style={{flex:1}}
                />
                <button className="btn btn-ghost" onClick={() => handleConnect(pkInput.trim())} disabled={connecting || !pkInput.trim()}>
                  Connect
                </button>
              </div>
            </div>
            <p className="text-muted" style={{fontSize:'0.78rem', marginTop:'1rem'}}>
              Need a testnet account? Get credits from <a href="https://faucet.aleo.org/" target="_blank" rel="noopener">faucet.aleo.org</a>
            </p>
          </div>

          {error && <div className="alert alert-error" style={{maxWidth:500, margin:'1rem auto'}}>{error}</div>}
        </div>
        <Footer />
      </div>
    );
  }

  // Connected
  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">LASTVAULT</h1>
          <span className="logo-badge">Aleo Privacy Module</span>
        </div>
        <div className="header-right">
          <div className="connected-badge" title={account.address} onClick={() => navigator.clipboard.writeText(account.address)}>
            <span className="status-dot active"></span>
            <code className="address-short">{account.address.slice(0, 10)}...{account.address.slice(-6)}</code>
          </div>
          <span className="balance-badge" title="Aleo testnet credits">
            {balance === null ? '...' : balance === 0 ? '0' : (balance / 1_000_000).toFixed(2)} credits
          </span>
          <a href={`https://faucet.aleo.org/?address=${account.address}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm" style={{color:'var(--gold)'}}>Get Credits</a>
          <button className="btn btn-ghost btn-sm" onClick={handleDisconnect}>Disconnect</button>
          <a href={`${EXPLORER_URL}/program/${PROGRAM_ID}`} target="_blank" rel="noopener" className="explorer-link">Explorer</a>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(tab => (
          <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === 'fulldemo' && <FullDemo sendToWorker={sendToWorker} connectedAccount={account} />}
        {activeTab === 'create' && <CreateVault address={account.address} onExecute={handleExecute} onDecryptRecords={handleDecryptRecords} onNavigate={(tab, vid) => { setActiveTab(tab); setNavVaultId(vid); }} />}
        {activeTab === 'dashboard' && <VaultDashboard address={account.address} onExecute={handleExecute} onFindRecords={handleFindRecords} onDecryptRecords={handleDecryptRecords} initialVaultId={navVaultId} onNavigate={(tab, vid) => { setActiveTab(tab); setNavVaultId(vid); }} />}
        {activeTab === 'claim' && <ClaimVault address={account.address} onExecute={handleExecute} onFindRecords={handleFindRecords} />}
        {activeTab === 'explorer' && <VaultStatus />}
      </main>

      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="logo">LASTVAULT</h1>
        <span className="logo-badge">Aleo Privacy Module</span>
      </div>
      <div className="header-right">
        <a href={`${EXPLORER_URL}/program/${PROGRAM_ID}`} target="_blank" rel="noopener" className="explorer-link">Testnet Explorer</a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <span>LastVault DMS — First Digital Inheritance on Aleo</span>
      <span className="footer-sep">|</span>
      <a href="https://lastvault.io" target="_blank" rel="noopener">lastvault.io</a>
      <span className="footer-sep">|</span>
      <a href={`${EXPLORER_URL}/program/${PROGRAM_ID}`} target="_blank" rel="noopener">View Contract</a>
    </footer>
  );
}
