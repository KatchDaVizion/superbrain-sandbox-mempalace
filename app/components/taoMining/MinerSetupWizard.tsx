import { useState, useEffect } from "react";

// Miner Setup Wizard
export const MinerSetupWizard = ({ 
  isOpen, 
  onClose, 
  onFinish 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onFinish: (walletName: string, hotkey: string, subnetId: string) => void;
}) => {
  const [walletName, setWalletName] = useState("");
  const [hotkey, setHotkey] = useState("");
  const [subnetId, setSubnetId] = useState("");
  const [useRandom, setUseRandom] = useState(false);

  useEffect(() => {
    if (useRandom) {
      setWalletName("");
      setHotkey("");
    }
  }, [useRandom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalWalletName = walletName;
    let finalHotkey = hotkey;

    
    if (useRandom || !walletName) {
      finalWalletName = `wallet_${Math.random().toString(36).substring(2, 10)}`;
    }
    
    if (useRandom || !hotkey) {
      finalHotkey = `5${Math.random().toString(36).substring(2, 15)}...`;
    }
    
    onFinish(finalWalletName, finalHotkey, subnetId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg border border-purple-500/30 p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold text-purple-300 mb-4">Setup Bittensor Wallet</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Wallet Name
            </label>
            <input
              type="text"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              disabled={useRandom}
              placeholder="wallet name"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Hotkey
            </label>
            <input
              type="text"
              value={hotkey}
              onChange={(e) => setHotkey(e.target.value)}
              disabled={useRandom}
              placeholder="hotkey"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
          </div>

          {/* <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Subnet ID
            </label>
            <input
              type="text"
              value={subnetId}
              onChange={(e) => setSubnetId(e.target.value)}
              placeholder="netuid"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
          </div> */}
          
          <div className="mb-4 flex items-center">
            <input
              type="checkbox"
              id="useRandom"
              checked={useRandom}
              onChange={(e) => setUseRandom(e.target.checked)}
              className="h-4 w-4 text-purple-500 focus:ring-purple-500 border-gray-600 rounded"
            />
            <label htmlFor="useRandom" className="ml-2 block text-sm text-gray-300">
              Use random wallet name and hotkey
            </label>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
            >
              Finish Setup
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};