/**
 * Stub local LLM service
 */
export async function generateResponse(prompt: string): Promise<string> {
  const trimmed = prompt.trim();

  // Simulate a short generation delay for realistic UI feedback
  await new Promise((resolve) => setTimeout(resolve, 450));

  if (!trimmed) {
    return "Send a prompt to begin a conversation.";
  }

  return [
    "Local model response (placeholder).",
  ].join("\n");
}
