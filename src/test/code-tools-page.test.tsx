import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarExplorerProvider } from "@/components/explorer/SidebarExplorer";
import CodeToolsPage from "@/pages/CodeToolsPage";

type QueryResult<T> = {
  data: T;
  error: null;
};

const { fromMock, updateMock, updateEqMock } = vi.hoisted(() => {
  function createQuery<T>(result: QueryResult<T>) {
    return {
      order: vi.fn().mockReturnThis(),
      then<TResult1 = QueryResult<T>, TResult2 = never>(
        onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    };
  }

  const agents = [
    {
      id: "1",
      agent_id: "memory-retriever",
      name: "Memory Retriever",
      role: "infrastructure",
      purpose: "Searches recent conversation memory chunks for the most relevant context snippets.",
      is_active: true,
      capability_tags: ["memory", "retrieval", "context", "internal-tool"],
      model: null,
      instructions_md: "You are the Memory Retriever. Code-only agent. This agent does not use an LLM model - it runs deterministic code operations only.",
    },
  ];

  const updateEqMock = vi.fn(() => Promise.resolve({ error: null }));
  const updateMock = vi.fn(() => ({
    eq: updateEqMock,
  }));

  const fromMock = vi.fn((table: string) => {
    if (table === "agents") {
      return {
        select: vi.fn(() => createQuery({ data: agents, error: null })),
        insert: vi.fn(() => Promise.resolve({ error: null })),
        update: updateMock,
      };
    }

    if (table === "code_tool_catalog" || table === "code_tool_folder_docs") {
      return {
        select: vi.fn(() => createQuery({ data: [], error: null })),
      };
    }

    if (table === "agent_policies") {
      return {
        select: vi.fn(() => Promise.resolve({ data: [{ agent_id: "memory-retriever", allowed_tools: ["search_recent_memory"] }], error: null })),
      };
    }

    throw new Error(`Unexpected table requested in test: ${table}`);
  });

  return { fromMock, updateMock, updateEqMock };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

describe("CodeToolsPage", () => {
  beforeEach(() => {
    fromMock.mockClear();
    updateMock.mockClear();
    updateEqMock.mockClear();
  });

  it("renders the generated README preview without crashing", async () => {
    render(
      <SidebarExplorerProvider>
        <CodeToolsPage />
      </SidebarExplorerProvider>,
    );

    expect(await screen.findByRole("button", { name: /^tools$/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /folder runtime/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /readme readme/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /tools readme/i })).toBeInTheDocument();
    expect(screen.getByText(/auto-generated guide for/i)).toBeInTheDocument();
    expect(screen.getByText(/picker guidance/i)).toBeInTheDocument();
  });

  it("lets the user edit and save the raw tool instructions", async () => {
    render(
      <SidebarExplorerProvider>
        <CodeToolsPage />
      </SidebarExplorerProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /folder runtime/i }));
    fireEvent.click(await screen.findByRole("button", { name: /folder context/i }));
    fireEvent.click(await screen.findByRole("button", { name: /tool memory retriever/i }));

    const editor = await screen.findByRole("textbox", { name: /raw tool instructions/i });
    expect(editor).toHaveValue(
      "You are the Memory Retriever. Code-only agent. This agent does not use an LLM model - it runs deterministic code operations only.",
    );

    fireEvent.change(editor, { target: { value: "Updated runtime instructions" } });
    fireEvent.click(screen.getByRole("button", { name: /save text/i }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ instructions_md: "Updated runtime instructions" });
      expect(updateEqMock).toHaveBeenCalledWith("id", "1");
    });
  });
});
