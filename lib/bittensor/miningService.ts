// miningService.ts
// miningService.ts
import { spawn, ChildProcess, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getRawConfigs, updateSubnetMinerStatus, updateSubnetStatus } from './config';
import Logger from './logger';
import { WalletOverviewResponse, WalletStats, WalletStatsService } from './walletStatsService';
import { BtcliPathResult, getBtcliPathSafe } from './btcliPath';
import subnetsData from './subnets.json';
import { buildBtcliCommand, buildBtcliCommandFromStringForExec } from './btcliCommandGenerator';

export interface MinerProcess {
    process: ChildProcess;
    walletName: string;
    hotkey: string;
    subnetId: number;
    startTime: Date;
    logStream: fs.WriteStream;
    status: 'registering' | 'registered' | 'failed' | 'deregistered';
    active: boolean;
    lastError?: string;
    isRegistrationComplete: boolean; // New
}

export interface OverallStats {
    totalEarnings: number;
    totalStakes: number;
    activeMiners: number;
}

export interface WalletWithStats extends WalletStats {
    walletName: string;
    hotkey: string;
}

// Serializable version for IPC
export interface MinerInfo {
    walletName: string;
    hotkey: string;
    subnetId: number;
    startTime: string;
    // restartCount: number;
    status: 'registering' | 'registered' | 'failed' | 'deregistered';
    active: boolean;
    lastError?: string;
    pid?: number;
    logFile: string;
}

export class MiningService {
    private activeMiners: Map<string, MinerProcess> = new Map();
    private participatedMiners: Map<string, MinerInfo> = new Map();
    private readonly logsDir = path.join(app.getPath("userData"), "mining-logs");
    private readonly MAX_BUFFER_LINES = 1000; // Keep last 1000 lines in memory
    private readonly MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB per log file
    private readonly MAX_LOG_FILES = 5; // Keep 5 rotated log files
    private mainLogger: Logger;
    private periodicalStatusUpdateRef;


    constructor() {
        this.ensureLogsDirectory();
        this.mainLogger = new Logger('miningservice');
        this.hydrateParticipatedMiners();
        this.hydrateActiveMiners();
        this.periodicalStatusUpdate();
        // Clean up on app exit
        app.on('before-quit', this.cleanupAllMiners.bind(this));
    }

    public execute(cmd: string, includePath) {
        const logger = this.mainLogger.createChild(`execute`);
        if (!cmd) {
            const errorMsg = 'no command provided for execution';
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }
        const btcliPath = getBtcliPathSafe();
        const command: BtcliPathResult = btcliPath;
        if (!command.success) {
            logger.log(`fatal: no point executing command, as we couldn't find the btcli`);
            logger.error(command.error);
            throw new Error(`fatal: btcli not found`);
        }

        // Build additional arguments
        const additionalArgs: string[] = [];
        if (includePath) {
            additionalArgs.push('--wallet-path', btcliPath.walletsDir);
        }
        additionalArgs.push('--json-out');

        // Build the complete command
        // const finalCommand = buildBtcliCommandFromString(command, cmd, additionalArgs);
        const { command: finalCommand, args } = buildBtcliCommandFromStringForExec(btcliPath, cmd, additionalArgs);

        logger.log(finalCommand);
        return execFileSync(finalCommand, args, { encoding: "utf-8" });
    }

    private fetchStats() {
        const logger = this.mainLogger.createChild('fetchStats ');
        const wallet = this.getSelectedWallet();
        if (!wallet) {
            return;
        }
        const statsService = new WalletStatsService();
        let data: WalletOverviewResponse | null;
        try {
            data = statsService.getWalletOverviewSnapshot(wallet.walletName);
        } catch (error) {
            logger.error(`unable to get wallet overview for this time`);
            logger.error(error);
            data = null;
        }
        if (data) {
            statsService.saveSnapshot(wallet.walletName, data);
            data.subnets.forEach(subnet => {
                const key = this.getMinerKey(wallet.walletName, wallet.hotkey, subnet.netuid);
                let cachedParticipatedMiner = this.participatedMiners.get(key);
                if (cachedParticipatedMiner) {
                    if (cachedParticipatedMiner.active != subnet.neurons[0].active) {
                        // logger.log(`miner is not running for ${key}: ${cachedParticipatedMiner?.status} -> stopped`);
                        // @TODO: in future we may track miner status, we are here because, miner is not running for the registered subnet
                        cachedParticipatedMiner.active = subnet.neurons[0].active;
                        this.participatedMiners.set(key, cachedParticipatedMiner);
                        updateSubnetMinerStatus(wallet.walletName, wallet.hotkey, cachedParticipatedMiner.subnetId, cachedParticipatedMiner.active);
                    }
                }

            //     // let cachedActiveMiner = this.activeMiners.get(key);
            //     // if (cachedActiveMiner) {
            //     //     if (cachedActiveMiner.status == 'running' && subnet.neurons[0].active != true) {
            //     //         const statusMsg = `status has changed of active miner ${key}: ${cachedActiveMiner?.status} -> stopped`;
            //     //         logger.log(statusMsg);
            //     //         cachedActiveMiner.status = 'stopped';
            //     //         cachedActiveMiner.logStream.write(statusMsg);
            //     //         this.activeMiners.set(key, cachedActiveMiner);
            //     //     }
            //     // }
            })
        }

    }

    public getOverallStats(): OverallStats {
        const logger = this.mainLogger.createChild(`getOverallStats: `);
        const wallet = this.getSelectedWallet();
        if (!wallet) {
            logger.log(`getOverallStats: no configured wallet has been found`);
            return {
                totalEarnings: 0,
                totalStakes: 0,
                activeMiners: 0,
            };
        }

        const statsService = new WalletStatsService();
        const snapshots = statsService.loadSnapshots(wallet.walletName);
        const stats = statsService.calculateWalletStats(snapshots);
        return stats;
    }

    public getSubnets() {
        return subnetsData;
    }

    public getWalletStats(name = ''): WalletWithStats {
        const logger = this.mainLogger.createChild(`getWalletStats: `);
        const wallet = this.getSelectedWallet();
        if (!wallet) {
            logger.log(`getWalletStats: no configured wallet has been found`);
            return {
                walletName: '',
                hotkey: '',
                totalEarnings: 0,
                totalStakes: 0,
                activeMiners: 0,
                miners: []
            };
        }

        const statsService = new WalletStatsService();
        const snapshots = statsService.loadSnapshots(wallet.walletName);
        const stats = statsService.calculateWalletStats(snapshots);
        const appMiners = wallet.miners.map(m => {
            const minerStats = stats.miners.find(mnr => mnr.subnetId == m.subnetId);
            if (!minerStats) {
                logger.log(`no statistics has been found for subnet: ${m.subnetId}`);
            }
            return {
                ...m,
                earnings: minerStats?.earnings || 0,
                stakes: minerStats?.stakes || 0
            }
        })
        stats.miners = appMiners;
        return {
            ...stats,
            walletName: wallet.walletName,
            hotkey: wallet.hotkey
        };
    }

    private periodicalStatusUpdate() {
        this.periodicalStatusUpdateRef = setInterval(() => {
            this.fetchStats();
        }, 300000) // every 3 minutes
    }

    private ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    private getSelectedWallet() {
        const wallets = getRawConfigs();
        //REFACTOR: we can safely assume for mvp that there is only one wallet
        let wallet = wallets[0];
        return wallet;
    }

    private hydrateParticipatedMiners() {
        const wallet = this.getSelectedWallet();
        if (!wallet) {
            return;
        }

        wallet.miners.forEach(async miner => {
            const key = this.getMinerKey(wallet.walletName, wallet.hotkey, miner.subnetId);
            const logStream = await this.setupLogFile(wallet.walletName, wallet.hotkey, miner.subnetId);
            const info: MinerInfo = {
                walletName: wallet.walletName,
                hotkey: wallet.hotkey,
                subnetId: miner.subnetId,
                status: miner.status,
                active: miner.active,
                logFile: logStream.path.toString(),
                startTime: new Date().toISOString(),
            }
            this.participatedMiners.set(key, info)
        });
    }

    hydrateActiveMiners() {
        const logger = this.mainLogger.createChild(`hydrateActiveMiners: `);
        Array.from(this.participatedMiners.values()).map(async (miner) => {
            if (miner.status != 'registered') {
                return;
            }

            const btcliPath = getBtcliPathSafe();
            const command: BtcliPathResult = btcliPath;
            if (!command.success) {
                logger.log(`fatal: no point of hydrating miners, as we couldn't find the btcli`);
                logger.error(command.error);
                return;
            }

            const args = [];
            const minerProcess = spawn('pwd', args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            const key = this.getMinerKey(miner.walletName, miner.hotkey, miner.subnetId);
            const process: MinerProcess = {
                ...miner,
                logStream: await this.setupLogFile(miner.walletName, miner.hotkey, miner.subnetId),
                isRegistrationComplete: true,
                process: minerProcess,
                startTime: new Date()
            }

            this.activeMiners.set(key, process);
        });

        const activeMiners = Array.from(this.activeMiners.values());
        logger.log(`${activeMiners.length} registered subnet found`);

    }

    private getMinerKey(walletName: string, hotkey: string, subnetId: number): string {
        return `${walletName}:${hotkey}:${subnetId}`;
    }

    private getLogFilePath(walletName: string, hotkey: string, subnetId: number): string {
        return path.join(this.logsDir, `${walletName}_${hotkey}_${subnetId}.log`);
    }

    private async setupLogFile(walletName: string, hotkey: string, subnetId: number): Promise<fs.WriteStream> {
        const logger = this.mainLogger.createChild(`setupLogFile: `);
        const logFile = this.getLogFilePath(walletName, hotkey, subnetId);

        // Rotate log file if it's too large
        if (fs.existsSync(logFile)) {
            const stats = fs.statSync(logFile);
            if (stats.size > this.MAX_LOG_SIZE) {
                logger.log('---> rotating logs file --')
                await this.rotateLogFile(logFile);
            }
        }

        // Create logs directory if it doesn't exist
        this.ensureLogsDirectory();

        logger.log(`log file that we set up: `, logFile);
        return fs.createWriteStream(logFile, { flags: 'a' }); // Append mode
    }

    private async rotateLogFile(logFile: string): Promise<void> {
        const logger = this.mainLogger.createChild(`rotateLogFile: `);
        try {
            const dir = path.dirname(logFile);
            const baseName = path.basename(logFile, '.log');

            // Find existing rotated files
            const files = fs.readdirSync(dir);
            const rotatedFiles = files
                .filter(file => file.startsWith(baseName) && file !== `${baseName}.log`)
                .sort();

            // Remove oldest files if we have too many
            while (rotatedFiles.length >= this.MAX_LOG_FILES - 1) {
                const oldestFile = rotatedFiles.shift();
                if (oldestFile) {
                    fs.unlinkSync(path.join(dir, oldestFile));
                }
            }

            // Rename existing rotated files
            for (let i = rotatedFiles.length; i > 0; i--) {
                const oldName = i === 1 ? `${baseName}.log` : `${baseName}.${i - 1}.log`;
                const newName = `${baseName}.${i}.log`;
                if (fs.existsSync(path.join(dir, oldName))) {
                    fs.renameSync(path.join(dir, oldName), path.join(dir, newName));
                }
            }

            // Rename current log to .1.log
            if (fs.existsSync(logFile)) {
                fs.renameSync(logFile, path.join(dir, `${baseName}.1.log`));
            }
        } catch (error) {
            logger.error('Error rotating log file:', error);
        }
    }



    async registerWallet(walletName: string, hotkey: string, subnetId: number): Promise<MinerProcess> {
        return new Promise(async (resolve, reject) => {
            const key = this.getMinerKey(walletName, hotkey, subnetId);
            const logger = this.mainLogger.createChild(`registerWallet: ${key}`);
            const btcliPath = getBtcliPathSafe();
            const command: BtcliPathResult = btcliPath;
            if (!command.success) {
                logger.log(`fatal: no point of starting miner, as we couldn't find the btcli`);
                logger.error(command.error);
                const err = new Error(`fatal: btcli not found`);
                reject(err);
            }

            if (this.activeMiners.has(key)) {
                logger.log(`No need to proceed further, the subnet registration has already been completed`);
                const miner = this.activeMiners.get(key) as MinerProcess;
                resolve(miner);
            }

            // Setup log file with rotation
            const logStream = await this.setupLogFile(walletName, hotkey, subnetId);

            const args = [
                'subnet', 'register',
                '--wallet.name', walletName,
                '--wallet.hotkey', hotkey,
                '--netuid', subnetId.toString(),
                '--wallet-path', btcliPath.walletsDir,
                '--no-prompt'
            ];

            const {command: finalCommand, args: finalArgs} = buildBtcliCommand(btcliPath, args)
            // Log the start command to both console and log file
            const startMessage = `Starting wallet registration: ${finalCommand} ${finalArgs.join(' ')}\n`;
            logger.log(startMessage);
            logStream.write(startMessage);

            const minerProcess = spawn(finalCommand, finalArgs, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            const miner: MinerProcess = {
                process: minerProcess,
                walletName,
                hotkey,
                subnetId,
                startTime: new Date(),
                logStream,
                status: 'registering',
                active: false,
                isRegistrationComplete: false, // Track if registration succeeded
            };

            let registrationCompleted = false;
            // Handle successful registration
            const onRegistrationSuccess = () => {
                if (registrationCompleted) return;
                registrationCompleted = true;
                
                miner.isRegistrationComplete = true;
                miner.status = 'registered';
                miner.active = false;
                
                cleanup();
                updateSubnetStatus(walletName, hotkey, subnetId, 'registered');
                this.activeMiners.set(key, miner);
                this.participatedMiners.set(key, this.serializeMiner(miner));

                const success = `✅ Miner registration successful`;
                logger.log(success);
                miner.logStream.write(success);
                
                setTimeout(() => miner.logStream.end(), 10000);
                resolve(miner);
            };

            // Handle registration failure
            const onRegistrationFailure = (error: string) => {
                if (registrationCompleted) return;
                registrationCompleted = true;
                
                miner.status = 'failed';
                miner.lastError = error;
                miner.logStream.write(error);
                logger.error(error);
                setTimeout(() => miner.logStream.end(), 10000);
                cleanup();
                updateSubnetStatus(walletName, hotkey, subnetId, 'failed');
                this.activeMiners.delete(key);
                
                reject(new Error(error));
            };

            // Cleanup function to remove event listeners
            let cleanup = () => {
                minerProcess.stdout.removeAllListeners('data');
                minerProcess.stderr.removeAllListeners('data');
                minerProcess.removeAllListeners('close');
                minerProcess.removeAllListeners('error');
            };


            // Pipe stdout and stderr to log file
            minerProcess.stdout.pipe(logStream);
            minerProcess.stderr.pipe(logStream);

            // Capture stdout in memory buffer
            minerProcess.stdout.on('data', (data) => {
                const output = data.toString();
                const lines = output.split('\n').filter(line => line.trim() !== '');

                lines.forEach(line => {
                    const formattedLine = `[${walletName}-${subnetId}] ${line}\n`;
                    logger.log(formattedLine);
                    miner.logStream.write(formattedLine);

                    if (this.isRegistrationSuccessful(line)) {
                        onRegistrationSuccess();
                    }
                });

                logger.log(`raw output data from stdout of subnet registration process is: ${output.trim()}`);
            });

            minerProcess.stderr.on('data', (data) => {
                const output = data.toString();
                const lines = output.split('\n').filter(line => line.trim() !== '');
                lines.forEach(line => {
                    const formattedLine = `[${walletName}-${subnetId}-ERROR] ${line}\n`;
                    miner.logStream.write(formattedLine);
                    logger.error(formattedLine);
                });

                if (output.includes('error') || output.includes('failed') || output.includes('Error')) {
                    onRegistrationFailure(`Registration error: ${output}`);
                }
            });

            minerProcess.on('close', (code, signal) => {
                if (registrationCompleted) return;

                if (miner.isRegistrationComplete) {
                    onRegistrationSuccess();
                } else {
                    const errorMsg = `Registration process exited with code ${code}${signal ? ` and signal: ${signal}` : ''}`;
                    onRegistrationFailure(errorMsg);
                }
            });

            minerProcess.on('error', (error) => {
                if (registrationCompleted) return;
                onRegistrationFailure(`Process error: ${error.message}`);
            });

            // Set a timeout for registration (optional - adjust as needed)
            const timeoutMs = 300000; // 5 minutes
            const timeout = setTimeout(() => {
                if (!registrationCompleted) {
                    onRegistrationFailure('Registration timeout - process took too long');
                    minerProcess.kill(); // Force kill the process
                }
            }, timeoutMs);

            // Update cleanup to clear timeout
            const originalCleanup = cleanup;
            cleanup = () => {
                clearTimeout(timeout);
                originalCleanup();
            };
        });
    }

    /**
     * Check if the output line indicates successful registration
     */
    private isRegistrationSuccessful(outputLine: string): boolean {
        const successPatterns = [
            /successfully registered/i,
            /registration successful/i,
            /subnet registered/i,
            /miner registered/i,
            /Registered on netuid/i,
            /Already Registered/i
        ];

        return successPatterns.some(pattern => pattern.test(outputLine));
    }

    // Enhanced getMinerLogs to include system messages
    async getMinerLogs(walletName: string, hotkey: string, subnetId: number, lines: number = 100): Promise<string[]> {
        return await this.readLogsFromFilesNewestFirst(walletName, hotkey, subnetId, lines);
    }

    async getAllMinerLogs(lines: number = 100): Promise<string[]> {
        const logger = this.mainLogger.createChild(`getAllMinerLogs: `);
        try {
            const allLogs: string[] = [];
            const participatedMiners = Array.from(this.participatedMiners.values());

            if (participatedMiners.length === 0) {
                return [];
            }

            const linesPerMiner = Math.max(1, Math.floor(lines / participatedMiners.length));

            const logPromises = participatedMiners.map(miner =>
                this.readLogsFromFilesNewestFirst(miner.walletName, miner.hotkey, miner.subnetId, linesPerMiner)
            );

            const minersLogs = await Promise.allSettled(logPromises);

            // Combine all miner logs
            minersLogs.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const miner = participatedMiners[index];
                    const minerLogs = result.value.map(line =>
                        `[${miner.walletName}-${miner.subnetId}] ${line}`
                    );
                    allLogs.push(...minerLogs);
                }
            });

            // Reverse the order so newest logs are first
            return allLogs.slice(0, lines);
        } catch (error) {
            logger.error('Error getting all miner logs:', error);
            return [];
        }
    }

    private async readLogsFromFilesNewestFirst(walletName: string, hotkey: string, subnetId: number, lines: number): Promise<string[]> {
        const logger = this.mainLogger.createChild(`readLogsFromFilesNewestFirst: `);
        const baseName = `${walletName}_${hotkey}_${subnetId}`;

        if (!fs.existsSync(this.logsDir)) {
            return [];
        }

        try {
            // Get log files sorted by modification time (newest first)
            const files = fs.readdirSync(this.logsDir)
                .filter(file => file.startsWith(`${baseName}`) && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.logsDir, file),
                    time: fs.statSync(path.join(this.logsDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time); // NEWEST files first

            if (files.length === 0) {
                return [];
            }

            let allLines: string[] = [];

            // Read files in reverse chronological order (newest first)
            for (const file of files) {
                if (allLines.length >= lines) break;

                try {
                    const content = await fs.promises.readFile(file.path, 'utf8');
                    const fileLines = content.split('\n').filter(line => line.trim() !== '');

                    // Since this is the newest file, we want its lines to appear first
                    // But within the file, lines are in chronological order, so we need to reverse them
                    const reversedFileLines = fileLines.reverse();

                    // Prepend the reversed file lines (newest lines first)
                    allLines = [...reversedFileLines, ...allLines];

                    if (allLines.length >= lines) {
                        allLines = allLines.slice(0, lines); // Take only the newest lines
                        break;
                    }
                } catch (error) {
                    logger.error(`Error reading log file ${file.path}:`, error);
                }
            }

            return allLines;
        } catch (error) {
            logger.error('Error reading log files:', error);
            return [];
        }
    }


    getAllMiners(): MinerInfo[] {
        return Array.from(this.participatedMiners.values()).map(miner => miner);
    }

    private serializeMiner(miner: MinerProcess): MinerInfo {
        return {
            walletName: miner.walletName,
            hotkey: miner.hotkey,
            subnetId: miner.subnetId,
            startTime: miner.startTime.toISOString(),
            status: miner.status,
            active: miner.active,
            lastError: miner.lastError,
            pid: miner.process.pid,
            logFile: miner.logStream.path.toString()
        };
    }

    getMinerStatus(walletName: string, hotkey: string, subnetId: number): MinerInfo | null {
        const key = this.getMinerKey(walletName, hotkey, subnetId);
        const miner = this.activeMiners.get(key);
        return miner ? this.serializeMiner(miner) : null;
    }

    private async cleanupAllMiners(): Promise<void> {
        const logger = this.mainLogger.createChild(`cleanupAllMiners: `);
        logger.log('Cleaning up all miners...');
        clearInterval(this.periodicalStatusUpdateRef);
        logger.log('All miners cleaned up');
    }

    // Simple method to check if a miner is running
    isMinerRunning(walletName: string, hotkey: string, subnetId: number): boolean {
        const key = this.getMinerKey(walletName, hotkey, subnetId);
        return this.activeMiners.has(key);
    }
}

export const miningService = new MiningService();