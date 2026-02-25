import fs from "fs";
import path from "path";
import { app } from "electron";
import { WalletSecrets } from "./types";
import { execFileSync } from "child_process";
import { BtcliPathResult, getBtcliPathSafe } from "./btcliPath";
import Logger from "./logger";
import { buildBtcliCommand } from "./btcliCommandGenerator";

export class WalletService {
    private mainLogger: Logger;

    constructor() {
        this.mainLogger = new Logger('walletService');
        // this.ensureDirectory();
    }

    // private ensureDirectory() {
    //     const btcliPath = getBtcliPathSafe();
    //     if (!fs.existsSync(btcliPath.walletsDir)) {
    //         fs.mkdirSync(walletsDir, { recursive: true });
    //         console.log(`Created wallets directory at ${walletsDir}`)
    //     } else {
    //         console.log(`Already have wallets directory at ${walletsDir}`)
    //     }
    // }

    // Check if wallet exists locally
    public walletExists(walletName: string, hotkey: string): boolean {
        const logger = this.mainLogger.createChild(`walletExists: ${walletName}`);
        try {
            const btcliPath = getBtcliPathSafe();
            // const command: BtcliPathResult = btcliPath;
            if (!btcliPath.success) {
                logger.log(`fatal: no point of creating wallet, as we couldn't find the btcli`);
                logger.error(btcliPath.error);
                throw new Error(`fatal: btcli not found`);
            }
            const { command, args } = buildBtcliCommand(btcliPath, ["wallet", "list", "--wallet-path", btcliPath.walletsDir]);
            const output = execFileSync(
                command,
                args,
                { encoding: "utf-8", env: { ...process.env, BT_WALLET_PATH: btcliPath.walletsDir } }
            );
            // const output = execFileSync(
            //     command.path || 'fbtcli',
            //     ["wallet", "list", "--wallet-path", walletsDir],
            //     { encoding: "utf-8", env: { ...process.env, BT_WALLET_PATH: walletsDir } }
            // );
            logger.log('output of wallet check is ', output)
            return output.includes(walletName) && output.includes(hotkey);
        } catch (err) {
            logger.error("Error checking wallet:", err);
            return false;
        }
    }

    // Get mnemonics for existing wallet
    public getWalletMnemonics(walletName: string, hotkey: string): { coldMnemonic?: string, hotkeyMnemonic?: string } {
        const mainLogger = new Logger('walletService');
        const logger = mainLogger.createChild(`createWallet: ${walletName}`);
        const btcliPath = getBtcliPathSafe();
        try {
            // const command: BtcliPathResult = btcliPath;
            if (!btcliPath.success) {
                logger.log(`fatal: no point of creating wallet, as we couldn't find the btcli`);
                logger.error(btcliPath.error);
                throw new Error(`fatal: btcli not found`);
            }
            // const { command, args } = buildBtcliCommand(btcliPath, ["wallet", "show", "--wallet.name", walletName,
            //         "--wallet.hotkey", hotkey,
            //         "--wallet-path", btcliPath.walletsDir,
            //         "--no-password" ]);
            // const output = execFileSync(
            //             command,
            //             args,
            //             {
            //                 encoding: "utf-8",
            //             }
            //         );
            // // const output = execFileSync(
            // //     command.path || 'fbtcli',
            // //     ["wallet", "show",
            // //         "--wallet.name", walletName,
            // //         "--wallet.hotkey", hotkey,
            // //         "--wallet-path", walletsDir,
            // //         "--no-password"  // Skip password prompt if possible
            // //     ],
            // //     {
            // //         encoding: "utf-8",
            // //     }
            // // );

            // // Extract mnemonics with regex
            // const coldMatch = output.match(/coldkey mnemonic:\s+(.+)/i) || output.match(/The mnemonic to the coldkey is:\s+(.+)/i);
            // const hotkeyMatch = output.match(/hotkey mnemonic:\s+(.+)/i) || output.match(/The mnemonic to the hotkey is:\s+(.+)/i);

            // return {
            //     coldMnemonic: coldMatch ? coldMatch[1].trim() : undefined,
            //     hotkeyMnemonic: hotkeyMatch ? hotkeyMatch[1].trim() : undefined
            // };
            return {
                coldMnemonic: undefined,
                hotkeyMnemonic: undefined
            };
        } catch (err) {
            logger.error("Error fetching wallet mnemonics:", err);
            return {
                coldMnemonic: "",
                hotkeyMnemonic: ""
            };
        }
    }

    // Create wallet (cold + hotkey)
    public createWallet(walletName: string, hotkey: string): WalletSecrets {
        const mainLogger = new Logger('walletService');
        const logger = mainLogger.createChild(`createWallet: ${walletName}`);
        try {
            const btcliPath = getBtcliPathSafe();
            // const command: BtcliPathResult = btcliPath;
            if (!btcliPath.success) {
                logger.log(`fatal: no point of creating wallet, as we couldn't find the btcli`);
                logger.error(btcliPath.error);
                throw new Error(`fatal: btcli not found`);
            }
            const { command, args } = buildBtcliCommand(btcliPath, ["wallet", "create", "--wallet.name", walletName, "--wallet.hotkey", hotkey,  "--wallet-path", btcliPath.walletsDir, "--n-words", "12", "--no-use-password", "--overwrite", "--json-out"]);
            const output = execFileSync(command, args, {
                        encoding: "utf-8",   // 👈 capture output as text 
                    });
            // const output = execFileSync(
            //     command.path || 'fbtcli',
            //     ["wallet", "create",
            //         "--wallet.name", walletName,
            //         "--wallet.hotkey", hotkey,
            //         "--wallet-path", walletsDir,
            //         "--n-words", "12",       // 👈 explicitly choose mnemonic length
            //         "--no-use-password",     // 👈 optional: skip password prompt if you don’t want it
            //         "--overwrite"            // 👈 optional: overwrite if already exists (otherwise it error],
            //     ],
            //     {
            //         encoding: "utf-8",   // 👈 capture output as text 
            //     }
            // );

            // Extract mnemonics with regex
            const coldMatch = output.match(/The mnemonic to the new coldkey is:\s+(.+)/);
            const hotkeyMatch = output.match(/The mnemonic to the new hotkey is:\s+(.+)/);

            const secrets: WalletSecrets = {
                walletName,
                hotkey,
                miners: [],
                coldMnemonic: coldMatch ? coldMatch[1].trim() : undefined,
                hotkeyMnemonic: hotkeyMatch ? hotkeyMatch[1].trim() : undefined,
            };
            return secrets;
        } catch (err) {
            logger.error("Error creating wallet:", err);
            throw err;
        }
    }

    public getStartMiningCmd(walletName: string, hotkey: string, subnetId: string): string {
        const btcliPath = getBtcliPathSafe();
        return `${btcliPath} subnet register --wallet.name ${walletName} --wallet.hotkey ${hotkey} --netuid ${subnetId} --wallet-path "${btcliPath.walletsDir}"`
    }

    public getStopMiningCmd(walletName: string, hotkey: string, subnetId: string): string {
        const btcliPath = getBtcliPathSafe();
        return `pkill -f "${btcliPath} subnet register --wallet.name ${walletName} --wallet.hotkey ${hotkey} --netuid ${subnetId}"`
    }
}

export const walletService = new WalletService();
