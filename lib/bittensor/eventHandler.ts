import { exec } from 'child_process'
import { getWalletConfig, loadConfigs, saveConfig } from './config';
import { WalletConfig } from './types';
import { registerWalletToSubnet } from './miningController';
import { getBtcliPathSafe } from './btcliPath';
import { downloadSubnetScripts } from './subnetScripts';
export const getBittensorStats = async () => {
    const btcliPath = getBtcliPathSafe();
  return new Promise((resolve, reject) => {
    exec(`${btcliPath} status --json`, (error, stdout) => {
      if (error) {
        console.error('Error fetching stats:', error);
        return reject(error);
      }
      try {
        const data = JSON.parse(stdout);
        resolve({
          hotkey: data.hotkey || 'N/A',
          stake: `${data.stake} TAO` || '0 TAO',
          incentive: data.incentive || '0',
          trust: data.trust || '0',
          consensus: data.consensus || '0',
          vtrust: data.vtrust || '0',
          subnet: data.subnet || '1'
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

export const saveWalletConfig = (_, data: WalletConfig) => {
    saveConfig(data);

    // create config if it doesn't exist already
    return true;
}

export const downloadMinerScript = (_, filename) => {
  return downloadSubnetScripts(filename);
}

export const loadWalletConfig = () => {
    return loadConfigs();
}

export const registerBittensorWallet = registerWalletToSubnet;