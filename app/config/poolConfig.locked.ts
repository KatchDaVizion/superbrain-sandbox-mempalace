/**
 * LOCKED POOL CONFIGURATION
 *
 * These values are compiled into the binary and cannot be changed by end users.
 * They define the pool identity, fee structure, and connection endpoints.
 */

export const LOCKED_POOL_CONFIG = {
  // Pool identity
  POOL_NAME: 'SB Network Mining Pool',
  SUBNET_UID: 65,
  NETWORK: 'finney',

  // Pool owner receives this fee from all emissions
  POOL_FEE_PERCENT: 10,
  OWNER_WALLET: '5DG2cauvnRgyvQtqxxHKweRZniPoQkHg56QcBRDrEzxZ6dwS',

  // Pool backend API (for user auth, hotkey registration, dashboard)
  POOL_API_URL: 'https://superbrain.tail083cac.ts.net/api',

  // TPN mining pool server — workers connect to this URL
  POOL_SERVER_URL: 'https://superbrain.tail083cac.ts.net',
  BACKUP_POOL_URL: 'https://superbrain.tail083cac.ts.net',

  // Known validators on Subnet 65
  VALIDATORS: [
    { uid: 0, ip: '46.16.144.134' },
    { uid: 4, ip: '88.204.136.220' },
    { uid: 47, ip: '161.35.91.172' },
    { uid: 117, ip: '34.130.144.244' },
    { uid: 181, ip: '192.150.253.122' },
  ],

  // Payout config
  MIN_PAYOUT_TAO: 0.001,
  DISTRIBUTION_MODEL: 'EQUAL' as const,

  // Worker requirements
  WORKER_REQUIREMENTS: {
    minCPU: 2,
    minRAM: 2,
    minDisk: 10,
    dockerRequired: true,
    wireguardRequired: true,
    publicIPRequired: true,
  },

  // Branding
  BRAND: {
    name: 'SuperBrain Mining',
    tagline: 'Earn TAO by sharing your bandwidth',
    website: 'https://superbrain.network',
    contact: 'support@superbrain.network',
  },
} as const;

export default LOCKED_POOL_CONFIG;
