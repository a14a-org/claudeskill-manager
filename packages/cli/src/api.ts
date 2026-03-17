/**
 * API client for Claude Skill Sync server
 */

import { loadConfig } from "./config.js";
import { loadCredentials, saveCredentials } from "./credentials.js";

const DEFAULT_SERVER_URL = "https://api.claudeskill.io";

type ApiResponse<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
  error: string;
  status: number;
};

/**
 * Get the server URL from config
 */
const getServerUrl = async () => {
  const config = await loadConfig();
  return config?.serverUrl ?? DEFAULT_SERVER_URL;
};

/**
 * Make an authenticated API request
 */
const apiRequest = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const serverUrl = await getServerUrl();
  const credentials = await loadCredentials();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (credentials?.accessToken) {
    headers["Authorization"] = `Bearer ${credentials.accessToken}`;
  }

  try {
    const response = await fetch(`${serverUrl}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      // Try to refresh token if unauthorized
      if (response.status === 401 && credentials?.refreshToken) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          // Retry with new token
          return apiRequest(path, options);
        }
      }

      return {
        ok: false,
        error: (data as { error?: string }).error ?? "Request failed",
        status: response.status,
      };
    }

    return { ok: true, data: data as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
      status: 0,
    };
  }
};

/**
 * Refresh the access token using refresh token
 */
const refreshAccessToken = async () => {
  const credentials = await loadCredentials();
  if (!credentials?.refreshToken) return false;

  const serverUrl = await getServerUrl();

  try {
    const response = await fetch(`${serverUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: credentials.refreshToken }),
    });

    if (!response.ok) return false;

    const data = await response.json() as { accessToken: string };

    await saveCredentials({
      ...credentials,
      accessToken: data.accessToken,
    });

    return true;
  } catch {
    return false;
  }
};

// =============================================================================
// Auth API
// =============================================================================

export type OtpRequestResponse = {
  success: boolean;
  message: string;
};

export const requestOtp = async (email: string): Promise<ApiResponse<OtpRequestResponse>> => {
  const serverUrl = await getServerUrl();

  try {
    const response = await fetch(`${serverUrl}/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, error: (data as { error?: string }).error ?? "Failed to send OTP", status: response.status };
    }

    return { ok: true, data: data as OtpRequestResponse };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error", status: 0 };
  }
};

export type OtpVerifyResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    isNewUser: boolean;
  };
};

export const verifyOtp = async (
  email: string,
  code: string
): Promise<ApiResponse<OtpVerifyResponse>> => {
  const serverUrl = await getServerUrl();

  try {
    const response = await fetch(`${serverUrl}/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, error: (data as { error?: string }).error ?? "Invalid code", status: response.status };
    }

    return { ok: true, data: data as OtpVerifyResponse };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error", status: 0 };
  }
};

export const logout = async (): Promise<ApiResponse<{ success: boolean }>> => {
  const credentials = await loadCredentials();

  return apiRequest("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken: credentials?.refreshToken }),
  });
};

// =============================================================================
// Account API
// =============================================================================

export type AccountResponse = {
  id: string;
  email: string;
  hasSalt: boolean;
  hasRecoveryBlob: boolean;
  blobCount: number;
  createdAt: string;
};

export const getAccount = async (): Promise<ApiResponse<AccountResponse>> => {
  return apiRequest("/account");
};

export type SaltResponse = {
  salt: string;
};

export const getSalt = async (): Promise<ApiResponse<SaltResponse>> => {
  return apiRequest("/account/salt");
};

export const setSalt = async (salt: string): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest("/account/salt", {
    method: "PUT",
    body: JSON.stringify({ salt }),
  });
};

export type RecoveryResponse = {
  recoveryBlob: string;
};

export const getRecoveryBlob = async (): Promise<ApiResponse<RecoveryResponse>> => {
  return apiRequest("/account/recovery");
};

export const setRecoveryBlob = async (
  recoveryBlob: string
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest("/account/recovery", {
    method: "PUT",
    body: JSON.stringify({ recoveryBlob }),
  });
};

export type MasterKeyResponse = {
  encryptedMasterKey: string;
  salt: string | null;
};

export const getMasterKey = async (): Promise<ApiResponse<MasterKeyResponse>> => {
  return apiRequest("/account/master-key");
};

export const setMasterKey = async (
  encryptedMasterKey: string
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest("/account/master-key", {
    method: "PUT",
    body: JSON.stringify({ encryptedMasterKey }),
  });
};

export type SharingKeyResponse = {
  hasKeypair: boolean;
  publicKey?: string;
  publicKeyFingerprint?: string | null;
  encryptedPrivateKey?: string;
  privateKeyIv?: string;
  privateKeyTag?: string;
};

export const getSharingKey = async (): Promise<ApiResponse<SharingKeyResponse>> => {
  return apiRequest("/account/sharing-key");
};

export const setSharingKey = async (
  publicKey: string,
  encryptedPrivateKey: string,
  privateKeyIv: string,
  privateKeyTag: string
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest("/account/sharing-key", {
    method: "PUT",
    body: JSON.stringify({ publicKey, encryptedPrivateKey, privateKeyIv, privateKeyTag }),
  });
};

// =============================================================================
// Blobs API
// =============================================================================

export type BlobListItem = {
  id: string;
  updatedAt: string;
};

export type BlobListResponse = {
  blobs: BlobListItem[];
};

export const listBlobs = async (): Promise<ApiResponse<BlobListResponse>> => {
  return apiRequest("/blobs");
};

export type BlobResponse = {
  id: string;
  encryptedData: string;
  iv: string;
  tag: string;
  updatedAt: string;
};

export const getBlob = async (id: string): Promise<ApiResponse<BlobResponse>> => {
  return apiRequest(`/blobs/${id}`);
};

export type BlobCreateResponse = {
  id: string;
  updatedAt: string;
};

export const createBlob = async (
  encryptedData: string,
  iv: string,
  tag: string
): Promise<ApiResponse<BlobCreateResponse>> => {
  return apiRequest("/blobs", {
    method: "POST",
    body: JSON.stringify({ encryptedData, iv, tag }),
  });
};

export const updateBlob = async (
  id: string,
  encryptedData: string,
  iv: string,
  tag: string
): Promise<ApiResponse<BlobCreateResponse>> => {
  return apiRequest(`/blobs/${id}`, {
    method: "PUT",
    body: JSON.stringify({ encryptedData, iv, tag }),
  });
};

export const deleteBlob = async (id: string): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest(`/blobs/${id}`, {
    method: "DELETE",
  });
};

// =============================================================================
// Skills API (versioned)
// =============================================================================

export type SkillListItem = {
  id: string;
  skillKey: string;
  currentHash: string | null;
  updatedAt: string;
};

export type SkillListResponse = {
  skills: SkillListItem[];
};

export const listSkills = async (): Promise<ApiResponse<SkillListResponse>> => {
  return apiRequest("/skills");
};

export type SkillVersionInfo = {
  hash: string;
  parentHash: string | null;
  message: string | null;
  createdAt: string;
};

export type SkillVersionsResponse = {
  skillKey: string;
  currentHash: string | null;
  versions: SkillVersionInfo[];
};

export const getSkillVersions = async (
  skillKey: string
): Promise<ApiResponse<SkillVersionsResponse>> => {
  return apiRequest(`/skills/${encodeURIComponent(skillKey)}/versions`);
};

export type SkillVersionResponse = {
  skillKey: string;
  hash: string;
  encryptedData: string;
  iv: string;
  tag: string;
  parentHash: string | null;
  message: string | null;
  createdAt: string;
};

export const getSkillVersion = async (
  skillKey: string,
  hash: string
): Promise<ApiResponse<SkillVersionResponse>> => {
  return apiRequest(`/skills/${encodeURIComponent(skillKey)}/versions/${hash}`);
};

export type SkillResponse = {
  skillKey: string;
  skillId: string;
  hash: string;
  encryptedData: string;
  iv: string;
  tag: string;
  parentHash: string | null;
  message: string | null;
  createdAt: string;
};

export const getSkill = async (skillKey: string): Promise<ApiResponse<SkillResponse>> => {
  return apiRequest(`/skills/${encodeURIComponent(skillKey)}`);
};

export type PushVersionResponse = {
  skillId: string;
  hash: string;
  parentHash: string | null;
  createdAt: string;
};

export const pushSkillVersion = async (
  skillKey: string,
  hash: string,
  encryptedData: string,
  iv: string,
  tag: string,
  message: string | undefined
): Promise<ApiResponse<PushVersionResponse>> => {
  return apiRequest(`/skills/${encodeURIComponent(skillKey)}/versions`, {
    method: "POST",
    body: JSON.stringify({ hash, encryptedData, iv, tag, message }),
  });
};

export const deleteSkill = async (skillKey: string): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest(`/skills/${encodeURIComponent(skillKey)}`, {
    method: "DELETE",
  });
};

// =============================================================================
// Health check
// =============================================================================

export type HealthResponse = {
  name: string;
  version: string;
  status: string;
};

export const checkHealth = async (): Promise<ApiResponse<HealthResponse>> => {
  const serverUrl = await getServerUrl();

  try {
    const response = await fetch(serverUrl);
    const data = await response.json();

    if (!response.ok) {
      return { ok: false, error: "Server unhealthy", status: response.status };
    }

    return { ok: true, data: data as HealthResponse };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error", status: 0 };
  }
};

// =============================================================================
// Teams API
// =============================================================================

export type TeamListItem = {
  id: string;
  name: string;
  role: string;
  status: string;
  memberCount: number;
  skillCount: number;
  activeKeyVersion: number;
  createdAt: string;
};

export type TeamListResponse = {
  teams: TeamListItem[];
};

export const listTeams = async (): Promise<ApiResponse<TeamListResponse>> => {
  return apiRequest("/teams");
};

export type TeamCreateResponse = {
  id: string;
  name: string;
  role: string;
  status: string;
  activeKeyVersion?: number;
  createdAt: string;
};

export const createTeam = async (name: string): Promise<ApiResponse<TeamCreateResponse>> => {
  return apiRequest("/teams", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
};

export type TeamMemberItem = {
  userId: string;
  email: string;
  role: string;
  status: string;
  hasTeamKey: boolean;
  publicKey?: string | null;
  publicKeyFingerprint?: string | null;
  createdAt: string;
};

export type TeamSkillItem = {
  id: string;
  skillKey: string;
  currentHash: string | null;
  updatedAt: string;
};

export type TeamDetailResponse = {
  id: string;
  name: string;
  role: string;
  status: string;
  members: TeamMemberItem[];
  skills: TeamSkillItem[];
  activeKeyVersion?: number;
  createdAt: string;
};

export const getTeam = async (teamId: string): Promise<ApiResponse<TeamDetailResponse>> => {
  return apiRequest(`/teams/${teamId}`);
};

export const updateTeam = async (
  teamId: string,
  name: string
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest(`/teams/${teamId}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
};

export const deleteTeam = async (teamId: string): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest(`/teams/${teamId}`, {
    method: "DELETE",
  });
};

// Team Members
export type TeamMembersResponse = {
  members: TeamMemberItem[];
};

export const listTeamMembers = async (
  teamId: string
): Promise<ApiResponse<TeamMembersResponse>> => {
  return apiRequest(`/teams/${teamId}/members`);
};

export const updateTeamMemberRole = async (
  teamId: string,
  userId: string,
  role: string
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest(`/teams/${teamId}/members/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
};

export const removeTeamMember = async (
  teamId: string,
  userId: string,
  nextTeamKeyVersion: number,
  envelopes: Array<{
    recipientUserId: string;
    encryptedTeamKey: string;
    iv: string;
    tag: string;
    ephemeralPublicKey: string;
  }>
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest(`/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
    body: JSON.stringify({ nextTeamKeyVersion, envelopes }),
  });
};

export type PendingMemberItem = {
  userId: string;
  email: string;
  role: string;
  publicKey: string | null;
  publicKeyFingerprint: string | null;
  createdAt: string;
};

export type PendingMembersResponse = {
  pendingMembers: PendingMemberItem[];
};

export const listPendingMembers = async (
  teamId: string
): Promise<ApiResponse<PendingMembersResponse>> => {
  return apiRequest(`/teams/${teamId}/members/pending`);
};

export type AllPendingMemberItem = PendingMemberItem & {
  teamId: string;
  teamName: string;
};

export type AllPendingMembersResponse = {
  pendingMembers: AllPendingMemberItem[];
};

export const listAllPendingMembers = async (): Promise<ApiResponse<AllPendingMembersResponse>> => {
  return apiRequest("/teams/pending-members");
};

export const distributeTeamKey = async (
  teamId: string,
  userId: string,
  encryptedTeamKey: string,
  iv: string,
  tag: string,
  ephemeralPublicKey: string,
  teamKeyVersion?: number
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest(`/teams/${teamId}/members/${userId}/key`, {
    method: "POST",
    body: JSON.stringify({
      encryptedTeamKey,
      iv,
      tag,
      ephemeralPublicKey,
      teamKeyVersion,
    }),
  });
};

export type MyTeamKeyResponse = {
  encryptedTeamKey: string;
  iv: string;
  tag: string;
  ephemeralPublicKey: string;
  teamKeyVersion: number;
  status: string;
};

export const getMyTeamKey = async (teamId: string): Promise<ApiResponse<MyTeamKeyResponse>> => {
  return apiRequest(`/teams/${teamId}/my-key`);
};

// Team Invites
export type TeamInviteItem = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

export type TeamInvitesResponse = {
  invites: TeamInviteItem[];
};

export const listTeamInvites = async (
  teamId: string
): Promise<ApiResponse<TeamInvitesResponse>> => {
  return apiRequest(`/teams/${teamId}/invites`);
};

export type CreateInviteResponse = {
  id: string;
  token: string;
  email: string;
  role: string;
  expiresAt: string;
};

export const createTeamInvite = async (
  teamId: string,
  email: string,
  role: string
): Promise<ApiResponse<CreateInviteResponse>> => {
  return apiRequest(`/teams/${teamId}/invites`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
};

export const deleteTeamInvite = async (
  teamId: string,
  inviteId: string
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest(`/teams/${teamId}/invites/${inviteId}`, {
    method: "DELETE",
  });
};

export type AcceptInviteResponse = {
  teamId: string;
  teamName: string;
  role: string;
  status: string;
  message: string;
};

export const acceptTeamInvite = async (
  token: string
): Promise<ApiResponse<AcceptInviteResponse>> => {
  return apiRequest("/teams/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
};

export type PendingInviteItem = {
  id: string;
  teamId: string;
  teamName: string;
  role: string;
  expiresAt: string;
  createdAt: string;
};

export type PendingInvitesResponse = {
  invites: PendingInviteItem[];
};

export const listMyPendingInvites = async (): Promise<ApiResponse<PendingInvitesResponse>> => {
  return apiRequest("/teams/invites/pending");
};

// User Keypair
export type KeypairResponse = {
  hasKeypair: boolean;
  publicKey?: string;
  publicKeyFingerprint?: string | null;
  encryptedPrivateKey?: string;
  privateKeyIv?: string;
  privateKeyTag?: string;
};

export const getKeypair = async (): Promise<ApiResponse<KeypairResponse>> => {
  return apiRequest("/teams/keypair");
};

export const setKeypair = async (
  publicKey: string,
  encryptedPrivateKey: string,
  privateKeyIv: string,
  privateKeyTag: string
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest("/teams/keypair", {
    method: "PUT",
    body: JSON.stringify({ publicKey, encryptedPrivateKey, privateKeyIv, privateKeyTag }),
  });
};

// Team Skills
export type TeamSkillListResponse = {
  skills: TeamSkillItem[];
};

export const listTeamSkills = async (
  teamId: string
): Promise<ApiResponse<TeamSkillListResponse>> => {
  return apiRequest(`/teams/${teamId}/skills`);
};

export type TeamSkillResponse = {
  skillKey: string;
  skillId: string;
  hash: string;
  encryptedData: string;
  iv: string;
  tag: string;
  teamKeyVersion: number;
  parentHash: string | null;
  message: string | null;
  createdAt: string;
};

export const getTeamSkill = async (
  teamId: string,
  skillKey: string
): Promise<ApiResponse<TeamSkillResponse>> => {
  return apiRequest(`/teams/${teamId}/skills/${encodeURIComponent(skillKey)}`);
};

export type TeamSkillVersionInfo = {
  hash: string;
  teamKeyVersion: number;
  parentHash: string | null;
  message: string | null;
  createdAt: string;
};

export type TeamSkillVersionsResponse = {
  skillKey: string;
  currentHash: string | null;
  versions: TeamSkillVersionInfo[];
};

export const getTeamSkillVersions = async (
  teamId: string,
  skillKey: string
): Promise<ApiResponse<TeamSkillVersionsResponse>> => {
  return apiRequest(`/teams/${teamId}/skills/${encodeURIComponent(skillKey)}/versions`);
};

export type PushTeamSkillResponse = {
  skillId: string;
  hash: string;
  teamKeyVersion: number;
  parentHash: string | null;
  createdAt: string;
};

export const pushTeamSkillVersion = async (
  teamId: string,
  skillKey: string,
  hash: string,
  encryptedData: string,
  iv: string,
  tag: string,
  teamKeyVersion: number,
  message: string | undefined
): Promise<ApiResponse<PushTeamSkillResponse>> => {
  return apiRequest(`/teams/${teamId}/skills/${encodeURIComponent(skillKey)}/versions`, {
    method: "POST",
    body: JSON.stringify({ hash, encryptedData, iv, tag, teamKeyVersion, message }),
  });
};

export const getTeamSkillVersion = async (
  teamId: string,
  skillKey: string,
  hash: string
): Promise<ApiResponse<TeamSkillResponse>> => {
  return apiRequest(
    `/teams/${teamId}/skills/${encodeURIComponent(skillKey)}/versions/${encodeURIComponent(hash)}`
  );
};

export const deleteTeamSkill = async (
  teamId: string,
  skillKey: string
): Promise<ApiResponse<{ success: boolean }>> => {
  return apiRequest(`/teams/${teamId}/skills/${encodeURIComponent(skillKey)}`, {
    method: "DELETE",
  });
};
