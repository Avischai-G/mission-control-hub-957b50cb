import { callEdgeJson } from "@/lib/edge-functions";

export type VaultPermissionsSnapshot = {
  updated_at: string;
  agent_permissions: Record<string, string[]>;
};

export async function getVaultStatus() {
  return callEdgeJson<{ locked: boolean; path: string }>("vault-settings", {
    action: "status",
  });
}

export async function readVaultPermissions(password: string) {
  return callEdgeJson<{ snapshot: VaultPermissionsSnapshot }>("vault-settings", {
    action: "read_permissions",
    password,
  });
}

export async function writeVaultPermissions(password: string, agentPermissions: Record<string, string[]>) {
  return callEdgeJson<{ success: boolean; snapshot: VaultPermissionsSnapshot }>("vault-settings", {
    action: "write_permissions",
    password,
    agent_permissions: agentPermissions,
  });
}
