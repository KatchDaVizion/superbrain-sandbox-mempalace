/**
 * POOL CONFIGURATION - HARDCODED VALUES
 * 
 * ⚠️ WARNING: These values are compiled into the application binary.
 * Users CANNOT change these without recompiling the entire application.
 * 
 * This protects your 10% pool fee from being modified.
 */

// ==============================================
// POOL OWNER CONFIGURATION - DO NOT MODIFY
// ==============================================

/**
 * Your Bittensor wallet address for receiving the 10% pool fee.
 * This is hardcoded and cannot be changed by end users.
 */
export const POOL_OWNER_WALLET = '5DG2cauvnRgyvQtqxxHKweRZniPoQkHg56QcBRDrEzxZ6dwS' as const;

/**
 * Pool fee percentage (0.10 = 10%)
 * This is taken from emissions before distribution to users.
 */
export const POOL_FEE_PERCENT = 0.10 as const;

/**
 * Pool name displayed in the UI
 */
export const POOL_NAME = 'SB Network Mining Pool' as const;

/**
 * Pool website/info URL
 */
export const POOL_WEBSITE = 'https://superbrain.network' as const;

/**
 * Contact email for pool support
 */
export const POOL_CONTACT = 'support@superbrain.network' as const;

// ==============================================
// SUBNET CONFIGURATION
// ==============================================

/**
 * Bittensor subnet UID for TPN (Tao Private Network)
 */
export const SUBNET_UID = 65 as const;

/**
 * Network to connect to ('finney' for mainnet, 'test' for testnet)
 */
export const NETWORK = 'finney' as const;

/**
 * Known validators on Subnet 65 (for reference/verification)
 */
export const KNOWN_VALIDATORS = [
  { uid: 0, ip: '46.16.144.134' },
  { uid: 4, ip: '88.204.136.220' },
  { uid: 47, ip: '161.35.91.172' },
  { uid: 117, ip: '34.130.144.244' },
  { uid: 181, ip: '192.150.253.122' },
] as const;

// ==============================================
// BACKEND API CONFIGURATION
// ==============================================

/**
 * Pool backend API URL (auth, dashboard, hotkey verification)
 */
export const POOL_API_URL = 'https://superbrain.tail083cac.ts.net/api' as const;

/**
 * TPN Mining Pool Server URL — workers connect to this URL
 */
export const TPN_MINING_POOL_URL = 'https://superbrain.tail083cac.ts.net' as const;

// ==============================================
// PAYOUT CONFIGURATION
// ==============================================

/**
 * Minimum TAO required before payout is triggered
 */
export const MIN_PAYOUT_TAO = 0.001 as const;

/**
 * How earnings are distributed:
 * - EQUAL: 90% split equally among all users (regardless of hotkey count)
 * - PROPORTIONAL: 90% split based on each user's contribution
 */
export const DISTRIBUTION_MODEL = 'EQUAL' as const;

// ==============================================
// WORKER REQUIREMENTS
// ==============================================

export const WORKER_REQUIREMENTS = {
  minCPU: 2,
  minRAM: 2, // GB
  minDisk: 10, // GB
  dockerRequired: true,
  wireguardRequired: true,
  publicIPRequired: true,
} as const;

// ==============================================
// HELPER FUNCTION - Calculate distribution
// ==============================================

/**
 * Calculate how TAO is distributed
 * @param totalEmissions - Total TAO earned by the pool
 * @param userCount - Number of active users
 * @returns Distribution breakdown
 */
export function calculateDistribution(totalEmissions: number, userCount: number) {
  const ownerFee = totalEmissions * POOL_FEE_PERCENT;
  const userPool = totalEmissions - ownerFee;
  const perUser = userCount > 0 ? userPool / userCount : 0;
  
  return {
    totalEmissions,
    ownerFee,
    ownerWallet: POOL_OWNER_WALLET,
    userPool,
    userCount,
    perUser,
    feePercent: POOL_FEE_PERCENT * 100,
  };
}

// ==============================================
// EXPORT DEFAULT CONFIG OBJECT
// ==============================================

const poolConfig = {
  owner: {
    wallet: POOL_OWNER_WALLET,
    feePercent: POOL_FEE_PERCENT,
  },
  pool: {
    name: POOL_NAME,
    website: POOL_WEBSITE,
    contact: POOL_CONTACT,
    apiUrl: POOL_API_URL,
    tpnMiningPoolUrl: TPN_MINING_POOL_URL,
  },
  subnet: {
    uid: SUBNET_UID,
    network: NETWORK,
    validators: KNOWN_VALIDATORS,
  },
  payout: {
    minPayout: MIN_PAYOUT_TAO,
    distributionModel: DISTRIBUTION_MODEL,
  },
  worker: WORKER_REQUIREMENTS,
  calculateDistribution,
} as const;

export default poolConfig;
