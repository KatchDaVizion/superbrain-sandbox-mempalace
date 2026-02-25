import fs from "fs";
import path from "path";
import { app } from "electron";
import { BtcliConfig, WalletConfig, WalletSecrets } from "./types";
import { walletService } from "./walletService";
import Logger from "./logger";

const configPath = path.join(app.getPath("userData"), "wallet-config.json");
const osConfigPath = path.join(app.getPath("userData"), "os-config.json");
const mainLogger = new Logger('config');
export function getConfigPath() {
  return app.getPath("userData")
}

export const getOsConfig = (_): BtcliConfig | null => {
  const logger = mainLogger.createChild(`getOsConfig`);
  logger.log('getOsConfig - trying to load configs for bittensor os setup', osConfigPath);
  if (fs.existsSync(osConfigPath)) {
    logger.log('getOsConfig - path exists for bittensor wallets');
    let configs = JSON.parse(fs.readFileSync(osConfigPath, "utf-8")) as BtcliConfig;
    logger.log(`getOsConfig - loaded os config`);
    return configs;
  } else {
    logger.log('getOsConfig - path does not exist for bittensor wallets, returning null');
      return null
  }
};

export const saveOsConfig = (_, config: BtcliConfig): void => {
  const logger = mainLogger.createChild(`saveConfig`);
  logger.log('invoked with', config);
  try {
    fs.writeFileSync(osConfigPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    throw new Error(`Failed to save os config: ${error}`);
  }
}

export function saveConfig(data: WalletConfig): WalletSecrets {
  const logger = mainLogger.createChild(`saveConfig`);
  logger.log('saveConfig for wallet has been invoked with', data);
  
  // Load existing configs or initialize empty array
  let allConfigs: WalletSecrets[] = [];
  if (fs.existsSync(configPath)) {
      allConfigs = JSON.parse(fs.readFileSync(configPath, "utf-8")) as WalletSecrets[];
  }
  
  // Find if wallet already exists
  const existingIndex = allConfigs.findIndex(
      config => config.walletName === data.walletName && config.hotkey === data.hotkey
  );
  
  let secrets: WalletSecrets;
  
  if (existingIndex === -1) {
      // Wallet doesn't exist, create new entry
      if (!walletService.walletExists(data.walletName, data.hotkey)) {
          logger.log(`Wallet "${data.walletName}/${data.hotkey}" not found, creating...`);
          secrets = walletService.createWallet(data.walletName, data.hotkey);
          logger.log('writing wallet secrets', secrets);
      } else {
          logger.log(`Wallet "${data.walletName}/${data.hotkey}" already exists, updating configuration...`);
          // Wallet exists in filesystem but not in our config, fetch mnemonics
          secrets = {
              ...data,
              ...walletService.getWalletMnemonics(data.walletName, data.hotkey)
          };
      }
      allConfigs.push(secrets);
  } else {
      // Wallet exists, update it
      logger.log(`Wallet "${data.walletName}/${data.hotkey}" found, updating...`);
      
      allConfigs[existingIndex].miners = allConfigs[existingIndex].miners || [];
      // For each miner in the new data, check if it already exists or needs to be added
      data.miners.forEach(newMiner => {
          const existingMinerIndex = allConfigs[existingIndex].miners?.findIndex(
              miner => miner.subnetId === newMiner.subnetId
          );
          
          if (existingMinerIndex === -1) {
              // Add new miner
              allConfigs[existingIndex].miners.push(newMiner);
          } else {
              // Update existing miner (preserve running status if not provided)
              if (newMiner.status === undefined) {
                  newMiner.status = allConfigs[existingIndex].miners[existingMinerIndex].status;
              }
              allConfigs[existingIndex].miners[existingMinerIndex] = newMiner;
          }
      });
      
      secrets = allConfigs[existingIndex];
  }
  
  fs.writeFileSync(configPath, JSON.stringify(allConfigs, null, 2), "utf-8");
  return secrets;
}

export function getRawConfigs() {
  if (fs.existsSync(configPath)) {
    let configs = JSON.parse(fs.readFileSync(configPath, "utf-8")) as WalletConfig[];
    return configs;
  } else {
      return []
  }
}

export function loadConfigs(): WalletConfig[] {
  let configs = getRawConfigs();
  // Due to frontend convenience let's consider only two status
  // configs.forEach(walletConfig => {
  //   const walletRunning = walletService.checkWalletStatus(walletConfig.walletName);
  //   walletConfig.miners.forEach(miner => {
  //       miner.status = walletRunning ? 'running' : 'stopped';
  //   });
  // });
  return configs;
}

export function getWalletConfig(walletName: string, hotkey: string): WalletConfig | null {
  const allConfigs = loadConfigs();
  return allConfigs.find(
      config => config.walletName === walletName && config.hotkey === hotkey
  ) || null;
}

export function deleteWalletConfig(walletName: string, hotkey: string): boolean {
  const allConfigs = loadConfigs();
  const initialLength = allConfigs.length;
  
  const filteredConfigs = allConfigs.filter(
      config => !(config.walletName === walletName && config.hotkey === hotkey)
  );
  
  if (filteredConfigs.length < initialLength) {
      fs.writeFileSync(configPath, JSON.stringify(filteredConfigs, null, 2), "utf-8");
      return true;
  }
  
  return false;
}

export function updateSubnetStatus(walletName: string, hotkey: string, subnetId: number, status: 'registered' | 'failed' | 'deregistered'): void {
  const logger = mainLogger.createChild(`updateSubnetStatus`);
  logger.log(`Updating subnet status: ${walletName}/${hotkey}/${subnetId} -> ${status}`);
  
  if (fs.existsSync(configPath)) {
    let allConfigs: any[] = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    
    const walletIndex = allConfigs.findIndex(
      config => config.walletName === walletName && config.hotkey === hotkey
    );

    if (walletIndex !== -1) {
      const minerIndex = allConfigs[walletIndex].miners.findIndex(
        (miner: any) => miner.subnetId === subnetId
      );

      if (minerIndex !== -1) {
        allConfigs[walletIndex].miners[minerIndex].status = status;
        allConfigs[walletIndex].miners[minerIndex].lastUpdated = new Date().toISOString();
        
        fs.writeFileSync(configPath, JSON.stringify(allConfigs, null, 2), "utf-8");
        logger.log(`subnet status updated successfully`);
      } else {
        logger.warn(`subnet not found in config: ${subnetId}`);
      }
    } else {
      logger.warn(`Wallet not found in config: ${walletName}/${hotkey}`);
    }
  }
}

export function updateSubnetMinerStatus(walletName: string, hotkey: string, subnetId: number, active: boolean): void {
  const logger = mainLogger.createChild(`updateSubnetMinerStatus`);
  logger.log(`Updating subnet miner status: ${walletName}/${hotkey}/${subnetId} -> ${active}`);
  
  if (fs.existsSync(configPath)) {
    let allConfigs: any[] = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    
    const walletIndex = allConfigs.findIndex(
      config => config.walletName === walletName && config.hotkey === hotkey
    );

    if (walletIndex !== -1) {
      const minerIndex = allConfigs[walletIndex].miners.findIndex(
        (miner: any) => miner.subnetId === subnetId
      );

      if (minerIndex !== -1) {
        allConfigs[walletIndex].miners[minerIndex].active = active;
        allConfigs[walletIndex].miners[minerIndex].lastUpdated = new Date().toISOString();
        
        fs.writeFileSync(configPath, JSON.stringify(allConfigs, null, 2), "utf-8");
        logger.log(`subnet miner status updated successfully`);
      } else {
        logger.warn(`subnet not found in config: ${subnetId}`);
      }
    } else {
      logger.warn(`Wallet not found in config: ${walletName}/${hotkey}`);
    }
  }
}

export function getMinerStatus(walletName: string, hotkey: string, subnetId: string): string {
  try {
    const allConfigs = loadConfigs();
    const wallet = allConfigs.find(
      config => config.walletName === walletName && config.hotkey === hotkey
    );
    
    if (wallet) {
      const miner = wallet.miners.find((m: any) => m.subnetId === subnetId);
      return miner ? miner.status : 'unknown';
    }
    
    return 'unknown';
  } catch (error) {
    console.error('Error getting miner status:', error);
    return 'error';
  }
}