// MiningLogs.tsx - Fixed auto-scroll
import React, { useState, useEffect, useRef } from 'react';

interface MinerLog {
  timestamp: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  minerId: string;
}

interface MinerInfo {
  walletName: string;
  hotkey: string;
  subnetId: string;
  startTime: string;
  restartCount: number;
  status: 'running' | 'stopped' | 'error';
  lastError?: string;
  pid?: number;
  logFile: string;
}

export const MiningLogs = () => {
  const [logs, setLogs] = useState<MinerLog[]>([]);
  const [activeMiners, setActiveMiners] = useState<MinerInfo[]>([]);
  const [selectedMiner, setSelectedMiner] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom within the log container
  // const scrollToBottom = () => {
  //   if (logsContainerRef.current && logsEndRef.current) {
  //     logsContainerRef.current.scrollTo({
  //       top: logsContainerRef.current.scrollHeight,
  //       behavior: 'smooth'
  //     });
  //   }
  // };

  useEffect(() => {
    // scrollToBottom();
  }, [logs]);

  useEffect(() => {
    loadActiveMiners();
    loadLogs();
    
    const interval = setInterval(() => {
      loadActiveMiners();
      loadLogs();
    }, 120000);

    return () => clearInterval(interval);
  }, [selectedMiner]);

  const loadActiveMiners = async () => {
    try {
      const miners = await window.bittensorWalletAPI.getAllMiners();
      setActiveMiners(miners);
    } catch (error) {
      console.error('MiningLogs.loadActiveMiners -> Error loading active miners:', error);
    }
  };

  const loadLogs = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      if (selectedMiner === 'all') {
        // Get aggregated logs from all miners' log files
        try {
          const logLines = await window.bittensorWalletAPI.getAllMinerLogs(200);
          console.log(`MiningLogs.loadLogs -> fetched ${logLines.length} lines`)
          const parsedLogs = logLines.map(line => {
            // Parse miner ID from the line (format: [wallet-subnet] message)
            const minerMatch = line.match(/^\[([^\]]+)\]/);
            const minerId = minerMatch ? minerMatch[1] : 'unknown';
            
            // Determine log level based on content
            let level: 'info' | 'warning' | 'error' = 'info';
            if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
              level = 'error';
            } else if (line.toLowerCase().includes('warn')) {
              level = 'warning';
            }
            
            // Extract message (remove miner ID prefix)
            const message = minerMatch ? line.replace(/^\[[^\]]+\]\s*/, '') : line;
            
            return {
              timestamp: new Date().toLocaleTimeString(),
              message: message.trim(),
              level,
              minerId
            };
          });
          
          setLogs(parsedLogs);
        } catch (error) {
          console.error('MiningLogs.loadLogs -> Error getting aggregated logs:', error);
        }
      } else {
        // Get logs for specific miner from log files
        const [walletName, hotkey, subnetId] = selectedMiner.split(':');
        try {
          const logLines = await window.bittensorWalletAPI.getMinerLogs(walletName, hotkey, subnetId, 200);
          const parsedLogs = logLines.map(line => {
            let level: 'info' | 'warning' | 'error' = 'info';
            if (line.toLowerCase().includes('error')) level = 'error';
            else if (line.toLowerCase().includes('warn')) level = 'warning';
            
            return {
              timestamp: new Date().toLocaleTimeString(),
              message: line.trim(),
              level,
              minerId: `${walletName}-${subnetId}`
            };
          });
          setLogs(parsedLogs);
        } catch (error) {
          console.error('MiningLogs.loadLogs -> Error getting miner logs:', error);
        }
      }
    } catch (error) {
      console.error('MiningLogs.loadLogs ->  Error loading logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      default: return 'text-gray-300';
    }
  };

  const getMinerColor = (minerId: string) => {
    const colors = [
      'text-blue-300', 'text-green-300', 'text-purple-300', 
      'text-cyan-300', 'text-orange-300', 'text-pink-300'
    ];
    const index = minerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const formatLogMessage = (log: MinerLog) => {
    if (selectedMiner === 'all') {
      return (
        <>
          <span className={getMinerColor(log.minerId)}>[{log.minerId}]</span>
          <span className={getLevelColor(log.level)}> {log.message}</span>
        </>
      );
    } else {
      return <span className={getLevelColor(log.level)}>{log.message}</span>;
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">Mining Logs</h2>
        <div className="flex gap-2">
          <select 
            value={selectedMiner}
            onChange={(e) => {
              setSelectedMiner(e.target.value);
              setLogs([]);
            }}
            className="bg-gray-700 text-white px-3 py-1 rounded"
          >
            <option value="all">All Miners</option>
            {activeMiners.map(miner => (
              <option 
                key={`${miner.walletName}:${miner.hotkey}:${miner.subnetId}`}
                value={`${miner.walletName}:${miner.hotkey}:${miner.subnetId}`}
              >
                {miner.walletName} - {miner.subnetId}
              </option>
            ))}
          </select>
          <button
            onClick={clearLogs}
            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded"
          >
            Clear
          </button>
        </div>
      </div>
      
      {/* Log container with proper scrolling */}
      <div 
        ref={logsContainerRef}
        className="bg-black rounded-lg p-4 font-mono text-sm h-96 overflow-y-auto"
      >
        <div className="text-green-400 mb-2">
          {isLoading ? 'Loading logs...' : `Showing Activity logs for miners`}
        </div>
        
        {logs.length === 0 ? (
          <div className="text-gray-500">No logs available. Start a miner to see logs.</div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex">
                <span className="text-gray-500 text-xs w-16 shrink-0">[{log.timestamp}]</span>
                <span className="flex-1">
                  {formatLogMessage(log)}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {activeMiners.map(miner => (
          <div key={`${miner.walletName}-${miner.subnetId}`} className="bg-gray-700 p-3 rounded text-xs">
            <div className="font-semibold">{miner.walletName} - Subnet {miner.subnetId}</div>
            <div>Status: <span className={miner.status === 'running' ? 'text-green-400' : 'text-red-400'}>{miner.status}</span></div>
            <div>PID: {miner.pid || 'N/A'}</div>
            {miner.lastError && (
              <div className="text-red-400 truncate" title={miner.lastError}>
                Error: {miner.lastError.substring(0, 50)}...
              </div>
            )}
          </div>
        ))}
      </div> */}
    </div>
  );
};