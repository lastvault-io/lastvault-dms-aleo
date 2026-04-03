# LastVault DMS — Dead-Man's Switch for Digital Inheritance on Aleo

> Aleo x AKINDO Private By Design Buildathon | Category: Private Identity & Credentials

**LastVault DMS** is the first trustless digital inheritance protocol on Aleo. Using a Dead-Man's Switch, vault owners periodically ping a smart contract to prove liveness. If they stop, a designated heir can claim encrypted vault access through a zero-knowledge proof — without revealing their identity on-chain.

## Live Demo

| | |
|---|---|
| **Web App** | [lastvault.io/dms](https://lastvault.io/dms/) |
| **Demo Video** | [YouTube — Full On-Chain Demo](https://www.youtube.com/watch?v=bYOsDSk8eLo) |
| **Program** | [`lastvault_dms.aleo`](https://testnet.explorer.provable.com/program/lastvault_dms.aleo) |

### Verified On-Chain Transactions (Full Demo)

| Step | Transaction |
|------|------------|
| **Create Vault** | [`at1skhcnz...cuzzrs`](https://testnet.explorer.provable.com/transaction/at1skhcnz8ketqegkwh036ukwz23apjxs2guq66ulm8zkk3mwk8vcxqcuzzrs) |
| **Fund Heir** | [`at1fgw0hh...nfhs0`](https://testnet.explorer.provable.com/transaction/at1fgw0hhwpjqy3ujyx3w7zz5p76440hnex05g6dphhf3dv4r6jeqzqynfhs0) |
| **Heir Claim** | [`at1t4h48c...qd0lj`](https://testnet.explorer.provable.com/transaction/at1t4h48cgwwa0k9qmdcrn04vdyhxgw4kyvp0eqe2es4yvmm2mkkqrqtqd0lj) |
| **Deploy** | [`at1v3fhe2...us9sn`](https://testnet.explorer.provable.com/transaction/at1v3fhe2nwpvjftg775fj4dulutr2s24xjyv4al9vjnh846hutus9snnsqww) |

## How It Works

```
Owner                          Aleo Blockchain                         Heir
  │                                  │                                   │
  ├── create_vault() ───────────────►│  Stores encrypted payload         │
  │   (heir, timeout, payload)       │  Issues VaultOwnerKey (private)   │
  │                                  │  Issues HeirClaimToken (private) ─┤
  │                                  │                                   │
  ├── ping() ───────────────────────►│  Resets DMS timer                 │
  │   (every N blocks)               │  Re-issues VaultOwnerKey          │
  │                                  │                                   │
  │   ❌ Owner stops pinging         │                                   │
  │                                  │                                   │
  │                                  │  ⏰ Timeout expires               │
  │                                  │                                   │
  │                                  │◄────────────── claim() ───────────┤
  │                                  │  Verifies timeout via ZK proof    │
  │                                  │  Returns InheritancePayload ──────┤
  │                                  │  (private record, only heir sees) │
```

## Web Frontend

The frontend runs entirely in the browser — ZK proofs are generated client-side via WASM. No backend required.

**One-Click Full Demo:** Creates a vault, waits for timeout, funds the heir, and executes the claim — all with real transactions on Aleo testnet.

### Run Locally

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### Features

- One-click automated full inheritance flow (create → timeout → fund → claim)
- Real ZK proof generation in browser (@provablehq/sdk WASM)
- Live on-chain vault monitoring with auto-refresh DMS timer
- Vault explorer for querying any vault's public state
- Leo Wallet integration + private key fallback

## Why Aleo?

| Feature | Ethereum | Aleo (LastVault) |
|---------|----------|------|
| Heir identity | Public on-chain | **Private** — ZK-proof claim |
| Claim transaction | Reveals heir address | **Zero identity leak** |
| Payload encryption | Manual ECIES | **Native record privacy** |
| Replay protection | Requires extra code | **Built-in** — record consume model |

## Smart Contract

### Transitions

| Function | Access | Description |
|----------|--------|-------------|
| `create_vault` | Anyone | Create DMS vault with heir, timeout, encrypted payload |
| `ping` | Owner | Reset liveness timer (VaultOwnerKey consumed & re-issued) |
| `set_heir` | Owner | Change designated heir |
| `update_payload` | Owner | Rotate encrypted payload |
| `claim` | Heir | Claim inheritance after timeout (returns private record) |

### Records (Private State)

| Record | Purpose |
|--------|---------|
| `VaultOwnerKey` | Ownership proof — consumed on each ping (replay protection) |
| `HeirClaimToken` | Claim authorization — issued to heir at vault creation |
| `InheritancePayload` | Encrypted data — returned to heir on successful claim |

### Mappings (Public On-Chain)

```
vault_owner      │ vault_heir       │ last_ping
timeout_period   │ vault_active     │ payload_chunk_0-3
```

### Program Stats

- **Leo version:** 3.5.0
- **Program size:** 5.21 KB / 97.66 KB (5.3%)
- **Constraints:** 305,095 / 2,097,152
- **Deploy fee:** ~7.79 credits

## Quick Start (CLI)

```bash
# Install Leo
cargo install leo-lang

# Build
leo build

# Create a vault
leo run create_vault 1field aleo1<HEIR_ADDRESS> 1000u32 42field 43field 44field 45field

# Ping (pass VaultOwnerKey record from create_vault output)
leo run ping '<VAULT_OWNER_KEY_RECORD>'

# Claim as heir
PRIVATE_KEY=APrivateKey1... leo run claim '<HEIR_CLAIM_TOKEN_RECORD>' 42field 43field 44field 45field
```

## About LastVault

[LastVault](https://lastvault.io) is a complete digital inheritance platform by **Divara Technology Inc.** — not just a smart contract.

| Platform | Status |
|----------|--------|
| Desktop App (Windows/macOS) | ✅ Complete |
| Mobile App (iOS/Android) | ✅ Complete |
| Browser Extension (Chrome/Firefox) | ✅ Complete |
| Hardware Security Key (ESP32-S3) | ✅ 5 PCB prototypes |
| Smart Contracts (Solidity — Base L2) | ✅ Production |
| Smart Contracts (Leo — Aleo) | ✅ Testnet |
| Heir Portal (heir.lastvault.io) | ✅ Complete |
| Patent | ✅ 4 claims filed (WIPO/PCT ready) |

## License

MIT
