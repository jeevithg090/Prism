// P5 · Tool errors: always a plain-English message that tells the caller (a model or a person) how to recover.

export type ToolErrorCode =
  | "not_found" // missing profile / map / pod / issue
  | "invalid_input" // arguments failed the tool's zod schema
  | "needs_approval" // a human must approve this call first (human-in-the-loop)
  | "forbidden" // the user may not act on this resource
  | "limit" // a rate or daily limit was reached
  | "unknown_tool"
  | "failed"; // unexpected failure (already logged); safe to retry

export class ToolError extends Error {
  constructor(message: string, readonly code: ToolErrorCode = "failed") {
    super(message);
    this.name = "ToolError";
  }
}

export const isToolError = (e: unknown): e is ToolError => e instanceof ToolError;
