export type MessageRole = "user" | "assistant" | "system";

export type AttachmentKind = "text" | "image" | "binary";

/** A file attached to a chat message and sent to the local model when possible. */
export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  /** Extracted / decoded text for text-like files. */
  textContent?: string;
  /** Raw base64 (no data-URL prefix) for images sent to vision models. */
  dataBase64?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  attachments?: ChatAttachment[];
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}
