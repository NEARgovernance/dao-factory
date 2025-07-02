import * as near from "@fastnear/api";

// Initialize FastNear
window.near = near;
window.$$ = near.utils.convertUnit;

near.config({
  networkId: "testnet",
});

// Global state
let appState = {
  accountId: null,
  isConnected: false,
  factoryContractId: "ballotbox.testnet",
  deployedContracts: [],
  loading: false,
};

// Utility functions
function formatNear(yoctoNear) {
  return yoctoNear
    ? `${(parseFloat(yoctoNear) / 1e24).toFixed(3)} NEAR`
    : `...`;
}

function addResult(type, content) {
  const resultsSection = document.getElementById("results-section");
  const resultsContent = document.getElementById("results-content");

  resultsSection.style.display = "block";

  const resultItem = document.createElement("div");
  resultItem.className = "result-item";

  const time = new Date().toLocaleTimeString();
  resultItem.innerHTML = `
    <div style="font-size: 0.9rem; opacity: 0.7; margin-bottom: 5px;">${time} - ${type}</div>
    <div style="font-family: 'Courier New', monospace; white-space: pre-wrap; word-break: break-all;">${content}</div>
  `;

  resultsContent.insertBefore(resultItem, resultsContent.firstChild);
}

function clearResults() {
  document.getElementById("results-content").innerHTML = "";
  document.getElementById("results-section").style.display = "none";
}

// Wallet connection using FastNear patterns
async function connectWallet() {
  try {
    const account = await near.requestSignIn({
      contractId: appState.factoryContractId,
      methodNames: ["create", "get_contracts", "get_number_contracts"],
    });

    if (account) {
      appState.isConnected = true;
      appState.accountId = account;
      updateWalletStatus();
      showFactoryInterface();
      addResult("Success", `Connected to wallet: ${account}`);
    } else {
      addResult("Error", "Failed to connect to wallet");
    }
  } catch (error) {
    console.error("Connection error:", error);
    addResult("Error", "Connection failed: " + error.message);
  }
}

async function disconnectWallet() {
  try {
    await near.signOut();
    appState.isConnected = false;
    appState.accountId = null;
    updateWalletStatus();
    hideFactoryInterface();
    addResult("Info", "Disconnected from wallet");
  } catch (error) {
    console.error("Disconnect error:", error);
    addResult("Error", "Disconnect failed: " + error.message);
  }
}

function updateWalletStatus() {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const connectBtn = document.getElementById("connectBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");
  const accountInfo = document.getElementById("accountInfo");
  const accountId = document.getElementById("accountId");

  if (appState.isConnected && appState.accountId) {
    statusDot.classList.add("connected");
    statusText.textContent = "Connected";
    connectBtn.style.display = "none";
    disconnectBtn.style.display = "inline-block";
    accountInfo.style.display = "block";
    accountId.textContent = appState.accountId;
  } else {
    statusDot.classList.remove("connected");
    statusText.textContent = "Not Connected";
    connectBtn.style.display = "inline-block";
    disconnectBtn.style.display = "none";
    accountInfo.style.display = "none";
  }
}

function showFactoryInterface() {
  document.getElementById("factoryStats").style.display = "block";
  document.getElementById("createSection").style.display = "block";
  document.getElementById("contractsSection").style.display = "block";

  // Auto-load contracts when interface is shown
  loadDeployedContracts();
}

function hideFactoryInterface() {
  document.getElementById("factoryStats").style.display = "none";
  document.getElementById("createSection").style.display = "none";
  document.getElementById("contractsSection").style.display = "none";
}

// Factory operations using FastNear sendTx pattern
async function deployBallotBox() {
  if (!appState.isConnected) {
    addResult("Error", "Please connect your wallet first");
    return;
  }

  const factoryContract = document
    .getElementById("factoryContractId")
    .value.trim();
  const ballotName = document.getElementById("ballotName").value.trim();
  const deposit = document.getElementById("deploymentDeposit").value.trim();

  if (!factoryContract || !ballotName) {
    addResult("Error", "Please fill in factory contract ID and ballot name");
    return;
  }

  // Validate ballot name (basic validation)
  if (!/^[a-z0-9\-_]+$/.test(ballotName)) {
    addResult(
      "Error",
      "Ballot name can only contain lowercase letters, numbers, hyphens, and underscores"
    );
    return;
  }

  try {
    const deployLoader = document.getElementById("deployLoader");
    deployLoader.style.display = "inline-block";
    appState.loading = true;

    // Get configuration values from the form
    const venearAccountId =
      document.getElementById("venearAccountId").value.trim() ||
      "v.hos03.testnet";
    const ownerAccountId =
      document.getElementById("ownerAccountId").value.trim() ||
      appState.accountId ||
      "ballotbox.testnet";
    const votingDurationDays =
      parseInt(document.getElementById("votingDurationDays").value) || 7;
    const maxVotingOptions =
      parseInt(document.getElementById("maxVotingOptions").value) || 10;
    const proposalFee =
      parseFloat(document.getElementById("proposalFee").value) || 0.1;
    const voteStorageFee =
      parseFloat(document.getElementById("voteStorageFee").value) || 0.001;
    const reviewersInput = document.getElementById("reviewers").value.trim();
    const guardiansInput = document.getElementById("guardians").value.trim();

    // Parse reviewers (fallback to factory contract if empty)
    let reviewerIds = [factoryContract];
    if (reviewersInput) {
      const accounts = reviewersInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      if (accounts.length > 0) {
        reviewerIds = accounts;
      }
    }

    // Parse guardians (fallback to factory contract if empty)
    let guardians = [factoryContract];
    if (guardiansInput) {
      const accounts = guardiansInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      if (accounts.length > 0) {
        guardians = accounts;
      }
    }

    // Helper function to convert NEAR to yoctoNEAR without scientific notation
    function nearToYocto(nearAmount) {
      // Convert to micronear first to avoid floating point precision issues
      const microNear = Math.floor(nearAmount * 1000000);
      return microNear.toString() + "000000000000000000"; // Add 18 zeros
    }

    // Convert to the expected format - avoid scientific notation completely
    const votingDurationNs = (
      votingDurationDays *
      24 *
      60 *
      60 *
      1000000000
    ).toString(); // days to nanoseconds
    const proposalFeeYocto = nearToYocto(proposalFee);
    const voteStorageFeeYocto = nearToYocto(voteStorageFee);

    // Create the configuration object
    const config = {
      config: {
        venear_account_id: venearAccountId,
        reviewer_ids: reviewerIds,
        owner_account_id: ownerAccountId,
        voting_duration_ns: votingDurationNs,
        max_number_of_voting_options: maxVotingOptions,
        base_proposal_fee: proposalFeeYocto,
        vote_storage_fee: voteStorageFeeYocto,
        guardians: guardians,
        proposed_new_owner_account_id: null,
      },
    };

    // Encode the config as base64
    const configJson = JSON.stringify(config);
    const base64Config = btoa(configJson);

    const args = {
      name: ballotName,
      args: base64Config,
    };

    addResult("Info", `Deploying ballot box: ${ballotName}.${factoryContract}`);
    addResult(
      "Debug",
      `Owner: ${ownerAccountId}, Duration: ${votingDurationDays} days`
    );
    addResult(
      "Debug",
      `Proposal Fee: ${proposalFee} NEAR, Vote Fee: ${voteStorageFee} NEAR`
    );
    addResult("Debug", `Reviewers: ${reviewerIds.join(", ")}`);
    addResult("Debug", `Guardians: ${guardians.join(", ")}`);

    // Use FastNear's sendTx pattern with exact same parameters as CLI
    const result = await near.sendTx({
      receiverId: factoryContract,
      actions: [
        near.actions.functionCall({
          methodName: "create",
          gas: $$`300 Tgas`,
          deposit: $$`${deposit || "3"} NEAR`,
          args: args,
        }),
      ],
      waitUntil: "INCLUDED",
    });

    const deployedAddress = `${ballotName}.${factoryContract}`;
    addResult("Success", `Deployed ballot box: ${deployedAddress}`);
    addResult("Transaction", JSON.stringify(result, null, 2));

    // Store factory contract for future use
    appState.factoryContractId = factoryContract;

    // Clear form
    document.getElementById("ballotName").value = "";

    // Refresh contracts list immediately and also after a delay
    loadDeployedContracts();
    setTimeout(() => loadDeployedContracts(), 3000);
  } catch (error) {
    console.error("Deployment error:", error);
    addResult("Error", "Deployment failed: " + error.message);
  } finally {
    document.getElementById("deployLoader").style.display = "none";
    appState.loading = false;
  }
}

async function loadDeployedContracts() {
  const factoryContract =
    document.getElementById("factoryContractId").value.trim() ||
    appState.factoryContractId;

  if (!factoryContract) {
    addResult("Error", "Please enter a factory contract ID");
    return;
  }

  try {
    addResult("Info", `Loading contracts from factory: ${factoryContract}`);

    // Use FastNear's view method
    const totalCount = await near.view({
      contractId: factoryContract,
      methodName: "get_number_contracts",
      args: {},
    });

    // Update stats
    document.getElementById("totalContracts").textContent = totalCount;
    document.getElementById("factoryAddress").textContent =
      factoryContract.length > 20
        ? factoryContract.substring(0, 20) + "..."
        : factoryContract;

    if (totalCount === 0) {
      updateContractsList([]);
      addResult("Info", "No contracts deployed yet");
      return;
    }

    // Get contracts list
    const contracts = await near.view({
      contractId: factoryContract,
      methodName: "get_contracts",
      args: {
        from_index: 0,
        limit: Math.min(totalCount, 50),
      },
    });

    appState.deployedContracts = contracts;
    appState.factoryContractId = factoryContract;

    updateContractsList(contracts);
    addResult("Success", `Loaded ${contracts.length} deployed contracts`);
  } catch (error) {
    console.error("Load contracts error:", error);
    addResult("Error", "Failed to load contracts: " + error.message);
  }
}

function updateContractsList(contracts) {
  const container = document.getElementById("contractsList");

  if (contracts.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <p class="text-muted">No ballot boxes deployed yet</p>
      </div>
    `;
    return;
  }

  container.innerHTML = contracts
    .map(
      (contractId, index) => `
    <div class="contract-item" onclick="openContract('${contractId}')">
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <h6 class="mb-1">${contractId}</h6>
          <small class="text-muted">Ballot Box #${index + 1}</small>
        </div>
        <div>
          <button class="btn btn-outline-primary btn-sm" onclick="event.stopPropagation(); testContract('${contractId}')">
            Test
          </button>
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

function openContract(contractId) {
  addResult("Info", `Opening contract: ${contractId}`);
  // Could redirect to a contract interface or open in new tab
  const url = `https://${contractId}`;
  addResult("Info", `Contract would open at: ${url}`);
}

async function testContract(contractId) {
  try {
    addResult("Info", `Testing contract: ${contractId}`);

    // Try to call a basic view method to test if contract is working
    const result = await near.view({
      contractId,
      methodName: "get_proposals",
      args: {
        from_index: 0,
        limit: 1,
      },
    });

    addResult(
      "Success",
      `Contract ${contractId} is working! Found ${result.length} proposals`
    );
  } catch (error) {
    console.error("Contract test error:", error);
    addResult(
      "Warning",
      `Contract ${contractId} test failed: ${error.message}`
    );
  }
}

// Initialize app
async function initApp() {
  try {
    // Check if already signed in using FastNear's accountId method
    appState.accountId = near.accountId();

    if (appState.accountId) {
      appState.isConnected = true;
      updateWalletStatus();
      showFactoryInterface();
      addResult("Info", `Welcome back, ${appState.accountId}!`);
    }

    // Listen for sign in events
    near.event.onAccount((accountId) => {
      appState.accountId = accountId;
      appState.isConnected = !!accountId;
      updateWalletStatus();

      if (accountId) {
        showFactoryInterface();
      } else {
        hideFactoryInterface();
      }
    });

    // Listen for transaction events
    near.event.onTx((txStatus) => {
      if (txStatus.status === "Executed") {
        addResult(
          "Transaction",
          `Transaction completed: ${txStatus.transaction.hash}`
        );
      }
    });

    addResult("Info", "Ballot Box Factory initialized successfully");
  } catch (error) {
    console.error("Failed to initialize app:", error);
    addResult("Error", "Failed to initialize app: " + error.message);
  }
}

// Start the app when DOM is loaded
document.addEventListener("DOMContentLoaded", initApp);

// Expose functions globally for HTML onclick handlers
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.deployBallotBox = deployBallotBox;
window.loadDeployedContracts = loadDeployedContracts;
window.openContract = openContract;
window.testContract = testContract;
window.clearResults = clearResults;
