import { MinerStats } from "@/lib/bittensor/walletStatsService";
import { useEffect, useState } from "react";

// Define the path relative to the public directory
const SCRIPT_URL = '/scripts/subnet_1_miner_setup.sh';

// Individual Miner Component
export const MinerCard = ({ miner, stats }: { miner: any; stats:any; }) => {
  const id = `${miner.subnetId}`

  const IS_APEX_MINER = miner.subnetId === 1; // Check if it's the Apex Subnet (ID 1)
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' }); // type: 'success' | 'error'

  // Clear message after 5 seconds
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message.text]);

  const handleDownloadScript = async () => {
    if (!IS_APEX_MINER) return;

    setIsLoading(true);
    setMessage({ text: '', type: '' });

    try {
      // 1. Fetch the script content as plain text
      const result = await window.bittensorWalletAPI.downloadScripts('subnet_1_miner_setup.sh')
      if (!result.success) {
        throw new Error(result.error || 'Failed to read script file from main process.');
      }
      
      const scriptContent = result.content;

      // 2. Create the download link from the fetched content (Client-side download remains the same)
      const blob = new Blob([scriptContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'setup_apex_miner.sh';
      
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ text: 'Apex Miner setup script downloaded successfully!', type: 'success' });
    } catch (error) {
      console.error("Download failed:", error);
      setMessage({ text: `Failed to download the setup script. Error: ${error instanceof Error ? error.message : String(error)}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="bg-gray-700 rounded-lg p-4">
      {/* Message Alert */}
      {message.text && (
        <div className={`mb-3 p-2 rounded text-sm font-medium ${
          message.type === 'success' 
            ? 'bg-green-900 text-green-200 border border-green-700' 
            : 'bg-red-900 text-red-200 border border-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span
            className={`w-2 h-2 rounded-full ${
              miner.status === 'registered' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
            }`}
          ></span>
          <span className="font-medium text-white">Subnet {id}</span>
        </div>
        {IS_APEX_MINER && (
            <button
              onClick={handleDownloadScript}
              disabled={isLoading}
              className={`px-3 py-1 mr-2 rounded text-sm font-medium transition-all duration-200 ${
                isLoading 
                  ? 'bg-gray-500 cursor-not-allowed opacity-75' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
              }`}
              title="Download setup_apex_miner.sh script for Linux/WSL"
            >
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
                {isLoading ? 'Downloading...' : 'Download Script'}
              </span>
            </button>
        )}
        <button
          // onClick={handleToggle}
          // disabled={isLoading}
          className={`px-3 py-1 rounded text-sm font-medium transition-all duration-200 ${
            miner.status !== 'registered'
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          } ${
            isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          ) : (
            miner.status
          )}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-gray-400">Model:</div>
          <div className="text-white">{miner.model || 'N/A'}</div>
        </div>
        <div>
          <div className="text-gray-400">Earnings:</div>
          <div className="text-green-400">{stats?.earnings}</div>
        </div>
        {/* <div>
          <div className="text-gray-400">Hashrate:</div>
          <div className="text-blue-400">{stats?.hashrate}</div>
        </div> */}
        <div>
          <div className="text-gray-400">Miner:</div>
          <div className={`font-medium ${
            miner.active ? 'text-green-400' : 'text-red-400'
          }`}>
            {miner.active ? 'Active' : 'Inactive'}
          </div>
        </div>
      </div>
    </div>
  )
}
