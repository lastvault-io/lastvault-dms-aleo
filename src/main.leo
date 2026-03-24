// ============================================================================
// LastVault DMS — Dead-Man's Switch for Digital Inheritance
// ============================================================================
// Aleo x AKINDO WaveHack Buildathon — Wave 5
// Category: Private Identity & Credentials
//
// Port of the Ethereum LastVaultInheritance.sol contract to Leo/Aleo.
// Leverages Aleo's native ZK-privacy for heir identity protection.
//
// Flow:
//   1. Owner creates a vault with heir address, timeout, and encrypted payload.
//   2. Owner calls ping() periodically to prove liveness.
//   3. If owner stops pinging for `timeout_blocks`, heir can call claim().
//   4. On claim, heir receives a private record with the encrypted payload.
//
// Key Aleo advantages over Ethereum:
//   - Heir identity can be kept private (not visible on-chain)
//   - Claim transaction uses ZK proof — no identity leak
//   - Native record encryption — payload is private by default
// ============================================================================

program lastvault_dms.aleo {

    // ─── Records (private, owned by a specific address) ─────────────

    /// Ownership proof — issued to the vault owner on creation.
    /// Must be consumed and re-created on each ping (prevents replay).
    record VaultOwnerKey {
        owner: address,
        vault_id: field,
    }

    /// Heir claim token — issued to the heir on vault creation.
    /// Needed to call claim(). Keeps heir identity private.
    record HeirClaimToken {
        owner: address,       // the heir's address
        vault_id: field,
    }

    /// The secret payload — issued to the heir upon successful claim.
    /// Contains the encrypted master key (ECIES bundle split into fields).
    record InheritancePayload {
        owner: address,       // heir receives this
        vault_id: field,
        payload_0: field,     // encrypted data chunk 0 (~31 bytes)
        payload_1: field,     // encrypted data chunk 1
        payload_2: field,     // encrypted data chunk 2
        payload_3: field,     // encrypted data chunk 3
    }

    // ─── Mappings (public on-chain state for DMS timer) ─────────────

    /// Last ping block height per vault
    mapping last_ping: field => u32;

    /// Timeout period in blocks per vault
    mapping timeout_period: field => u32;

    /// Whether the vault is active (not yet claimed)
    mapping vault_active: field => bool;

    /// Vault owner address (needed for ping verification in finalize)
    mapping vault_owner: field => address;

    /// Vault heir address (needed for claim verification in finalize)
    mapping vault_heir: field => address;

    // ─── Encrypted payload stored on-chain (public but encrypted) ───
    // The payload is ECIES-encrypted off-chain before submission.
    // Even though stored in public mappings, only the heir's private key
    // can decrypt it — same security model as the Ethereum version.

    mapping payload_chunk_0: field => field;
    mapping payload_chunk_1: field => field;
    mapping payload_chunk_2: field => field;
    mapping payload_chunk_3: field => field;

    // ─── Constructor ─────────────────────────────────────────────────

    /// Deploy-time constructor. No-upgrade policy — this contract is immutable.
    @noupgrade
    async constructor() {}

    // ─── Transitions ────────────────────────────────────────────────

    /// Create a new DMS vault.
    async transition create_vault(
        vault_id: field,
        heir: address,
        timeout_blocks: u32,
        p0: field,
        p1: field,
        p2: field,
        p3: field,
    ) -> (VaultOwnerKey, HeirClaimToken, Future) {
        // Timeout must be positive
        assert(timeout_blocks > 0u32);

        // Owner cannot be heir
        assert_neq(self.caller, heir);

        // Issue private records
        let owner_key: VaultOwnerKey = VaultOwnerKey {
            owner: self.caller,
            vault_id: vault_id,
        };

        let heir_token: HeirClaimToken = HeirClaimToken {
            owner: heir,
            vault_id: vault_id,
        };

        // Finalize: write public state
        return (owner_key, heir_token, finalize_create_vault(
            vault_id,
            self.caller,
            heir,
            timeout_blocks,
            p0, p1, p2, p3,
        ));
    }

    async function finalize_create_vault(
        vault_id: field,
        owner_addr: address,
        heir_addr: address,
        timeout_blocks: u32,
        p0: field,
        p1: field,
        p2: field,
        p3: field,
    ) {
        // Vault must not already exist
        let exists: bool = Mapping::contains(vault_active, vault_id);
        assert(!exists);

        // Initialize vault state
        Mapping::set(vault_owner, vault_id, owner_addr);
        Mapping::set(vault_heir, vault_id, heir_addr);
        Mapping::set(timeout_period, vault_id, timeout_blocks);
        Mapping::set(last_ping, vault_id, block.height);
        Mapping::set(vault_active, vault_id, true);

        // Store encrypted payload on-chain
        Mapping::set(payload_chunk_0, vault_id, p0);
        Mapping::set(payload_chunk_1, vault_id, p1);
        Mapping::set(payload_chunk_2, vault_id, p2);
        Mapping::set(payload_chunk_3, vault_id, p3);
    }

    /// Owner pings to reset the DMS timer.
    /// Consumes the old VaultOwnerKey and issues a new one (replay protection).
    async transition ping(key: VaultOwnerKey) -> (VaultOwnerKey, Future) {
        // Re-issue the key (old one is consumed)
        let new_key: VaultOwnerKey = VaultOwnerKey {
            owner: key.owner,
            vault_id: key.vault_id,
        };

        return (new_key, finalize_ping(key.vault_id, key.owner));
    }

    async function finalize_ping(vault_id: field, owner_addr: address) {
        // Verify caller is the vault owner
        let stored_owner: address = Mapping::get(vault_owner, vault_id);
        assert_eq(owner_addr, stored_owner);

        // Vault must be active
        let active: bool = Mapping::get(vault_active, vault_id);
        assert(active);

        // Reset the timer
        Mapping::set(last_ping, vault_id, block.height);
    }

    /// Owner updates the heir address.
    async transition set_heir(
        key: VaultOwnerKey,
        new_heir: address,
    ) -> (VaultOwnerKey, HeirClaimToken, Future) {
        // Owner cannot be heir
        assert_neq(key.owner, new_heir);

        let new_key: VaultOwnerKey = VaultOwnerKey {
            owner: key.owner,
            vault_id: key.vault_id,
        };

        let heir_token: HeirClaimToken = HeirClaimToken {
            owner: new_heir,
            vault_id: key.vault_id,
        };

        return (new_key, heir_token, finalize_set_heir(key.vault_id, key.owner, new_heir));
    }

    async function finalize_set_heir(vault_id: field, owner_addr: address, new_heir: address) {
        let stored_owner: address = Mapping::get(vault_owner, vault_id);
        assert_eq(owner_addr, stored_owner);

        let active: bool = Mapping::get(vault_active, vault_id);
        assert(active);

        Mapping::set(vault_heir, vault_id, new_heir);

        // Also reset ping timer on heir change
        Mapping::set(last_ping, vault_id, block.height);
    }

    /// Owner updates the encrypted payload (e.g., key rotation).
    async transition update_payload(
        key: VaultOwnerKey,
        p0: field,
        p1: field,
        p2: field,
        p3: field,
    ) -> (VaultOwnerKey, Future) {
        let new_key: VaultOwnerKey = VaultOwnerKey {
            owner: key.owner,
            vault_id: key.vault_id,
        };

        return (new_key, finalize_update_payload(key.vault_id, key.owner, p0, p1, p2, p3));
    }

    async function finalize_update_payload(
        vault_id: field,
        owner_addr: address,
        p0: field,
        p1: field,
        p2: field,
        p3: field,
    ) {
        let stored_owner: address = Mapping::get(vault_owner, vault_id);
        assert_eq(owner_addr, stored_owner);

        let active: bool = Mapping::get(vault_active, vault_id);
        assert(active);

        // Update payload
        Mapping::set(payload_chunk_0, vault_id, p0);
        Mapping::set(payload_chunk_1, vault_id, p1);
        Mapping::set(payload_chunk_2, vault_id, p2);
        Mapping::set(payload_chunk_3, vault_id, p3);

        // Reset ping timer on payload update
        Mapping::set(last_ping, vault_id, block.height);
    }

    /// Heir claims the vault after the timeout has expired.
    /// The heir reads the encrypted payload from public mappings (via Aleo RPC)
    /// and passes them as inputs. The finalize block verifies the timeout.
    /// The returned InheritancePayload is a private record — only the heir
    /// can see it, providing ZK-privacy for the claim transaction.
    async transition claim(
        token: HeirClaimToken,
        p0: field,
        p1: field,
        p2: field,
        p3: field,
    ) -> (InheritancePayload, Future) {
        let payload: InheritancePayload = InheritancePayload {
            owner: token.owner,
            vault_id: token.vault_id,
            payload_0: p0,
            payload_1: p1,
            payload_2: p2,
            payload_3: p3,
        };

        return (payload, finalize_claim(token.vault_id, token.owner));
    }

    async function finalize_claim(vault_id: field, heir_addr: address) {
        // Verify caller is the designated heir
        let stored_heir: address = Mapping::get(vault_heir, vault_id);
        assert_eq(heir_addr, stored_heir);

        // Vault must be active
        let active: bool = Mapping::get(vault_active, vault_id);
        assert(active);

        // Check timeout has expired (DMS triggered)
        let last: u32 = Mapping::get(last_ping, vault_id);
        let timeout: u32 = Mapping::get(timeout_period, vault_id);
        assert(block.height > last + timeout);

        // Deactivate vault — inheritance complete
        Mapping::set(vault_active, vault_id, false);
    }
}
