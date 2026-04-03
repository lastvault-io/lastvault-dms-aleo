# LastVault DMS — Dead-Man's Switch for Digital Inheritance on Aleo

## Project Overview

**LastVault** is a trustless digital inheritance platform that uses a Dead-Man's Switch (DMS) mechanism to securely transfer encrypted vault access to a designated heir. The owner periodically "pings" the smart contract to prove liveness. If the owner stops pinging (due to death, incapacitation, or disappearance), the heir can claim the encrypted inheritance payload after a configurable timeout period.

**This Wave 5 submission** ports the core DMS smart contract from Ethereum/Solidity to Aleo/Leo, leveraging Aleo's native zero-knowledge privacy to protect heir identity and encrypted payload data.

### Why Aleo?

| Feature | Ethereum (current) | Aleo (this submission) |
|---------|-------------------|----------------------|
| Heir identity | Public on-chain | **Private** — ZK-proof based claim |
| Encrypted payload | ECIES (manual encryption) | **Native record encryption** |
| Claim transaction | Reveals heir's address | **Zero-knowledge proof** — no identity leak |
| State privacy | All state public | **Private records** + public mappings |

LastVault is the **first digital inheritance solution on Aleo**, bringing real-world utility to Aleo's privacy-first architecture.

---

## Category

**Private Identity & Credentials**

The heir's identity is a credential that must remain private until inheritance is triggered. Aleo's ZK-proof system ensures the heir can prove their right to claim without revealing who they are on-chain.

---

## Working Demonstration

### Deployed Program

- **Program ID:** `lastvault_dms.aleo`
- **Network:** Aleo Testnet
- **Explorer:** https://testnet.explorer.provable.com/program/lastvault_dms.aleo

### Deployment Transaction

- **TX ID:** `at1v3fhe2nwpvjftg775fj4dulutr2s24xjyv4al9vjnh846hutus9snnsqww`
- **Block:** 15,278,019
- **Explorer:** https://testnet.explorer.provable.com/transaction/at1v3fhe2nwpvjftg775fj4dulutr2s24xjyv4al9vjnh846hutus9snnsqww

### Live Execution (create_vault)

- **TX ID:** `at1quccv4xm6ffze50038l9a9n7en4udgfufevlt0lxts8a7w353qyqfdwun7`
- **Explorer:** https://testnet.explorer.provable.com/transaction/at1quccv4xm6ffze50038l9a9n7en4udgfufevlt0lxts8a7w353qyqfdwun7
- **Parameters:** vault_id=1, timeout=1000 blocks, 4-chunk encrypted payload

### Full End-to-End Demo (Create → Timeout → Fund → Claim)

All transactions executed from the web frontend with real ZK proofs generated in-browser:

| Step | Transaction | Explorer |
|------|------------|----------|
| **Create Vault** | `at1skhcnz...cuzzrs` | [View TX](https://testnet.explorer.provable.com/transaction/at1skhcnz8ketqegkwh036ukwz23apjxs2guq66ulm8zkk3mwk8vcxqcuzzrs) |
| **Fund Heir** | `at1fgw0hh...nfhs0` | [View TX](https://testnet.explorer.provable.com/transaction/at1fgw0hhwpjqy3ujyx3w7zz5p76440hnex05g6dphhf3dv4r6jeqzqynfhs0) |
| **Heir Claim** | `at1t4h48c...qd0lj` | [View TX](https://testnet.explorer.provable.com/transaction/at1t4h48cgwwa0k9qmdcrn04vdyhxgw4kyvp0eqe2es4yvmm2mkkqrqtqd0lj) |

### Web Frontend (Live)

- **URL:** [DEPLOY URL — update after Netlify/Vercel deploy]
- **Features:**
  - One-click "Full Demo" — runs entire inheritance flow automatically
  - Real ZK proof generation in browser (WASM)
  - Live on-chain vault monitoring with auto-refresh
  - DMS timer with animated progress bar
  - Payload encoding/decoding
  - No backend required — pure client-side + Aleo testnet

### Demo Video

- **YouTube:** [Full On-Chain Demo](https://www.youtube.com/watch?v=bYOsDSk8eLo)

### How to Test Locally

```bash
# Install Leo
cargo install leo-lang

# Clone and build
cd Aleo/lastvault_dms
leo build

# Create a vault (as owner)
leo run create_vault 1field <HEIR_ADDRESS> 100u32 42field 43field 44field 45field

# Ping to reset timer (as owner, using VaultOwnerKey record from create_vault output)
leo run ping '<VAULT_OWNER_KEY_RECORD>'

# Claim after timeout (as heir, using HeirClaimToken record)
PRIVATE_KEY=<HEIR_PRIVATE_KEY> leo run claim '<HEIR_CLAIM_TOKEN_RECORD>' 42field 43field 44field 45field
```

---

## Technical Documentation

### Architecture

```
LastVault Ecosystem
├── Desktop App (.NET MAUI)        — Vault management, auto-ping scheduler
├── Mobile App (.NET MAUI)         — Companion app, biometric auth
├── Server (ASP.NET Core)          — API, notifications, heir triggers
├── Hardware Security Key (ESP32)  — FIDO2 USB+NFC authentication
├── Smart Contract (Ethereum/Base) — Production DMS (Solidity)
│
└── 🆕 Aleo Privacy Module (NEW)
    └── lastvault_dms.aleo         — Privacy-first DMS (Leo)
```

### Smart Contract Design

#### Records (Private State)

| Record | Purpose | Privacy |
|--------|---------|---------|
| `VaultOwnerKey` | Ownership proof, consumed on each ping (replay protection) | Owner only |
| `HeirClaimToken` | Claim authorization, issued on vault creation | Heir only |
| `InheritancePayload` | Encrypted master key, issued on successful claim | Heir only |

#### Mappings (Public On-Chain State)

| Mapping | Type | Purpose |
|---------|------|---------|
| `vault_owner` | field → address | Vault owner address |
| `vault_heir` | field → address | Designated heir address |
| `last_ping` | field → u32 | Last ping block height |
| `timeout_period` | field → u32 | Timeout in blocks |
| `vault_active` | field → bool | Active/claimed status |
| `payload_chunk_0..3` | field → field | Encrypted payload (4 × 31 bytes) |

#### Transitions (Functions)

| Transition | Access | Description |
|-----------|--------|-------------|
| `create_vault` | Anyone | Create DMS vault with heir, timeout, encrypted payload |
| `ping` | Owner (VaultOwnerKey) | Reset DMS timer, re-issue ownership record |
| `set_heir` | Owner (VaultOwnerKey) | Change designated heir |
| `update_payload` | Owner (VaultOwnerKey) | Update encrypted payload (key rotation) |
| `claim` | Heir (HeirClaimToken) | Claim inheritance after timeout expires |

### Privacy Model

1. **Heir Identity Protection:** The heir receives a private `HeirClaimToken` record at vault creation. When claiming, the heir submits this record — the ZK proof verifies authorization without revealing the heir's identity in the transaction.

2. **Payload Encryption:** The encrypted payload (ECIES bundle) is stored in public mappings but is encrypted off-chain before submission. Only the heir's private key can decrypt it — same security as the Ethereum version, but with Aleo's native ZK verification.

3. **Replay Protection:** The `VaultOwnerKey` record is consumed and re-issued on every ping/update operation, preventing replay attacks.

### Security Considerations

- Owner and heir addresses are validated (owner ≠ heir)
- Vault ID uniqueness enforced (cannot overwrite existing vault)
- Timeout must be > 0 blocks
- Claim only succeeds after `block.height > last_ping + timeout_period`
- Vault deactivated after claim (one-time inheritance)
- Constructor uses `@noupgrade` — immutable after deployment

### Program Stats

- **Size:** 5.21 KB / 97.66 KB limit (5.3% usage)
- **Variables:** 382,608 / 2,097,152 max
- **Constraints:** 305,095 / 2,097,152 max

---

## Team Information

### Divara Technology Inc.

- **Product:** LastVault (lastvault.io) — Digital inheritance platform
- **Founded:** 2025
- **Stage:** Pre-seed, building MVP
- **Patent:** Turkish Patent Office — 4 independent claims (WIPO/PCT ready)

**Tech Stack:**
- Desktop: .NET MAUI Blazor (Windows/macOS)
- Mobile: .NET MAUI (iOS/Android)
- Server: ASP.NET Core + PostgreSQL
- Hardware: ESP32-S3 custom security key (USB HID + NFC)
- Smart Contracts: Solidity (Ethereum/Base) + Leo (Aleo)

---

## Links

- **Web Frontend:** https://lastvault.io/dms/
- **Demo Video:** https://www.youtube.com/watch?v=bYOsDSk8eLo
- **Program on Aleo Testnet:** https://testnet.explorer.provable.com/program/lastvault_dms.aleo
- **Source Code:** https://github.com/lastvault-io/lastvault-dms-aleo
- **Product Website:** https://lastvault.io
