import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetPage } from "@/components/setup/BudgetPage";

type UsageLog = {
  provider: string;
  model_id: string;
  tokens_input: number;
  tokens_output: number;
  cost_estimate: number;
  created_at: string;
};

type Budget = {
  id: string;
  provider: string;
  budget_amount: number;
  period: string;
  created_at: string;
  updated_at: string;
};

const { fromMock, resetState, upsertMock } = vi.hoisted(() => {
  let usageLogs: UsageLog[] = [];
  let budgets: Budget[] = [];

  const resetState = (next?: { usage?: UsageLog[]; budgets?: Budget[] }) => {
    usageLogs = (next?.usage || []).map((entry) => ({ ...entry }));
    budgets = (next?.budgets || []).map((entry) => ({ ...entry }));
  };

  const upsertMock = vi.fn((payload: { provider: string; budget_amount: number; period: string }) => {
    const now = "2026-03-13T12:00:00.000Z";
    const existing = budgets.find((entry) => entry.provider === payload.provider);

    if (existing) {
      budgets = budgets.map((entry) =>
        entry.provider === payload.provider
          ? { ...entry, budget_amount: payload.budget_amount, period: payload.period, updated_at: now }
          : entry,
      );
    } else {
      budgets = [
        ...budgets,
        {
          id: `budget-${payload.provider}`,
          provider: payload.provider,
          budget_amount: payload.budget_amount,
          period: payload.period,
          created_at: now,
          updated_at: now,
        },
      ];
    }

    return Promise.resolve({ data: null, error: null });
  });

  const fromMock = vi.fn((table: string) => {
    if (table === "api_usage_logs") {
      return {
        select: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: usageLogs.map((entry) => ({ ...entry })), error: null })),
        })),
      };
    }

    if (table === "provider_budgets") {
      return {
        select: vi.fn(() => Promise.resolve({ data: budgets.map((entry) => ({ ...entry })), error: null })),
        upsert: upsertMock,
      };
    }

    throw new Error(`Unexpected table requested in test: ${table}`);
  });

  return { fromMock, resetState, upsertMock };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

describe("BudgetPage", () => {
  beforeEach(() => {
    resetState();
    fromMock.mockClear();
    upsertMock.mockClear();
  });

  it("shows all providers even before usage exists and allows creating a one-time provider limit", async () => {
    render(<BudgetPage />);

    expect(await screen.findByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText(/no usage data yet/i)).toBeInTheDocument();

    expect(screen.getByRole("combobox", { name: /openai limit period/i })).toHaveValue("one_time");

    const input = screen.getByRole("spinbutton", { name: /openai limit amount/i });
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /save openai limit/i }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledWith(
        {
          provider: "openai",
          budget_amount: 25,
          period: "one_time",
        },
        { onConflict: "provider" },
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("spinbutton", { name: /openai limit amount/i })).toHaveValue(25);
      expect(screen.getByRole("combobox", { name: /openai limit period/i })).toHaveValue("one_time");
    });
  });

  it("prefills an existing provider budget so it can be updated", async () => {
    resetState({
      budgets: [
        {
          id: "budget-openai",
          provider: "openai",
          budget_amount: 10,
          period: "monthly",
          created_at: "2026-03-13T09:00:00.000Z",
          updated_at: "2026-03-13T09:00:00.000Z",
        },
      ],
    });

    render(<BudgetPage />);

    expect(await screen.findByRole("combobox", { name: /openai limit period/i })).toHaveValue("monthly");

    const input = await screen.findByRole("spinbutton", { name: /openai limit amount/i });
    expect(input).toHaveValue(10);

    fireEvent.change(input, { target: { value: "15.5" } });
    fireEvent.click(screen.getByRole("button", { name: /save openai limit/i }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledWith(
        {
          provider: "openai",
          budget_amount: 15.5,
          period: "monthly",
        },
        { onConflict: "provider" },
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("spinbutton", { name: /openai limit amount/i })).toHaveValue(15.5);
    });
  });
});
