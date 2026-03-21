export type RuntimeToolDefinition = {
  name: string;
  label: string;
  description: string;
  sourcePath: string;
  sourceCode: string;
};

export const runtimeToolDefinitions: RuntimeToolDefinition[] = [
  {
    name: "web_search",
    label: "Web Search",
    description: "Search the web for current information.",
    sourcePath: "supabase/functions/chat/index.ts",
    sourceCode: `web_search: {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for current information",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
}`,
  },
  {
    name: "read_memory_file",
    label: "Read Memory File",
    description: "Read the full contents of a specific knowledge base file.",
    sourcePath: "supabase/functions/chat/index.ts",
    sourceCode: `read_memory_file: {
  type: "function",
  function: {
    name: "read_memory_file",
    description: "Read the full contents of a specific knowledge base file",
    parameters: {
      type: "object",
      properties: { file_id: { type: "string" } },
      required: ["file_id"],
    },
  },
}`,
  },
  {
    name: "list_user_context",
    label: "List User Context",
    description: "List the available context files in a folder.",
    sourcePath: "supabase/functions/chat/index.ts",
    sourceCode: `list_user_context: {
  type: "function",
  function: {
    name: "list_user_context",
    description: "List the available context files in a folder",
    parameters: {
      type: "object",
      properties: { folder: { type: "string" } },
      required: [],
    },
  },
}`,
  },
  {
    name: "get_recent_user_messages",
    label: "Get Recent User Messages",
    description: "Get the user's most recent messages to the secretary.",
    sourcePath: "supabase/functions/chat/index.ts",
    sourceCode: `get_recent_user_messages: {
  type: "function",
  function: {
    name: "get_recent_user_messages",
    description: "Get the user's most recent messages to the secretary for recent-history questions",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 10 },
        include_current: { type: "boolean" },
      },
      required: [],
    },
  },
}`,
  },
  {
    name: "get_recent_tasks",
    label: "Get Recent Tasks",
    description: "Get recent delegated tasks and their latest status.",
    sourcePath: "supabase/functions/chat/index.ts",
    sourceCode: `get_recent_tasks: {
  type: "function",
  function: {
    name: "get_recent_tasks",
    description: "Get the most recent delegated tasks and their latest status",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 10 },
        include_messages: { type: "boolean" },
      },
      required: [],
    },
  },
}`,
  },
  {
    name: "search_chat_history",
    label: "Search Chat History",
    description: "Search older chat history and memory summaries.",
    sourcePath: "supabase/functions/chat/index.ts",
    sourceCode: `search_chat_history: {
  type: "function",
  function: {
    name: "search_chat_history",
    description: "Search older chat history and memory summaries when the user refers to something beyond the recent messages",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["query"],
    },
  },
}`,
  },
  {
    name: "write_code",
    label: "Write Code",
    description: "Write or edit a codebase file through a local executor when available.",
    sourcePath: "supabase/functions/chat/index.ts",
    sourceCode: `write_code: {
  type: "function",
  function: {
      name: "write_code",
      description: "Write or edit a codebase file through a local executor when available",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        content: { type: "string" },
      },
      required: ["file_path", "content"],
    },
  },
}`,
  },
  {
    name: "run_terminal",
    label: "Run Terminal",
    description: "Execute a bash command through a local executor when available.",
    sourcePath: "supabase/functions/chat/index.ts",
    sourceCode: `run_terminal: {
  type: "function",
  function: {
      name: "run_terminal",
      description: "Execute a bash command through a local executor when available",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
}`,
  },
];

export const runtimeToolDefinitionsByName = Object.fromEntries(
  runtimeToolDefinitions.map((tool) => [tool.name, tool]),
) as Record<string, RuntimeToolDefinition>;
