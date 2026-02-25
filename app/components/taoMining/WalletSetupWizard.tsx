import { useState, useEffect } from 'react';

export const WalletSetupWizard = ({
  isOpen,
  onClose,
  onFinish
}: {
  isOpen: boolean;
  onClose: () => void;
  onFinish: (walletName: string, hotkey: string) => void;
}) => {
  const [walletName, setWalletName] = useState("");
  const [hotkey, setHotkey] = useState("");
  const [useRandom, setUseRandom] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [finalWalletName, setFinalWalletName] = useState("");
  const [finalHotkey, setFinalHotkey] = useState("");
  const [copiedField, setCopiedField] = useState<"wallet" | "hotkey" | null>(null);

  useEffect(() => {
    if (useRandom) {
      setWalletName("");
      setHotkey("");
    }
  }, [useRandom]);

  useEffect(() => {
    if (copiedField) {
      const timer = setTimeout(() => {
        setCopiedField(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedField]);

  const clearState = () => {
    setWalletName("");
    setHotkey("");
    setUseRandom(false);
    setSubmitted(false);
    setFinalWalletName("");
    setFinalHotkey("");
    setCopiedField(null);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let name = walletName;
    let key = hotkey;

    if (useRandom || !walletName) {
      name = `wallet_${Math.random().toString(36).substring(2, 10)}`;
    }

    if (useRandom || !hotkey) {
      key = `5${Math.random().toString(36).substring(2, 18)}`;
    }

    // Save the final values for display
    setFinalWalletName(name);
    setFinalHotkey(key);

    // Call the onFinish callback
    onFinish(name, key);

    // Show the confirmation screen instead of closing
    setSubmitted(true);
  };

  const handleClose = () => {
    clearState();
    onClose();
  };

  const copyToClipboard = (text: string, field: "wallet" | "hotkey") => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
  };

  const downloadCSV = () => {
    const csvContent = `data:text/csv;charset=utf-8,Wallet Name,Hotkey\n${finalWalletName},${finalHotkey}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${finalWalletName}_details.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg border border-purple-500/30 p-6 w-full max-w-md">
        {!submitted ? (
          <>
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

              <div className="mb-4 flex items-center">
                <input
                  type="checkbox"
                  id="useRandom"
                  checked={useRandom}
                  onChange={(e) => setUseRandom(e.target.checked)}
                  className="h-4 w-4 text-purple-500 focus:ring-purple-500 border-gray-600 rounded"
                />
                <label htmlFor="useRandom" className="ml-2 block text-sm text-gray-300">
                  Auto generate wallet name and hotkey
                </label>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                >
                  Submit
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-purple-300 mb-4">Wallet Created Successfully</h2>

            <div className="mb-4">
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Wallet Name
              </label>
              <div className="flex items-center">
                <span className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                  {finalWalletName}
                </span>
                <button
                  onClick={() => copyToClipboard(finalWalletName, "wallet")}
                  className="ml-2 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg relative"
                  title="Copy to clipboard"
                >
                  {copiedField === "wallet" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Hotkey
              </label>
              <div className="flex items-center">
                <span className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white truncate">
                  {finalHotkey}
                </span>
                <button
                  onClick={() => copyToClipboard(finalHotkey, "hotkey")}
                  className="ml-2 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                  title="Copy to clipboard"
                >
                  {copiedField === "hotkey" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex flex-col space-y-3">
              <button
                onClick={downloadCSV}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                Download Wallet Information (CSV)
              </button>

              <button
                onClick={handleClose}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};