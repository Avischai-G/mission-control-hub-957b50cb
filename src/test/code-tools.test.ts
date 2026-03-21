import { describe, expect, it } from "vitest";
import { buildFolderDocs, catalogFromAgents, inferToolFolderPath, isCodeToolAgent, type ToolAgent } from "@/lib/code-tools";

const makeAgent = (overrides: Partial<ToolAgent>): ToolAgent => ({
  agent_id: "tool-001",
  name: "Example Tool",
  purpose: "Example purpose",
  role: "infrastructure",
  is_active: true,
  capability_tags: [],
  model: null,
  instructions_md: "",
  ...overrides,
});

describe("code tools helpers", () => {
  it("detects code-only tools from instruction markers", () => {
    const tool = makeAgent({
      agent_id: "memory-retriever",
      instructions_md: "This agent does not use an LLM model - it runs deterministic code operations only.",
    });

    expect(isCodeToolAgent(tool)).toBe(true);
  });

  it("maps routing tools into the routing folder", () => {
    const tool = makeAgent({
      agent_id: "agent-picker",
      name: "Agent Picker",
      purpose: "Selects the best specialist agent for a task.",
      instructions_md: "Code-first agent with minimal LLM usage for edge cases.",
    });

    expect(inferToolFolderPath(tool)).toBe("runtime/routing");
  });

  it("generates README docs for each folder in the materialized tree", () => {
    const catalog = catalogFromAgents([
      makeAgent({
        agent_id: "memory-retriever",
        name: "Memory Retriever",
        purpose: "Loads runtime memory context.",
        instructions_md: "Code-only agent. This agent does not use an LLM model.",
      }),
      makeAgent({
        agent_id: "agent-picker",
        name: "Agent Picker",
        purpose: "Routes tasks to the best specialist.",
        instructions_md: "Code-first agent with minimal LLM usage.",
      }),
    ]);

    const docs = buildFolderDocs(catalog);
    const folderPaths = docs.map((doc) => doc.folder_path);

    expect(folderPaths).toContain("");
    expect(folderPaths).toContain("runtime");
    expect(folderPaths).toContain("runtime/context");
    expect(folderPaths).toContain("runtime/routing");
  });
});
