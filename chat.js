export async function nearAiChatCompletionRequest({
  model = "fireworks::accounts/fireworks/models/qwen2p5-72b-instruct",
  messages = [],
  assistantResponse = "",
  authorizationObject,
  tools = [],
  toolImplementations = {},
  onChunk = () => {},
  onError = () => {},
}) {
  const trimmedMessages = trimConversation(messages);

  console.log("=== TOKEN MANAGEMENT ===");
  console.log("Original messages:", messages.length);
  console.log("Trimmed messages:", trimmedMessages.length);

  const res = await fetch("https://api.near.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JSON.stringify(authorizationObject)}`,
    },
    body: JSON.stringify({
      model,
      messages: trimmedMessages,
      tools,
      max_tokens: 1000,
      temperature: 0.1,
      top_p: 0.9,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    onError(`${res.status} ${res.statusText}: ${text}`);
    throw new Error(`NEAR AI API error: ${res.statusText}`);
  }

  const responseData = await res.json();
  const { choices } = responseData;
  const message = choices[0].message;

  console.log("=== API RESPONSE DEBUG ===");
  console.log("Response:", {
    finish_reason: choices[0].finish_reason,
    has_tool_calls: !!message.tool_calls,
    has_content: !!message.content,
    content_length: message.content?.length || 0,
  });

  if (choices[0].finish_reason === "length") {
    console.warn("Response was truncated due to length limits");

    if (message.tool_calls && message.tool_calls.length > 0) {
      message.tool_calls = message.tool_calls.map(fixTruncatedToolCall);
    }
  }

  if (!message.content) {
    message.content = "";
  }

  messages.push(message);
  assistantResponse += message.content;
  onChunk({ assistantResponse });

  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    const { messages: m2, assistantResponse: ar2 } = await handleToolCalls({
      assistantResponse,
      toolCalls: message.tool_calls,
      toolImplementations,
      messages,
      onChunk,
      onError,
    });

    return nearAiChatCompletionRequest({
      model,
      messages: m2,
      assistantResponse: ar2,
      authorizationObject,
      tools,
      toolImplementations,
      onChunk,
      onError,
    });
  }

  return messages;
}

function trimConversation(messages) {
  const systemMessages = messages.filter((m) => m.role === "system");
  const recentMessages = messages.filter((m) => m.role !== "system").slice(-6); // Keep last 6 messages

  return [...systemMessages, ...recentMessages];
}

function fixTruncatedToolCall(toolCall) {
  if (!toolCall.function?.arguments) {
    return toolCall;
  }

  const args = toolCall.function.arguments;

  if (args.includes('"limit": 10, "limit": 10') || args.length > 500) {
    console.log("Fixing truncated tool call arguments");

    const fromIndexMatch = args.match(/"from_index":\s*(\d+)/);
    const limitMatch = args.match(/"limit":\s*(\d+)/);

    const cleanArgs = {
      from_index: fromIndexMatch ? parseInt(fromIndexMatch[1]) : 0,
      limit: limitMatch ? parseInt(limitMatch[1]) : 10,
    };

    return {
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments: JSON.stringify(cleanArgs),
      },
    };
  }

  return toolCall;
}

export async function handleToolCalls({
  assistantResponse = "",
  toolCalls,
  toolImplementations,
  messages,
  onChunk,
  onError,
}) {
  for (const toolCall of toolCalls) {
    const argsDisplay = toolCall.function.arguments || "{}";
    assistantResponse += `*Calling function* \`${toolCall.function.name}\` with arguments\n\`\`\`\n${argsDisplay}\n\`\`\`\n\n`;
    onChunk({ assistantResponse });

    let args;
    try {
      const argsString = toolCall.function.arguments;

      if (
        !argsString ||
        argsString.trim() === "" ||
        argsString.trim() === "{}"
      ) {
        args = {};
      } else {
        args = JSON.parse(argsString);
      }
    } catch (e) {
      console.error(`Failed to parse args for ${toolCall.function.name}`, e);
      args = { from_index: 0, limit: 10 };
      assistantResponse += `*Using default arguments due to parsing error*\n\n`;
      onChunk({ assistantResponse });
    }

    try {
      const result = await toolImplementations[toolCall.function.name](args);
      assistantResponse += `*Function call result:*\n\`\`\`\n${result}\n\`\`\`\n\n`;
      onChunk({ assistantResponse });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    } catch (e) {
      console.error(`Error running ${toolCall.function.name}`, e);
      assistantResponse += `*Error running ${toolCall.function.name}:* ${e.message}\n\n`;
      onChunk({ assistantResponse });
    }
  }

  return { messages, assistantResponse };
}
