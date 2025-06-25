import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui-js";
import { Buffer } from "buffer";
import { marked } from "marked";

import {
  handleNearAILoginCallback,
  nearAIlogin,
  NEAR_AI_AUTH_OBJECT_STORAGE_KEY,
} from "./login.js";

import { nearAiChatCompletionRequest } from "./chat.js";
import { tools, toolImplementations, setWalletSelector } from "./tools.js";

import { getProgressBarHTML } from "./ui/progress-bar.js";

window.Buffer = Buffer;

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let conversation = [
  { role: "system", content: "You are a helpful assistant." },
];

handleNearAILoginCallback();

let walletSelector;
let currentAccount = null;
let nearAIAuth = null;

function updateAuthStatus() {
  const el = document.getElementById("authStatus");
  if (!el) return;
  el.textContent = nearAIAuth
    ? "NEAR AI: Authenticated ✓"
    : "NEAR AI: Not authenticated";
  el.className = nearAIAuth
    ? "auth-status auth-success"
    : "auth-status auth-pending";
}

function updateWalletUI() {
  const signedIn = Boolean(currentAccount);
  document.getElementById("connectWalletButton").style.display = signedIn
    ? "none"
    : "inline-block";
  document.getElementById("signOutButton").style.display = signedIn
    ? "inline-block"
    : "none";
  document.getElementById("walletInfo").style.display = signedIn
    ? "block"
    : "none";
  document.getElementById("accountId").textContent = signedIn
    ? currentAccount.accountId
    : "";

  if (!nearAIAuth) {
    const stored = localStorage.getItem(NEAR_AI_AUTH_OBJECT_STORAGE_KEY);
    if (stored) nearAIAuth = JSON.parse(stored);
  }

  updateAuthStatus();
}

export function setupWalletButtons(selector) {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "absolute",
    top: "10px",
    right: "10px",
    display: "flex",
    gap: "8px",
  });

  const connectBtn = document.createElement("button");
  connectBtn.id = "connectWalletButton";
  connectBtn.textContent = "Connect Wallet";
  container.appendChild(connectBtn);

  const signOutBtn = document.createElement("button");
  signOutBtn.id = "signOutButton";
  signOutBtn.textContent = "Sign Out";
  container.appendChild(signOutBtn);

  document.body.appendChild(container);

  const modal = setupModal(selector, {
    contractId: "ai.near",
    methodNames: [],
  });

  connectBtn.addEventListener("click", () => modal.show());
  signOutBtn.addEventListener("click", async () => {
    const wallet = await selector.wallet();
    await wallet.signOut();
    currentAccount = null;
    nearAIAuth = null;
    localStorage.removeItem(NEAR_AI_AUTH_OBJECT_STORAGE_KEY);
    updateWalletUI();
  });
}

async function initWallet() {
  walletSelector = await setupWalletSelector({
    network: "mainnet",
    modules: [setupMyNearWallet()],
  });

  setWalletSelector(walletSelector);
  setupWalletButtons(walletSelector);

  if (walletSelector.isSignedIn()) {
    const wallet = await walletSelector.wallet();
    [currentAccount] = await wallet.getAccounts();
  }
  updateWalletUI();

  walletSelector.on("signedIn", async () => {
    const wallet = await walletSelector.wallet();
    [currentAccount] = await wallet.getAccounts();
    updateWalletUI();
  });
  walletSelector.on("signedOut", () => {
    currentAccount = null;
    updateWalletUI();
  });
}

await initWallet();

const askBtn = document.getElementById("askNearAIButton");

// Chat button
askBtn.addEventListener("click", async () => {
  if (!currentAccount) {
    alert("Please connect your NEAR wallet first");
    return;
  }

  if (!nearAIAuth) {
    try {
      nearAIAuth = await nearAIlogin(
        await walletSelector.wallet(),
        "Login to NEAR AI"
      );
      updateAuthStatus();
    } catch (error) {
      console.error("Login failed:", error);
      return;
    }
  }

  const question = document.getElementById("question").value.trim();
  if (!question) return;

  const messagesDiv = document.getElementById("messages");
  document.getElementById("question").value = "";

  conversation.push({ role: "user", content: question });
  messagesDiv.innerHTML += `<div class="user-message">You: ${escapeHtml(
    question
  )}</div><br>`;

  askBtn.disabled = true;
  askBtn.textContent = "Processing...";

  const responseEl = document.createElement("div");
  responseEl.innerHTML = getProgressBarHTML();
  messagesDiv.appendChild(responseEl);

  try {
    const newMessages = await nearAiChatCompletionRequest({
      authorizationObject: nearAIAuth,
      messages: conversation,
      tools,
      toolImplementations,
      onError: (err) => console.error(err),
    });

    const assistant = newMessages[newMessages.length - 1];

    const content = assistant.content || "No response content";

    responseEl.innerHTML = `<div class="ai-message">Assistant: ${marked.parse(
      content
    )}</div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    conversation = newMessages;
  } catch (err) {
    console.error("Chat error:", err);
    responseEl.innerHTML = `<div class="ai-message">Error: ${escapeHtml(
      err.message || err.toString()
    )}</div>`;
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = "Send";
  }
});
