/**
 * Pool API Service - Connects SuperBrain to Subnet 65 Pool Backend
 * 
 * This service handles all communication with the pool backend server.
 * Change POOL_API_URL to your deployed backend URL.
 */

// ============================================
// CONFIGURATION
// ============================================
const POOL_API_URL = import.meta.env.VITE_POOL_API_URL || 'https://superbrain.tail083cac.ts.net/api';

export function isPoolConfigured(): boolean {
  return !!import.meta.env.VITE_POOL_API_URL;
}

// ============================================
// Types
// ============================================

export interface User {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Hotkey {
  id: number;
  hotkey_address: string;
  coldkey_address: string | null;
  is_verified: boolean;
  is_active_on_subnet: boolean;
  uid: number | null;
  stake: number;
  emission: number;
  incentive: number;
  trust: number;
  total_earned: number;
  unpaid_earnings: number;
  created_at: string;
  verified_at: string | null;
  last_indexed_at: string | null;
}

export interface ChallengeResponse {
  hotkey_id: number;
  hotkey_address: string;
  challenge: string;
  expires_at: string;
  message_to_sign: string;
}

export interface PoolStats {
  pool_name: string;
  subnet_uid: number;
  owner_fee_percent: number;
  total_users: number;
  total_hotkeys: number;
  active_hotkeys: number;
  total_earned_tao: number;
  total_paid_tao: number;
  pending_payouts_tao: number;
  total_stake_tao: number;
  last_indexed_at: string | null;
  last_index_block: number | null;
}

export interface UserDashboard {
  user_id: number;
  username: string;
  display_name: string | null;
  total_hotkeys: number;
  verified_hotkeys: number;
  active_hotkeys: number;
  total_earned: number;
  unpaid_balance: number;
  total_paid: number;
  daily_average: number;
  weekly_earnings: number;
  hotkeys: Hotkey[];
}

export interface PayoutHistory {
  id: number;
  amount_tao: number;
  destination_address: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface DistributionPreview {
  total_pending_tao: number;
  owner_fee_tao: number;
  owner_fee_percent: number;
  user_pool_tao: number;
  eligible_users: number;
  per_user_share_tao: number;
  distribution_model: string;
}

export interface PoolInfo {
  name: string;
  description: string;
  subnet_uid: number;
  network: string;
  owner_fee_percent: number;
  distribution_model: string;
  min_payout_tao: number;
  features: string[];
}

// ============================================
// Token Management
// ============================================

const TOKEN_KEY = 'sb_pool_auth_token';
const USER_KEY = 'sb_pool_user';

let authToken: string | null = null;
let currentUser: User | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem(TOKEN_KEY);
  }
  return authToken;
}

export function setCurrentUser(user: User | null): void {
  currentUser = user;
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

export function getCurrentUserFromStorage(): User | null {
  if (!currentUser) {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      try {
        currentUser = JSON.parse(stored);
      } catch {
        currentUser = null;
      }
    }
  }
  return currentUser;
}

export function clearAuth(): void {
  authToken = null;
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

// ============================================
// API Helper
// ============================================

class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${POOL_API_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new ApiError(errorData.detail || `API Error: ${response.status}`, response.status);
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error - is the pool server running?', 0);
  }
}

// ============================================
// Auth API
// ============================================

export async function register(
  username: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
  setAuthToken(response.access_token);
  setCurrentUser(response.user);
  return response;
}

export async function login(
  username: string,
  password: string
): Promise<AuthResponse> {
  // OAuth2 form data format
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);
  
  const response = await fetch(`${POOL_API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Login failed' }));
    throw new ApiError(error.detail || 'Login failed', response.status);
  }
  
  const data: AuthResponse = await response.json();
  setAuthToken(data.access_token);
  setCurrentUser(data.user);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } finally {
    clearAuth();
  }
}

export async function getCurrentUser(): Promise<User> {
  const user = await apiRequest<User>('/auth/me');
  setCurrentUser(user);
  return user;
}

export async function validateSession(): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;
  
  try {
    await getCurrentUser();
    return true;
  } catch {
    clearAuth();
    return false;
  }
}

// ============================================
// Pool API (Public - no auth required)
// ============================================

export async function getPoolStats(): Promise<PoolStats> {
  return apiRequest<PoolStats>('/pool/stats');
}

export async function getPoolInfo(): Promise<PoolInfo> {
  return apiRequest<PoolInfo>('/pool/info');
}

export async function getDistributionPreview(): Promise<DistributionPreview> {
  return apiRequest<DistributionPreview>('/pool/distribution-preview');
}

// ============================================
// User API (Requires authentication)
// ============================================

export async function getUserDashboard(): Promise<UserDashboard> {
  return apiRequest<UserDashboard>('/users/dashboard');
}

export async function getPayoutHistory(limit: number = 50): Promise<PayoutHistory[]> {
  return apiRequest<PayoutHistory[]>(`/users/payouts?limit=${limit}`);
}

export async function updateProfile(data: {
  display_name?: string;
  email?: string;
}): Promise<{ message: string }> {
  return apiRequest('/users/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ============================================
// Hotkey API (Requires authentication)
// ============================================

export async function listHotkeys(): Promise<Hotkey[]> {
  return apiRequest<Hotkey[]>('/hotkeys/');
}

export async function registerHotkey(
  hotkeyAddress: string,
  coldkeyAddress?: string
): Promise<ChallengeResponse> {
  return apiRequest<ChallengeResponse>('/hotkeys/register', {
    method: 'POST',
    body: JSON.stringify({
      hotkey_address: hotkeyAddress,
      coldkey_address: coldkeyAddress || null,
    }),
  });
}

export async function verifyHotkey(
  hotkeyId: number,
  signature: string
): Promise<Hotkey> {
  return apiRequest<Hotkey>('/hotkeys/verify', {
    method: 'POST',
    body: JSON.stringify({
      hotkey_id: hotkeyId,
      signature: signature,
    }),
  });
}

export async function getHotkey(hotkeyId: number): Promise<Hotkey> {
  return apiRequest<Hotkey>(`/hotkeys/${hotkeyId}`);
}

export async function deleteHotkey(hotkeyId: number): Promise<{ message: string }> {
  return apiRequest(`/hotkeys/${hotkeyId}`, { method: 'DELETE' });
}

export async function refreshChallenge(hotkeyId: number): Promise<ChallengeResponse> {
  return apiRequest<ChallengeResponse>(`/hotkeys/${hotkeyId}/refresh-challenge`);
}

// ============================================
// Health Check
// ============================================

export async function checkPoolHealth(): Promise<{ status: string; timestamp: string; version: string }> {
  const baseUrl = POOL_API_URL.replace('/api', '');
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    throw new Error('Pool server not responding');
  }
  return response.json();
}

// ============================================
// Export API object for convenience
// ============================================

const poolAPI = {
  // Config
  POOL_API_URL,
  
  // Auth
  register,
  login,
  logout,
  getCurrentUser,
  validateSession,
  isAuthenticated,
  setAuthToken,
  getAuthToken,
  clearAuth,
  getCurrentUserFromStorage,
  
  // Pool (public)
  getPoolStats,
  getPoolInfo,
  getDistributionPreview,
  checkPoolHealth,
  
  // User (authenticated)
  getUserDashboard,
  getPayoutHistory,
  updateProfile,
  
  // Hotkeys (authenticated)
  listHotkeys,
  registerHotkey,
  verifyHotkey,
  getHotkey,
  deleteHotkey,
  refreshChallenge,
};

export default poolAPI;
