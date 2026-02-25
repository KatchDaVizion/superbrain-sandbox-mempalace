export interface WalletConfig {
    walletName: string;
    hotkey: string;
    miners: Miner[];
}

export interface BtcliConfig {
    os: string;
    distro: string | undefined | null;
    wslPath: string | undefined | null;
    btcliPath: string | undefined | null;
    walletsDir: string | undefined | null;
}

export interface Miner {
    subnetId: number;
    status: 'registering' | 'registered' | 'failed' | 'deregistered';
    active: boolean;
    model: string | undefined | null
    // Add any other miner-specific attributes here
}

export interface TaoMiner {
    id: string;
    subnetId: string;
    // other miner properties
}

export interface WalletSecrets extends WalletConfig {
    coldMnemonic?: string;
    hotkeyMnemonic?: string;
}

// Type definitions
export interface Subnet {
    name: string;
    netuid: number;
    description: string;
    configurations: any;
    critical_dependencies: any;
    requirements_summary: string;
}
