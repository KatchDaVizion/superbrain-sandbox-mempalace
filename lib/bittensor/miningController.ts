import { isatty } from 'tty';
import Logger from './logger';
import { miningService } from './miningService';
import { WalletConfig } from './types';

const mainLogger = new Logger('miningController');

export const getMinerLogs = (walletName: string, hotkey: string, subnetId: number, lines: number = 100) => {
    return miningService.getMinerLogs(walletName, hotkey, subnetId, lines);
};

export const registerWalletToSubnet = async (_, wallet: WalletConfig, subnet_id) => {
  const { walletName, hotkey } = wallet;
  const logger = mainLogger.createChild(`registerWalletToSubnet: ${walletName}`);
  logger.log(`wallet: ${walletName}, subnet: ${subnet_id}`);

  try {
    await miningService.registerWallet(walletName, hotkey, subnet_id);
    return { success: true };
  } catch (error: any) {
    throw new Error(`Failed to register ${wallet.walletName} to subnet ${subnet_id}: ${error.message}`);
  }
};

export const getMinerStatus = (walletName: string, hotkey: string, subnetId: number) => {
  return miningService.getMinerStatus(walletName, hotkey, subnetId);
};

export const getAllMinersStatus = () => {
  return miningService.getAllMiners();
};