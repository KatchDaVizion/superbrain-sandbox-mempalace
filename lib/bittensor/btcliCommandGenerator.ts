import { BtcliPathResult } from "./btcliPath";
import { getOsConfig } from "./config";
import Logger from "./logger";

export const buildBtcliCommand = (btcliResult: BtcliPathResult, args: string[]): { command: string, args: string[] } => {
    const mainLogger = new Logger('btcliCommandGenerator');
    const logger = mainLogger.createChild('buildBtcliCommand');

    const osConfig = getOsConfig(null);
    if (!osConfig) {
        throw new Error('os config not available');
    }

    if (!btcliResult.success || !btcliResult.btcliPath) {
        throw new Error('btcli not available: ' + btcliResult.error);
    }

    if (btcliResult.isWsl) {
        if (!btcliResult.success || !btcliResult.wslPath) {
            throw new Error('no wsl available: ' + btcliResult.error);
        }
        // Build a command string for bash -c (quote each arg safely)
        const bashCommandParts = [btcliResult.btcliPath, ...args].map(arg => {
            // Escape double quotes inside arguments
            return arg.replace(/(["\\$`])/g, '\\$1');
        });
        const bashCommand = bashCommandParts.join(' ');
        const response = {
            command: btcliResult.wslPath as string,
            args: ['-d', osConfig.distro as string, '-e', 'bash', '-c', bashCommand]
        };
        logger.log(JSON.stringify(response));
        return response;
    } else {
        const response = {
            command: btcliResult.btcliPath,
            args: args
        };
        logger.log(JSON.stringify(response));
        return response;
    }
};

export const buildBtcliCommandFromString = (btcliResult: BtcliPathResult, commandString: string, additionalArgs: string[] = []): string => {
    const mainLogger = new Logger('btcliCommandGenerator');
    const logger = mainLogger.createChild('buildBtcliCommandFromString');

    const osConfig = getOsConfig(null);
    if(!osConfig) {
        throw new Error('os config not available: ');
    }

    if (!btcliResult.success || !btcliResult.btcliPath) {
        throw new Error('btcli not available: ' + btcliResult.error);
    }

    // Parse the command string and remove 'btcli'
    const args = commandString.split(' ')
        .filter(part => part.trim() !== '' && part !== 'btcli')
        .concat(additionalArgs);

    if (btcliResult.isWsl) {
        if (!btcliResult.success || !btcliResult.wslPath) {
            throw new Error('no wsl available: ' + btcliResult.error);
        }
        const escapedArgs = args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ');
        const res = `${btcliResult.wslPath} -d ${osConfig.distro as string} -e bash -c "${btcliResult.btcliPath} ${escapedArgs}"`;
        logger.log(res);
        return res;
    } else {
        const res = [btcliResult.btcliPath, ...args].join(' ');
        logger.log(res);
        return res;
    }
};

// For execFileSync style (command + args array)
export const buildBtcliCommandFromStringForExec = (btcliResult: BtcliPathResult, commandString: string, additionalArgs: string[] = []): { command: string, args: string[] } => {
    const mainLogger = new Logger('btcliCommandGenerator');
    const logger = mainLogger.createChild('buildBtcliCommandFromStringForExec');

    const osConfig = getOsConfig(null);
    if(!osConfig) {
        throw new Error('os config not available: ');
    }

    if (!btcliResult.success || !btcliResult.btcliPath) {
        throw new Error('btcli not available: ' + btcliResult.error);
    }

    // Parse the command string and remove 'btcli'
    const args = commandString.split(' ')
        .filter(part => part.trim() !== '' && part !== 'btcli')
        .concat(additionalArgs);

    if (btcliResult.isWsl) {
        if (!btcliResult.success || !btcliResult.wslPath) {
            throw new Error('no wsl available: ' + btcliResult.error);
        }
        const escapedArgs = args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ');
        const wslCommand = `${btcliResult.btcliPath} ${escapedArgs}`;
        const res = {
            command: btcliResult.wslPath,
            args: ['-d', osConfig.distro as string, '-e', 'bash', '-c', wslCommand]
        };
        logger.log(JSON.stringify(res));
        return res;
    } else {
        const res = {
            command: btcliResult.btcliPath,
            args: args
        };
        logger.log(JSON.stringify(res));
        return res;
    }
};