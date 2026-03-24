# LastVault DMS — Dead-Man's Switch for Digital Inheritance on Aleo

> Aleo x AKINDO WaveHack Buildathon — Wave 5 | Category: Private Identity & Credentials

**LastVault DMS** is the first trustless digital inheritance protocol on Aleo. Using a Dead-Man's Switch, vault owners periodically ping a smart contract to prove liveness. If they stop, a designated heir can claim encrypted vault access through a zero-knowledge proof — without revealing their identity on-chain.

## Deployed on Aleo Testnet

| | |
|---|---|
| **Program** | [`lastvault_dms.aleo`](https://testnet.explorer.provable.com/program/lastvault_dms.aleo) |
| **Deploy TX** | [`at1v3fhe2nwpvjftg775fj4dulutr2s24xjyv4al9vjnh846hutus9snnsqww`](https://testnet.explorer.provable.com/transaction/at1v3fhe2nwpvjftg775fj4dulutr2s24xjyv4al9vjnh846hutus9snnsqww) |
| **Block** | 15,278,019 |
| **Network** | Aleo Testnet |

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

## Why Aleo?

| Feature | Ethereum | Aleo |
|---------|----------|------|
| Heir identity | Public on-chain | **Private** — ZK-proof claim |
| Claim transaction | Reveals heir address | **Zero identity leak** |
| Payload encryption | Manual ECIES | **Native record privacy** |
| Replay protection | Requires extra code | **Built-in** — record consume model |

## Transitions

| Function | Access | Description |
|----------|--------|-------------|
| `create_vault` | Anyone | Create DMS vault with heir, timeout, encrypted payload |
| `ping` | Owner | Reset liveness timer (VaultOwnerKey consumed & re-issued) |
| `set_heir` | Owner | Change designated heir |
| `update_payload` | Owner | Rotate encrypted payload |
| `claim` | Heir | Claim inheritance after timeout (returns private record) |

## Quick Start

```bash
# Install Leo
cargo install leo-lang

# Build
leo build

# Create a vault
leo run create_vault \
  1field \
  aleo1<HEIR_ADDRESS> \
  1000u32 \
  42field 43field 44field 45field

# Ping (pass VaultOwnerKey record from create_vault output)
leo run ping '<VAULT_OWNER_KEY_RECORD>'

# Claim as heir (set heir's private key)
PRIVATE_KEY=APrivateKey1... leo run claim \
  '<HEIR_CLAIM_TOKEN_RECORD>' \
  42field 43field 44field 45field
```

## Program Stats

- **Leo version:** 3.5.0
- **Program size:** 5.21 KB / 97.66 KB (5.3%)
- **Constraints:** 305,095 / 2,097,152
- **Deploy fee:** ~7.79 credits

## Architecture

```
Records (Private)                 Mappings (Public On-Chain)
┌─────────────────┐              ┌──────────────────┐
│ VaultOwnerKey    │              │ vault_owner       │
│ HeirClaimToken   │              │ vault_heir        │
│ InheritancePayload│             │ last_ping         │
└─────────────────┘              │ timeout_period    │
                                  │ vault_active      │
                                  │ payload_chunk_0-3 │
                                  └──────────────────┘
```

## Roadmap

| Wave | Goal | Status |
|------|------|--------|
| **Wave 5** | DMS contract + Testnet deploy | ✅ Done |
| Wave 6 | Multi-heir + threshold sharing | Planned |
| Wave 7 | Web claim portal (Aleo SDK) | Planned |
| Wave 8 | Desktop app integration | Planned |
| Wave 9-10 | Security audit + docs | Planned |

## About LastVault

[LastVault](https://lastvault.io) is a trustless digital inheritance platform by Divara Technology Inc. Production version runs on Ethereum/Base with a .NET desktop app, mobile companion, and custom ESP32-S3 hardware security key.

## License

MIT
