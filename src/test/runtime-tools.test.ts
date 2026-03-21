import { describe, expect, it } from "vitest";
import { runtimeToolDefinitionsByName } from "@/lib/runtime-tools";

describe("runtime tools", () => {
  it("includes the secretary history and task tools", () => {
    expect(runtimeToolDefinitionsByName.get_recent_user_messages).toBeDefined();
    expect(runtimeToolDefinitionsByName.get_recent_tasks).toBeDefined();
    expect(runtimeToolDefinitionsByName.search_chat_history).toBeDefined();
  });
});
