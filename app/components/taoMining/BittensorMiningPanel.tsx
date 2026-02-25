import { useState, useEffect } from "react";

interface BittensorStats {
  hotkey: string;
  stake: string;
  incentive: string;
  trust: string;
  consensus: string;
  vtrust: string;
  subnet: number;
}

// Bittensor Mining Panel Component
export const BittensorMiningPanel = ({ 
  bittensorMiningActive, 
  setMiningStatus,
  subscriptionActive, 
  onBittensorToggle 
}: { 
  bittensorMiningActive: boolean; 
  setMiningStatus: (status: boolean) => void;
  subscriptionActive: boolean; 
  onBittensorToggle: () => void;
}) => {
  const [hasWallet, setHasWallet] = useState(false);
  const [showWalletWizard, setShowWalletWizard] = useState(false);
  const [bittensorStats, setBittensorStats] = useState<BittensorStats>({
    hotkey: "",
    subnet: 1,
    stake: "0 TAO",
    incentive: "0.0000",
    trust: "0.0000",
    consensus: "0.0000",
    vtrust: "0.0000"
  });


  const handleToggleMining = () => {
    if (!hasWallet) {
      setShowWalletWizard(true);
      return;
    }
    
    onBittensorToggle();
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">🧠 Bittensor Mining</h2>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">Subnet:</span>
          <span className="text-purple-400 font-mono text-sm">{bittensorStats.subnet}</span>
        </div>
      </div>

      {/* {!hasWallet ? (
        
      ) : (
        <div className="bg-gray-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-purple-300">Miner Status</h3>
            <button
              onClick={handleToggleMining}
              className={`px-3 py-1 rounded text-sm font-medium ${
                bittensorMiningActive 
                  ? "bg-red-600 hover:bg-red-700 text-white" 
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              {bittensorMiningActive ? "Stop Mining" : "Start Mining"}
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-400">Hotkey:</div>
              <div className="text-purple-400 font-mono text-xs truncate">
                {bittensorStats.hotkey || "Not set"}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Stake:</div>
              <div className="text-green-400">{bittensorStats.stake}</div>
            </div>
            <div>
              <div className="text-gray-400">Incentive:</div>
              <div className="text-blue-400">{bittensorStats.incentive}</div>
            </div>
            <div>
              <div className="text-gray-400">Trust:</div>
              <div className="text-yellow-400">{bittensorStats.trust}</div>
            </div>
            <div>
              <div className="text-gray-400">Consensus:</div>
              <div className="text-orange-400">{bittensorStats.consensus}</div>
            </div>
            <div>
              <div className="text-gray-400">Vtrust:</div>
              <div className="text-pink-400">{bittensorStats.vtrust}</div>
            </div>
          </div>
        </div>
      )} */}

      {!subscriptionActive && (
        <div className="bg-yellow-900/50 border border-yellow-500/30 rounded-lg p-4 mb-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">⚠️ Subscription Required</h3>
          <p className="text-gray-300 text-sm mb-3">
            Bittensor mining requires an active subscription. Access to the SuperBrain synapse and automated mining.
          </p>
          <button className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg font-medium">
            Upgrade to Premium
          </button>
        </div>
      )}

      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-purple-300 mb-3">Network Stats</h3>
        <div className="text-sm text-gray-300 space-y-1">
          <div>• SuperBrain Synapse: {hasWallet ? "Active" : "Inactive"}</div>
          <div>• Local AI Integration: {hasWallet ? "Enabled" : "Disabled"}</div>
          <div>• Auto-registration: {hasWallet ? "Ready" : "Pending"}</div>
          <div>• Mining rewards: {hasWallet ? "Real-time" : "Not available"}</div>
        </div>
      </div>
{/* 
      <WalletWizard 
        isOpen={showWalletWizard}
        onClose={() => setShowWalletWizard(false)}
        onFinish={handleWalletSetup}
      /> */}
    </div>
  );
};

export default BittensorMiningPanel;