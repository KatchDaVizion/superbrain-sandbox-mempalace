import { execFileSync } from "child_process";
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import * as path from 'path';
import { app } from 'electron';
import { getConfigPath } from "./config";
import { BtcliPathResult, getBtcliPathSafe } from "./btcliPath";
import Logger from "./logger";
import { buildBtcliCommand } from "./btcliCommandGenerator";
// --------------------
// Types
// --------------------
interface Neuron {
  uid: number;
  active: boolean;
  stake: number;
  emission: number;
}

interface Subnet {
  netuid: number;
  name: string;
  neurons: Neuron[];
}

export interface WalletOverviewResponse {
  wallet: string;
  network: string;
  subnets: Subnet[];
  total_balance: number;
}

interface WalletSnapshot {
  timestamp: number;
  data: WalletOverviewResponse;
}

export interface MinerStats {
  subnetId: number;
  earnings: number;
  stakes: number;
  status?: 'registering' | 'registered' | 'failed' | 'deregistered';
  active?: boolean;
}

export interface WalletStats {
  totalEarnings: number;
  totalStakes: number;
  activeMiners: number;
  miners: MinerStats[];
}

export interface SubnetEarnings {
  netuid: number;
  name: string;
  active: boolean;
  totalEmissions: number;
  lastEmission: number;
  stake: number;
  uid: number;
}

export class WalletStatsService {
  private mainLogger: Logger;
  constructor() {
    this.mainLogger = new Logger('WalletStatsService');
  }

  getWalletOverviewSnapshot(walletName): WalletOverviewResponse {
    let output;
    const logger = this.mainLogger.createChild('getWalletOverviewSnapshot ');
    const btcliPath = getBtcliPathSafe();
    const command: BtcliPathResult = btcliPath;
    if (!command.success) {
      logger.log(`fatal: no point of hydrating miners, as we couldn't find the btcli`);
      logger.error(command.error);
      throw new Error('no btcli found');
    }

    try {
      const { command, args } = buildBtcliCommand(btcliPath, ["wallet", "overview", "--wallet.name", walletName,  "--wallet-path", btcliPath.walletsDir, "--json-out"]);
      // output = execSync(
      //   `${command.path} wallet overview --wallet.name ${walletName} --wallet-path "${walletsDir}" --json-out`,
      //   { encoding: "utf-8" }
      // );
      output = execFileSync(
        command,
        args,
        { encoding: "utf-8" }
      );
      output = JSON.parse(output);
      return output
    } catch (error) {
      logger.log(`wrong with the output for '${btcliPath} wallet overview --wallet.name ${walletName} --json-out'`);
      logger.error(error);
      throw error;
    }
  }

  saveSnapshot(walletName: string, data: WalletOverviewResponse) {
    const logger = this.mainLogger.createChild('saveSnapshot');
    const snapshotsDir = path.join(getConfigPath(), "snapshots");

    // Ensure the snapshots directory exists
    if (!existsSync(snapshotsDir)) {
      mkdirSync(snapshotsDir, { recursive: true }); // recursive: true creates parent directories if needed
    }
    const timestamp = Date.now();
    const filename = path.join(snapshotsDir, `${walletName}_${timestamp}.json`);

    writeFileSync(filename, JSON.stringify(data, null, 2), "utf-8");
    logger.log(`✅ Snapshot saved for wallet ${walletName} to ${filename}`);
  }

  loadSnapshots(walletName: string): WalletSnapshot[] {
    if (!existsSync("snapshots")) return [];
    const files = readdirSync("snapshots").filter(f => f.startsWith(walletName));
    return files.map(file => {
      const content = readFileSync(path.join("snapshots", file), "utf-8");
      return {
        timestamp: parseInt(file.split("_")[1].split(".")[0]),
        data: JSON.parse(content) as WalletOverviewResponse
      };
    });
  }

  calculateWalletStats(snapshots: WalletSnapshot[]): WalletStats {
    const miners: MinerStats[] = [];
    let totalEarnings = 0;
    let totalStake = 0;
    let activeCount = 0;

    for (const snap of snapshots) {
      for (const subnet of snap.data.subnets) {
        for (const neuron of subnet.neurons) {
          const earnings = neuron.emission; // emission is already in TAO units
          const stakes = neuron.stake;

          miners.push({
            subnetId: subnet.netuid,
            earnings,
            stakes,
          });

          totalEarnings += earnings;
          totalStake += stakes;
          if (neuron.active) activeCount++;
        }
      }
    }

    return {
      totalEarnings: totalEarnings,
      totalStakes: totalStake,
      activeMiners: activeCount,
      miners,
    };
  }

  aggregateWalletEarnings(snapshots: WalletSnapshot[]): SubnetEarnings[] {
    const earnings: Record<number, SubnetEarnings> = {};

    for (const snap of snapshots) {
      for (const subnet of snap.data.subnets) {
        for (const neuron of subnet.neurons) {
          if (!earnings[subnet.netuid]) {
            earnings[subnet.netuid] = {
              netuid: subnet.netuid,
              name: subnet.name,
              active: neuron.active,
              totalEmissions: 0,
              lastEmission: neuron.emission,
              stake: neuron.stake,
              uid: neuron.uid
            };
          }

          // Add emission for this snapshot
          earnings[subnet.netuid].totalEmissions += neuron.emission;
          earnings[subnet.netuid].lastEmission = neuron.emission;
          earnings[subnet.netuid].active = neuron.active;
          earnings[subnet.netuid].stake = neuron.stake;
        }
      }
    }

    return Object.values(earnings);
  }
}
