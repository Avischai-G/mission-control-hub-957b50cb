export function buildTemplateAgentPurpose(name: string) {
  return `Template agent for ${name}. Replace this with the exact job before activating it.`;
}

export function buildAgentTemplate(name: string) {
  return `# ${name}

## Mission
- Describe the exact job this agent owns.
- Keep the scope narrow enough that the Agent Picker can choose it with confidence.

## Use This Agent When
- The request clearly matches this agent's capability tags.
- The task belongs to this agent and does not require broader orchestration.

## Do Not Use This Agent When
- Another agent already owns the task.
- The request needs tools or permissions this agent does not have.

## Inputs
- Task summary
- Relevant files or context
- Output requirements

## Output
- Return only the deliverable this agent is responsible for.
- Call out missing context or blocked steps explicitly.

## Working Rules
1. Stay inside this agent's job boundary.
2. Use only the context and tools assigned to this agent.
3. Prefer concise, structured outputs.
4. Fail clearly when context is missing.
`;
}

export function describeAgentFolder(folderName: string) {
  const normalized = folderName.trim().toLowerCase();

  if (normalized === "agents") {
    return "Top-level agent registry. Start here when you need to decide which branch should handle a task.";
  }

  if (normalized === "core") {
    return "Core runtime agents that coordinate the product and should be considered before specialists.";
  }

  if (normalized === "specialists") {
    return "Task-focused agents with narrow jobs. Pick from here when the task needs a distinct skill owner.";
  }

  if (normalized === "infrastructure") {
    return "Support agents that prepare context, routing, or system state rather than directly delivering user-facing work.";
  }

  return "Custom agent folder. Use it when the task clearly belongs to the agents grouped here.";
}

export function agentFolderPickerHint(folderName: string) {
  const normalized = folderName.trim().toLowerCase();

  if (normalized === "agents") {
    return "First decide whether the task belongs to core orchestration, a specialist, or infrastructure support.";
  }

  if (normalized === "core") {
    return "Pick a core agent only when the task affects routing, orchestration, or default user handling.";
  }

  if (normalized === "specialists") {
    return "Pick a specialist when the request maps cleanly to a single capability set and should stay isolated.";
  }

  if (normalized === "infrastructure") {
    return "Pick an infrastructure agent when the task is about selecting, loading, validating, or preparing context for another agent.";
  }

  return "Read the agent files in this folder and choose the one whose purpose and tags match the task most directly.";
}
