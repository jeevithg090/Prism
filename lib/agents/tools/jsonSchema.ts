// P5 · JSON Schema for the Keystone tools (function calling, MCP tools/list, the governance page).
import "server-only";
import { z } from "zod";
import type { AgentName } from "@/lib/types";
import { TOOLS } from "./registry";
import type { AnyTool, ToolEffect } from "./types";

export type JsonSchema = { type: "object"; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown };

/** The tool's input as a JSON Schema object (input mode, so defaulted fields stay optional; no `$schema`). */
export function toolJsonSchema(tool: AnyTool): JsonSchema {
  const { $schema: _drop, ...schema } = z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  void _drop;
  return { ...schema, type: "object", properties: (schema.properties as Record<string, unknown> | undefined) ?? {} } as JsonSchema;
}

export interface ToolManifestEntry {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  effect: ToolEffect;
  requiresApproval: boolean;
  agent: AgentName;
}

export function toolManifest(tools: AnyTool[] = TOOLS): ToolManifestEntry[] {
  return tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: toolJsonSchema(t),
    effect: t.effect,
    requiresApproval: t.requiresApproval,
    agent: t.agent,
  }));
}
