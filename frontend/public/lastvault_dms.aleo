program lastvault_dms.aleo;

record VaultOwnerKey:
    owner as address.private;
    vault_id as field.private;

record HeirClaimToken:
    owner as address.private;
    vault_id as field.private;

record InheritancePayload:
    owner as address.private;
    vault_id as field.private;
    payload_0 as field.private;
    payload_1 as field.private;
    payload_2 as field.private;
    payload_3 as field.private;

mapping last_ping:
    key as field.public;
    value as u32.public;

mapping timeout_period:
    key as field.public;
    value as u32.public;

mapping vault_active:
    key as field.public;
    value as boolean.public;

mapping vault_owner:
    key as field.public;
    value as address.public;

mapping vault_heir:
    key as field.public;
    value as address.public;

mapping payload_chunk_0:
    key as field.public;
    value as field.public;

mapping payload_chunk_1:
    key as field.public;
    value as field.public;

mapping payload_chunk_2:
    key as field.public;
    value as field.public;

mapping payload_chunk_3:
    key as field.public;
    value as field.public;

function create_vault:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as u32.private;
    input r3 as field.private;
    input r4 as field.private;
    input r5 as field.private;
    input r6 as field.private;
    gt r2 0u32 into r7;
    assert.eq r7 true;
    assert.neq self.caller r1;
    cast self.caller r0 into r8 as VaultOwnerKey.record;
    cast r1 r0 into r9 as HeirClaimToken.record;
    async create_vault r0 self.caller r1 r2 r3 r4 r5 r6 into r10;
    output r8 as VaultOwnerKey.record;
    output r9 as HeirClaimToken.record;
    output r10 as lastvault_dms.aleo/create_vault.future;

finalize create_vault:
    input r0 as field.public;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as u32.public;
    input r4 as field.public;
    input r5 as field.public;
    input r6 as field.public;
    input r7 as field.public;
    contains vault_active[r0] into r8;
    not r8 into r9;
    assert.eq r9 true;
    set r1 into vault_owner[r0];
    set r2 into vault_heir[r0];
    set r3 into timeout_period[r0];
    set block.height into last_ping[r0];
    set true into vault_active[r0];
    set r4 into payload_chunk_0[r0];
    set r5 into payload_chunk_1[r0];
    set r6 into payload_chunk_2[r0];
    set r7 into payload_chunk_3[r0];

function ping:
    input r0 as VaultOwnerKey.record;
    cast r0.owner r0.vault_id into r1 as VaultOwnerKey.record;
    async ping r0.vault_id r0.owner into r2;
    output r1 as VaultOwnerKey.record;
    output r2 as lastvault_dms.aleo/ping.future;

finalize ping:
    input r0 as field.public;
    input r1 as address.public;
    get vault_owner[r0] into r2;
    assert.eq r1 r2;
    get vault_active[r0] into r3;
    assert.eq r3 true;
    set block.height into last_ping[r0];

function set_heir:
    input r0 as VaultOwnerKey.record;
    input r1 as address.private;
    assert.neq r0.owner r1;
    cast r0.owner r0.vault_id into r2 as VaultOwnerKey.record;
    cast r1 r0.vault_id into r3 as HeirClaimToken.record;
    async set_heir r0.vault_id r0.owner r1 into r4;
    output r2 as VaultOwnerKey.record;
    output r3 as HeirClaimToken.record;
    output r4 as lastvault_dms.aleo/set_heir.future;

finalize set_heir:
    input r0 as field.public;
    input r1 as address.public;
    input r2 as address.public;
    get vault_owner[r0] into r3;
    assert.eq r1 r3;
    get vault_active[r0] into r4;
    assert.eq r4 true;
    set r2 into vault_heir[r0];
    set block.height into last_ping[r0];

function update_payload:
    input r0 as VaultOwnerKey.record;
    input r1 as field.private;
    input r2 as field.private;
    input r3 as field.private;
    input r4 as field.private;
    cast r0.owner r0.vault_id into r5 as VaultOwnerKey.record;
    async update_payload r0.vault_id r0.owner r1 r2 r3 r4 into r6;
    output r5 as VaultOwnerKey.record;
    output r6 as lastvault_dms.aleo/update_payload.future;

finalize update_payload:
    input r0 as field.public;
    input r1 as address.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as field.public;
    input r5 as field.public;
    get vault_owner[r0] into r6;
    assert.eq r1 r6;
    get vault_active[r0] into r7;
    assert.eq r7 true;
    set r2 into payload_chunk_0[r0];
    set r3 into payload_chunk_1[r0];
    set r4 into payload_chunk_2[r0];
    set r5 into payload_chunk_3[r0];
    set block.height into last_ping[r0];

function claim:
    input r0 as HeirClaimToken.record;
    input r1 as field.private;
    input r2 as field.private;
    input r3 as field.private;
    input r4 as field.private;
    cast r0.owner r0.vault_id r1 r2 r3 r4 into r5 as InheritancePayload.record;
    async claim r0.vault_id r0.owner into r6;
    output r5 as InheritancePayload.record;
    output r6 as lastvault_dms.aleo/claim.future;

finalize claim:
    input r0 as field.public;
    input r1 as address.public;
    get vault_heir[r0] into r2;
    assert.eq r1 r2;
    get vault_active[r0] into r3;
    assert.eq r3 true;
    get last_ping[r0] into r4;
    get timeout_period[r0] into r5;
    add r4 r5 into r6;
    gt block.height r6 into r7;
    assert.eq r7 true;
    set false into vault_active[r0];

constructor:
    assert.eq edition 0u16;
