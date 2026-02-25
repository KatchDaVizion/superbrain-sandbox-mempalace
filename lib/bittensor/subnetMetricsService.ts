// services/subnetMetricsService.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { writeFileSync } from 'fs';

const execAsync = promisify(exec);

export interface SubnetMetrics {
  status: 'running' | 'stopped' | 'error';
  earnings: string; // TAO earnings
  contributionScore: string; // Equivalent to "hashrate" in Bittensor
  stake: string; // TAO staked
  rank: number; // Rank in subnet
  trust: number; // Trust score
  incentive: number; // Incentive score
  emissions: number; // Daily emissions
  uid: number; // UID in subnet
}

export class SubnetMetricsService {
  private readonly TAO_TO_RAO = 1000000000;

  // Get metrics from btcli command with JSON output
  async getSubnetMetrics(hotkey: string, subnetId: string): Promise<SubnetMetrics> {
    try {
      const metagraph = await this.getMetagraphData(subnetId);
      const neuron = metagraph.uids.find((n: any) => n.hotkey === hotkey);
      
      if (!neuron) {
        return this.getDefaultMetrics();
      }

      // Calculate contribution score based on actual metrics
      const contributionScore = this.calculateContributionScore(neuron);
      
      return {
        status: 'running', // Based on your process monitoring
        earnings: this.formatTAO(neuron.emissions || 0),
        contributionScore,
        stake: this.formatTAO(neuron.tao_stake || 0),
        rank: this.calculateRank(neuron, metagraph.uids),
        trust: neuron.trust || 0,
        incentive: neuron.incentive || 0,
        emissions: neuron.emissions || 0,
        uid: neuron.uid
      };
    } catch (error) {
      console.error('Error getting subnet metrics:', error);
      return this.getDefaultMetrics();
    }
  }

  // Get metagraph data with proper JSON parsing
  private async getMetagraphData(subnetId: string): Promise<any> {
    try {
      const { stdout } = await execAsync(
        `btcli subnet metagraph --netuid ${subnetId} --no_prompt --json-out`
      );

      const cleaned = stdout.trim().replace(/[\x00-\x1F\x7F]/g, "");
      writeFileSync("metagraph.json", stdout.trim(), "utf8");
    //   console.log(`cleaned stats output`, cleaned)
      // Parse the JSON output directly
      const metagraph = JSON.parse(cleaned);
    //   console.log(metagraph)
      return metagraph;
    } catch (error) {
      console.error('Error getting metagraph data:', error);
      throw new Error('Failed to fetch metagraph data');
    }
  }

  // Calculate contribution score based on real Bittensor metrics
  private calculateContributionScore(neuron: any): string {
    // Use a combination of stake, incentive, and trust to calculate contribution
    const stakeWeight = neuron.tao_stake || 0;
    const incentiveWeight = neuron.incentive || 0;
    const trustWeight = neuron.trust || 0;
    
    // Normalize and combine factors (adjust weights as needed)
    const score = (stakeWeight * 0.4) + (incentiveWeight * 0.4) + (trustWeight * 0.2);
    
    // Scale to meaningful units
    const scaledScore = score * 1000;
    
    if (scaledScore >= 1000000) return (scaledScore / 1000000).toFixed(1) + ' MS'; // Million Score
    if (scaledScore >= 1000) return (scaledScore / 1000).toFixed(1) + ' KS'; // Thousand Score
    return scaledScore.toFixed(1) + ' S'; // Score
  }

  // Calculate rank based on stake and performance metrics
  private calculateRank(neuron: any, allNeurons: any[]): number {
    // Sort neurons by stake + incentive to determine rank
    const sortedNeurons = [...allNeurons]
      .filter(n => n.tao_stake > 0) // Only consider neurons with stake
      .sort((a, b) => {
        const aScore = (a.tao_stake || 0) + (a.incentive || 0);
        const bScore = (b.tao_stake || 0) + (b.incentive || 0);
        return bScore - aScore;
      });
    
    const rank = sortedNeurons.findIndex(n => n.uid === neuron.uid) + 1;
    return rank > 0 ? rank : 0;
  }

  // Get aggregated stats for dashboard
  async getAggregatedStats(miners: any[]): Promise<any> {
    const activeMiners = miners.filter(m => m.status === 'running');
    
    // Calculate totals from actual miner data
    const totalStake = miners.reduce((sum, m) => {
      const stakeMatch = m.stake?.match(/([\d.]+)\s*TAO/);
      return sum + (stakeMatch ? parseFloat(stakeMatch[1]) : 0);
    }, 0);

    const totalEarnings = miners.reduce((sum, m) => {
      const earningsMatch = m.earnings?.match(/([\d.]+)\s*TAO/);
      return sum + (earningsMatch ? parseFloat(earningsMatch[1]) : 0);
    }, 0);

    // Calculate total "hashrate" (contribution score)
    const totalContribution = miners.reduce((sum, m) => {
      // Parse contribution score from formatted string
      const scoreText = m.hashrate || '0 S';
      const match = scoreText.match(/([\d.]+)\s*([KM]?S)/);
      if (!match) return sum;
      
      let score = parseFloat(match[1]);
      const unit = match[2];
      
      // Convert to base units
      if (unit === 'KS') score *= 1000;
      if (unit === 'MS') score *= 1000000;
      
      return sum + score;
    }, 0);

    return {
      activeMiners: activeMiners.length,
      totalMiners: miners.length,
      totalHashrate: this.formatContributionScore(totalContribution),
      totalEarnings: this.formatTAO(totalEarnings),
      taoStake: this.formatTAO(totalStake)
    };
  }

  private formatTAO(amount: number): string {
    if (amount >= 1) return amount.toFixed(3) + ' TAO';
    if (amount >= 0.001) return (amount * 1000).toFixed(1) + ' mTAO';
    return (amount * 1000000).toFixed(1) + ' μTAO';
  }

  private formatContributionScore(score: number): string {
    if (score >= 1000000) return (score / 1000000).toFixed(1) + ' MS';
    if (score >= 1000) return (score / 1000).toFixed(1) + ' KS';
    return score.toFixed(1) + ' S';
  }

  private getDefaultMetrics(): SubnetMetrics {
    return {
      status: 'stopped',
      earnings: '0 TAO',
      contributionScore: '0 S',
      stake: '0 TAO',
      rank: 0,
      trust: 0,
      incentive: 0,
      emissions: 0,
      uid: 0
    };
  }
}