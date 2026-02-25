import React, { useState } from 'react';

interface WalletInfoPanelProps {
  walletName: string;
  hotkey: string;
  walletAddress: string;
  onBack?: () => void;
}

const WalletInfoPanel: React.FC<WalletInfoPanelProps> = ({
  walletName,
  hotkey,
  walletAddress,
  onBack
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const downloadWalletInfo = () => {
    const content = `Bittensor Wallet Information\n\n` +
                   `Wallet Name: ${walletName}\n` +
                   `Wallet Address: ${walletAddress}\n` +
                   `Hotkey: ${hotkey}\n\n` +
                   `Generated on: ${new Date().toLocaleString()}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${walletName}_info.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg border border-purple-500/30 p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold text-purple-300 mb-4">Wallet Setup Complete</h2>
        
        <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm font-medium">Wallet Name</span>
              <button 
                onClick={() => copyToClipboard(walletName, 'name')}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center"
              >
                {copiedField === 'name' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="bg-gray-800 p-3 rounded text-white font-mono text-sm break-all">
              {walletName}
            </div>
          </div>
          
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm font-medium">Wallet Address</span>
              <button 
                onClick={() => copyToClipboard(walletAddress, 'address')}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center"
              >
                {copiedField === 'address' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="bg-gray-800 p-3 rounded text-white font-mono text-sm break-all">
              {walletAddress}
            </div>
          </div>
          
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm font-medium">Hotkey</span>
              <button 
                onClick={() => copyToClipboard(hotkey, 'hotkey')}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center"
              >
                {copiedField === 'hotkey' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="bg-gray-800 p-3 rounded text-white font-mono text-sm break-all">
              {hotkey}
            </div>
          </div>
        </div>
        
        <div className="flex flex-col space-y-3">
          <button
            onClick={downloadWalletInfo}
            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Wallet Info
          </button>
          
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              Back to Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletInfoPanel;