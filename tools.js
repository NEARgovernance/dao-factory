import { providers } from "near-api-js";
import { Buffer } from "buffer";

let walletSelector;

export function setWalletSelector(selector) {
  walletSelector = selector;
}

export const tools = [
  {
    type: "function",
    function: {
      name: "check_wallet_connection",
      description: "Check wallet connection and network status",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_proposals",
      description:
        "Get governance proposals from the NEAR voting contract. Use reasonable limits between 1-100.",
      parameters: {
        type: "object",
        properties: {
          from_index: {
            type: "number",
            default: 0,
            minimum: 0,
            maximum: 10000,
            description: "Starting index for proposals (0-10000)",
          },
          limit: {
            type: "number",
            default: 10,
            minimum: 1,
            maximum: 100,
            description: "Number of proposals to fetch (1-100)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current date and time",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

export const toolImplementations = {
  check_wallet_connection: async () => {
    if (!walletSelector) {
      return JSON.stringify(
        {
          success: false,
          error: "Wallet selector not initialized",
          timestamp: new Date().toISOString(),
        },
        null,
        2
      );
    }

    try {
      const selectedWallet = await walletSelector.wallet();
      const networkId = walletSelector.options.network;

      const isSignedIn = walletSelector.isSignedIn();
      let accounts = [];

      if (isSignedIn) {
        accounts = await selectedWallet.getAccounts();
      }

      const rpcUrl =
        networkId === "mainnet"
          ? "https://rpc.mainnet.near.org"
          : "https://rpc.testnet.near.org";

      const provider = new providers.JsonRpcProvider({ url: rpcUrl });

      let rpcTest = null;
      try {
        const blockResult = await provider.block({ finality: "final" });
        rpcTest = {
          success: true,
          latest_block_height: blockResult.header.height,
        };
      } catch (rpcError) {
        rpcTest = {
          success: false,
          error: rpcError.message,
        };
      }

      let contractTest = null;
      try {
        const accountResult = await provider.query({
          request_type: "view_account",
          finality: "final",
          account_id: "vote.govai.near",
        });

        contractTest = {
          exists: true,
          has_contract:
            accountResult.code_hash !== "11111111111111111111111111111111",
          balance: accountResult.amount,
          code_hash: accountResult.code_hash.substring(0, 20) + "...",
        };
      } catch (contractError) {
        contractTest = {
          exists: false,
          error: contractError.message,
          error_type: contractError.type,
        };
      }

      return JSON.stringify(
        {
          success: true,
          wallet_info: {
            network_id: networkId,
            is_signed_in: isSignedIn,
            accounts: accounts,
            wallet_options: walletSelector.options,
          },
          rpc_test: rpcTest,
          contract_test: contractTest,
          rpc_url: rpcUrl,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      );
    } catch (error) {
      return JSON.stringify(
        {
          success: false,
          error: error.message,
          error_stack: error.stack,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      );
    }
  },

  get_proposals: async (params = {}) => {
    const originalFromIndex = params.from_index;
    const originalLimit = params.limit;

    const from_index = Math.max(
      0,
      Math.min(parseInt(params.from_index) || 0, 10000)
    );
    const limit = Math.max(1, Math.min(parseInt(params.limit) || 10, 100));

    console.log("Parameter validation:", {
      original_from_index: originalFromIndex,
      original_limit: originalLimit,
      validated_from_index: from_index,
      validated_limit: limit,
    });

    if (!walletSelector) {
      throw new Error("Wallet selector not initialized");
    }

    try {
      const selectedWallet = await walletSelector.wallet();
      const networkId = walletSelector.options.network;

      const rpcUrl = "https://rpc.mainnet.near.org";
      const provider = new providers.JsonRpcProvider({ url: rpcUrl });

      const votingContractId = "vote.govai.near";
      const args = { from_index, limit };

      console.log("Calling contract with validated args:", {
        contract: votingContractId,
        method: "get_proposals",
        args,
        network: "mainnet",
        wallet_network: networkId,
      });

      const result = await provider.query({
        request_type: "call_function",
        finality: "final",
        account_id: votingContractId,
        method_name: "get_proposals",
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      });

      const proposals = JSON.parse(Buffer.from(result.result).toString());

      const formatted = proposals.map((p) => ({
        id: p.id,
        title: p.title || "No title",
        description: p.description || "No description",
        status: p.status,
        proposer_id: p.proposer_id,
        reviewer_id: p.reviewer_id,
        rejected: p.rejected,
        creation_time: p.creation_time_ns
          ? new Date(parseInt(p.creation_time_ns) / 1e6).toISOString()
          : null,
        voting_start_time: p.voting_start_time_ns
          ? new Date(parseInt(p.voting_start_time_ns) / 1e6).toISOString()
          : null,
        voting_duration_hours: p.voting_duration_ns
          ? parseInt(p.voting_duration_ns) / (1e9 * 3600)
          : null,
        voting_options: p.voting_options || [],
        votes: p.votes || [],
        total_votes: {
          total_venear: p.total_votes?.total_venear || "0",
          total_votes: p.total_votes?.total_votes || 0,
        },
        link: p.link || null,
      }));

      return JSON.stringify(
        {
          success: true,
          method: "get_proposals",
          contract_id: votingContractId,
          network_used: "mainnet",
          wallet_network: networkId,
          rpc_url: rpcUrl,
          total_proposals: formatted.length,
          from_index,
          limit,
          proposals: formatted,
          debug_info: {
            raw_proposals_count: proposals.length,
            wallet_signed_in: walletSelector.isSignedIn(),
          },
          timestamp: new Date().toISOString(),
        },
        null,
        2
      );
    } catch (error) {
      console.error("Error in get_proposals:", error);

      return JSON.stringify(
        {
          success: false,
          error: error.message,
          contract_id: "vote.govai.near",
          network_used: "mainnet",
          wallet_network: walletSelector?.options?.network || "unknown",
          validated_parameters: { from_index, limit },
          error_details: {
            type: error.type,
            message: error.message,
            stack: error.stack,
          },
          timestamp: new Date().toISOString(),
        },
        null,
        2
      );
    }
  },

  get_current_time: async () => new Date().toISOString(),
};
