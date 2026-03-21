import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarExplorerProvider } from "@/components/explorer/SidebarExplorer";
import { GlobalMemoryTab } from "@/components/setup/GlobalMemoryTab";

type KnowledgeFileRow = {
  id: string;
  file_path: string;
  file_id: string;
  title: string;
  domain: string;
  subdomain: string | null;
  word_count: number;
  is_valid: boolean;
  updated_at: string;
  summary: string | null;
  content: string;
  validation_errors: string[] | null;
};

const { fromMock, resetKnowledgeFiles, updateMock, deleteMock, confirmMock } = vi.hoisted(() => {
  const initialKnowledgeFiles: KnowledgeFileRow[] = [
    {
      id: "readme-root",
      file_path: "knowledge/README.md",
      file_id: "readme-root",
      title: "Knowledge Base - Root Index",
      domain: "readme",
      subdomain: "root",
      word_count: 10,
      is_valid: true,
      updated_at: "2026-03-13T09:00:00.000Z",
      summary: "Root knowledge index.",
      content: "# Knowledge Base",
      validation_errors: null,
    },
    {
      id: "readme-development",
      file_path: "knowledge/development/README.md",
      file_id: "readme-development",
      title: "Development - README",
      domain: "readme",
      subdomain: "development",
      word_count: 10,
      is_valid: true,
      updated_at: "2026-03-13T09:00:00.000Z",
      summary: "Development folder index.",
      content: "# Development",
      validation_errors: null,
    },
    {
      id: "knowledge-dev-instructions",
      file_path: "knowledge/development/instructions.md",
      file_id: "knowledge-dev-instructions",
      title: "Development Instructions",
      domain: "development",
      subdomain: "development",
      word_count: 20,
      is_valid: true,
      updated_at: "2026-03-13T09:00:00.000Z",
      summary: "Coding rules.",
      content: "# Development Instructions",
      validation_errors: null,
    },
    {
      id: "knowledge-dev-projects",
      file_path: "knowledge/development/projects.md",
      file_id: "knowledge-dev-projects",
      title: "Active Projects",
      domain: "development",
      subdomain: "development",
      word_count: 20,
      is_valid: true,
      updated_at: "2026-03-13T09:00:00.000Z",
      summary: "Project list.",
      content: "# Active Projects",
      validation_errors: null,
    },
  ];

  let knowledgeFiles = initialKnowledgeFiles.map((file) => ({ ...file }));

  const resetKnowledgeFiles = () => {
    knowledgeFiles = initialKnowledgeFiles.map((file) => ({ ...file }));
  };

  const selectMock = vi.fn(() => ({
    order: vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve({ data: knowledgeFiles.map((file) => ({ ...file })), error: null })),
    })),
  }));

  const updateMock = vi.fn((payload: Partial<KnowledgeFileRow>) => ({
    eq: vi.fn((column: string, value: string) => {
      if (column === "id") {
        knowledgeFiles = knowledgeFiles.map((file) => (file.id === value ? { ...file, ...payload } : file));
      }
      return Promise.resolve({ error: null });
    }),
  }));

  const deleteMock = vi.fn(() => ({
    eq: vi.fn((column: string, value: string) => {
      if (column === "id") {
        knowledgeFiles = knowledgeFiles.filter((file) => file.id !== value);
      }
      return Promise.resolve({ error: null });
    }),
  }));

  const fromMock = vi.fn((table: string) => {
    if (table === "knowledge_files") {
      return {
        select: selectMock,
        update: updateMock,
        delete: deleteMock,
      };
    }

    throw new Error(`Unexpected table requested in test: ${table}`);
  });

  const confirmMock = vi.fn(() => true);

  return { fromMock, resetKnowledgeFiles, updateMock, deleteMock, confirmMock };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

describe("GlobalMemoryTab", () => {
  beforeEach(() => {
    resetKnowledgeFiles();
    fromMock.mockClear();
    updateMock.mockClear();
    deleteMock.mockClear();
    confirmMock.mockClear();
    vi.stubGlobal("confirm", confirmMock);
  });

  it("opens a real README file instead of showing a duplicate synthetic README entry", async () => {
    render(
      <SidebarExplorerProvider>
        <GlobalMemoryTab />
      </SidebarExplorerProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /folder knowledge/i }));

    expect(await screen.findByRole("textbox", { name: /knowledge file title/i })).toHaveValue("Knowledge Base - Root Index");
    expect(screen.getByRole("button", { name: /file readme\.md/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /overview overview/i })).not.toBeInTheDocument();
  });

  it("lets the user edit and delete a README knowledge file", async () => {
    render(
      <SidebarExplorerProvider>
        <GlobalMemoryTab />
      </SidebarExplorerProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /folder knowledge/i }));

    const titleInput = await screen.findByRole("textbox", { name: /knowledge file title/i });
    fireEvent.change(titleInput, { target: { value: "Updated Root README" } });
    fireEvent.change(screen.getByRole("textbox", { name: /knowledge file content/i }), { target: { value: "# Updated Root README" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        title: "Updated Root README",
        summary: "Root knowledge index.",
        content: "# Updated Root README",
        word_count: 4,
      });
    });

    expect(await screen.findByRole("textbox", { name: /knowledge file title/i })).toHaveValue("Updated Root README");

    fireEvent.click(screen.getByRole("button", { name: /delete file/i }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalled();
      expect(deleteMock).toHaveBeenCalled();
    });

    expect(await screen.findByRole("button", { name: /overview overview/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /file readme\.md/i })).not.toBeInTheDocument();
  });
});
