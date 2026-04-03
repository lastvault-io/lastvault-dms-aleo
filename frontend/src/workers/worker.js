import {
  Account,
  ProgramManager,
  initThreadPool,
  AleoNetworkClient,
  NetworkRecordProvider,
  AleoKeyProvider,
  RecordCiphertext,
} from "@provablehq/sdk";

await initThreadPool();

const PROGRAM_ID = "lastvault_dms.aleo";
const NETWORK_URL = "https://api.explorer.provable.com/v1";

let currentAccount = null;
let networkClient = null;

async function createAccount(privateKey) {
  if (privateKey) {
    currentAccount = new Account({ privateKey });
  } else {
    currentAccount = new Account();
  }
  networkClient = new AleoNetworkClient(NETWORK_URL);
  return {
    privateKey: currentAccount.privateKey().to_string(),
    address: currentAccount.address().to_string(),
  };
}

async function executeProgram(functionName, inputs, programName) {
  if (!currentAccount) throw new Error("No account set");
  if (!networkClient) networkClient = new AleoNetworkClient(NETWORK_URL);

  const keyProvider = new AleoKeyProvider();
  keyProvider.useCache(true);
  const recordProvider = new NetworkRecordProvider(currentAccount, networkClient);

  const pm = new ProgramManager(NETWORK_URL, keyProvider, recordProvider);
  pm.setAccount(currentAccount);

  const txId = await pm.execute({
    programName: programName || PROGRAM_ID,
    functionName,
    inputs,
    fee: 1.0,
    privateFee: false,
  });

  return txId;
}

async function findRecords() {
  if (!currentAccount || !networkClient) throw new Error("No account set");

  // Find unspent records belonging to this account for our program
  const records = await networkClient.findUnspentRecords(
    0, // start height
    undefined, // end height (latest)
    currentAccount.privateKey().to_string(),
    undefined, // amounts
    undefined, // max microcredits
    [PROGRAM_ID], // programs to search
  );

  // Parse and categorize records
  const result = { vaultOwnerKeys: [], heirClaimTokens: [], inheritancePayloads: [] };

  if (records && Array.isArray(records)) {
    for (const r of records) {
      const text = r.toString ? r.toString() : String(r);
      // Try to detect record type from content
      if (text.includes('vault_id')) {
        // All our records have vault_id, distinguish by context
        result.vaultOwnerKeys.push(text);
      }
    }
  }

  return result;
}

async function findRecordsForVault(vaultId) {
  if (!currentAccount || !networkClient) throw new Error("No account set");

  try {
    // Use the view key to scan for records
    const viewKey = currentAccount.viewKey().to_string();

    // Query recent transactions for this program
    const latestHeight = await networkClient.getLatestHeight();
    const startHeight = Math.max(0, latestHeight - 5000); // Last ~5000 blocks

    const records = await networkClient.findUnspentRecords(
      startHeight,
      undefined,
      currentAccount.privateKey().to_string(),
      undefined,
      undefined,
      [PROGRAM_ID],
    );

    return records?.map(r => r.toString ? r.toString() : String(r)) || [];
  } catch (e) {
    console.error("findRecordsForVault error:", e);
    return [];
  }
}

async function decryptRecordsFromTx(txId) {
  if (!currentAccount || !networkClient) throw new Error("No account set");

  // Fetch transaction from testnet
  const response = await fetch(`${NETWORK_URL}/testnet/transaction/${txId}`);
  if (!response.ok) throw new Error("Failed to fetch transaction");
  const tx = await response.json();

  const viewKey = currentAccount.viewKey();
  const decryptedRecords = [];

  // Get execution transition outputs
  const transitions = tx?.execution?.transitions || [];
  for (const transition of transitions) {
    const outputs = transition?.outputs || [];
    for (const output of outputs) {
      if (output.type === "record" && output.value) {
        try {
          const ciphertext = RecordCiphertext.fromString(output.value);
          const plaintext = ciphertext.decrypt(viewKey);
          decryptedRecords.push(plaintext.toString());
        } catch (e) {
          // Record not owned by this account — skip
        }
      }
    }
  }

  return decryptedRecords;
}

onmessage = async function (e) {
  const { id, type, payload } = e.data;
  try {
    let result;
    switch (type) {
      case "createAccount":
        result = await createAccount(payload?.privateKey);
        break;
      case "execute":
        result = await executeProgram(payload.functionName, payload.inputs, payload.programName);
        break;
      case "findRecords":
        result = await findRecordsForVault(payload?.vaultId);
        break;
      case "decryptRecords":
        result = await decryptRecordsFromTx(payload.txId);
        break;
      default:
        throw new Error(`Unknown type: ${type}`);
    }
    postMessage({ id, type, success: true, result });
  } catch (error) {
    postMessage({ id, type, success: false, error: error.message || String(error) });
  }
};
