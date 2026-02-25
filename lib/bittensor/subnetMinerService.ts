// services/subnetMinerService.ts
import { SubnetMetricsService, SubnetMetrics } from './subnetMetricsService';

export class SubnetMinerService {
  private metricsService: SubnetMetricsService;

  constructor() {
    this.metricsService = new SubnetMetricsService();
  }

  async getMinerStats(miner: any, wallet: any): Promise<any> {
    try {
      const metrics = await this.metricsService.getSubnetMetrics(wallet.hotkey, miner.subnetId);
      
      return {
        ...miner,
        status: metrics.status,
        earnings: metrics.earnings,
        hashrate: metrics.contributionScore, // Using contribution score as "hashrate"
        stake: metrics.stake,
        rank: metrics.rank,
        trust: metrics.trust,
        incentive: metrics.incentive,
        emissions: metrics.emissions,
        uid: metrics.uid,
        model: `Subnet ${miner.subnetId} (UID: ${metrics.uid})`
      };
    } catch (error) {
      console.error(`Error getting stats for miner ${miner.id}:`, error);
      return this.getDefaultMinerStats(miner);
    }
  }

  async getAllMinersStats(wallets: any[]): Promise<any[]> {
    const allMiners: any[] = [];
    
    for (const wallet of wallets) {
      for (const miner of wallet.miners) {
        try {
          const minerStats = await this.getMinerStats(miner, wallet);
          allMiners.push({
            ...minerStats,
            walletName: wallet.walletName,
            hotkey: wallet.hotkey
          });
        } catch (error) {
          console.error(`Error processing miner ${miner.id} for wallet ${wallet.walletName}:`, error);
        }
      }
    }
    
    return allMiners;
  }

  async getAggregatedStats(miners: any[]): Promise<any> {
    return this.metricsService.getAggregatedStats(miners);
  }

  private getDefaultMinerStats(miner: any): any {
    return {
      ...miner,
      status: 'stopped',
      earnings: '0 TAO',
      hashrate: '0 S',
      stake: '0 TAO',
      rank: 0,
      trust: 0,
      incentive: 0,
      emissions: 0,
      uid: 0,
      model: `Subnet ${miner.subnetId}`
    };
  }
}

export const subnetMinerService = new SubnetMinerService();
