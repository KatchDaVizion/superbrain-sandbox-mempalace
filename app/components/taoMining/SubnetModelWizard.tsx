import { Subnet, WalletSecrets } from '@/lib/bittensor/types';
import React, { useEffect, useState } from 'react';

interface SubnetModelWizardProps {
    isOpen: boolean;
    wallet: WalletSecrets | null;
    subnetId: number | null;
    onClose: () => void;
    onFinish: (wallet: WalletSecrets | null, subnetId: number | null, model: string | null ) => Promise<void>;
}

const SubnetModelWizard: React.FC<SubnetModelWizardProps> = ({ isOpen, wallet, subnetId, onFinish, onClose }) => {
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [registrationCost, setRegistrationCost] = useState<number>(0);
    const [walletBalance, setWalletBalance] = useState<number>(0);
    const [isCheckingBalance, setIsCheckingBalance] = useState<boolean>(false);

    useEffect(() => {
        if (isOpen) {
            // Reset states when wizard opens
            setError(null);
            setSuccess(null);
            setModelName('');
            setRegistrationCost(0);
            setWalletBalance(0);
            checkRegistrationCostAndBalance();
        }
    }, [isOpen]);

    const [modelName, setModelName] = useState('');
    const handleModelNameChange = (e) => {
        setModelName(e.target.value);
    };

    const checkRegistrationCostAndBalance = async () => {
        if (!wallet || !subnetId) return;
        
        setIsCheckingBalance(true);
        setError(null);
        
        try {
            // Get subnet registration cost
            const costResult = await window.bittensorWalletAPI.executeCommand(
                `btcli subnets price --netuids ${subnetId} --current`
            );
            console.log(`SubnetModelWizard.checkRegistrationCostAndBalance - subnet registration cost `, costResult);
            const costData = JSON.parse(costResult);
            
            // Extract cost from nested structure
            const subnetInfo = costData[subnetId.toString()];
            const cost = subnetInfo?.stats?.current_price || 0;
            setRegistrationCost(cost);

            // Get wallet balance
            const balanceResult = await window.bittensorWalletAPI.executeCommand(
                `btcli w balance --wallet-name ${wallet.walletName}`,
                true
            );
            console.log(`SubnetModelWizard.checkRegistrationCostAndBalance - btcli w balance --wallet-name ${wallet.walletName} --json-out`)
            console.log(`SubnetModelWizard.checkRegistrationCostAndBalance - wallet balance `, balanceResult);
            const balanceData = JSON.parse(balanceResult);
            // Extract free balance from nested structure
            const freeBalance = balanceData.balances?.[wallet.walletName]?.free || 0;
            setWalletBalance(freeBalance);

            if (freeBalance < cost) {
                setError(`You need ${cost.toFixed(4)} TAO to register on this subnet. Please fund your wallet here.`);
            } else {
                setSuccess(`Your balance: ${freeBalance.toFixed(4)} TAO | Registration cost: ${cost.toFixed(4)} TAO`);
            }
        } catch (err) {
            console.error('Error checking balance or registration cost:', err);
            setError('Failed to check wallet balance or registration cost. Please try again.');
        } finally {
            setIsCheckingBalance(false);
            setIsLoading(false);
        }
    };

    const handleSubnetConfirm = async (_) => {
        setIsLoading(true);
        setError(null);
        setSuccess(null);

        try {
            // Call the parent's handler
            await onFinish(wallet, subnetId, modelName);
            setSuccess(`subnet ${subnetId} registration request has been issued. The wizard will close shortly...`);

            // Close the wizard after a brief success message
            setTimeout(() => {
                onClose();
            }, 3000);
        } catch (err: unknown) {
            // Handle specific error cases with user-friendly messages
            const errorMessage = err instanceof Error ? err.message : String(err);

            if (errorMessage.includes('insufficient')) {
                setError("Insufficient TAO balance. Please add funds to your wallet to start mining.");
            } else if (errorMessage.includes('connection')) {
                setError("Network connection failed. Please check your internet connection and try again.");
            } else if (errorMessage.includes('permission')) {
                setError("Permission denied. The application needs appropriate permissions to start mining.");
            } else if (errorMessage.includes('resource')) {
                setError("System resources unavailable. Please close other resource-intensive applications and try again.");
            } else {
                setError("Failed to start miner. Please try again or contact support if the problem persists.");
            }

            console.error("SubnetModelWizard.handleSubnetConfirm -> Miner setup error:", err);
        }
    };

    const hasSufficientBalance = walletBalance >= registrationCost;

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg border border-purple-500/30 p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <h2 className="text-xl font-semibold text-purple-300 mb-4">Network Join Requirements</h2>

                {/* Loading state */}
                {isCheckingBalance && (
                    <div className="mb-4 p-3 bg-blue-900/30 border border-blue-500/50 rounded-lg">
                        <p className="text-blue-200 text-sm">Checking wallet balance and registration cost. It may take some time ...</p>
                    </div>
                )}

                {/* Error message */}
                {error && !isCheckingBalance && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
                        <p className="text-red-200 text-sm">{error}</p>
                        <button
                            onClick={() => {}}
                            className="text-red-300 hover:text-red-100 underline text-xs mt-1"
                        >
                            Transfer TAO to your wallet
                        </button>
                    </div>
                )}

                {/* Success message */}
                {success && !isCheckingBalance && (
                    <div className="mb-4 p-3 bg-green-900/30 border border-green-500/50 rounded-lg">
                        <p className="text-green-200 text-sm">{success}</p>
                    </div>
                )}

                <div className="overflow-y-auto flex-grow mb-4">
                    <div className="space-y-4">
                        <div className="bg-gray-800 rounded-lg p-4 border border-purple-500/50">
                            <label htmlFor="modelName" className="block text-sm font-medium text-white mb-2">
                                Model Name (Optional)
                            </label>
                            <input
                                type="text"
                                id="modelName"
                                value={modelName}
                                onChange={handleModelNameChange}
                                placeholder="Enter a custom model name for this subnet..."
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Leave empty if you are not using any
                            </p>
                        </div>

                        {/* Balance and Cost Information */}
                        {!isCheckingBalance && (
                            <div className="bg-gray-800 rounded-lg p-4 border border-purple-500/50">
                                <h3 className="text-sm font-medium text-white mb-2">Registration Information</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-400">Wallet Balance:</p>
                                        <p className="text-white font-mono">{walletBalance.toFixed(4)} TAO</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400">Registration Cost:</p>
                                        <p className="text-white font-mono">{registrationCost.toFixed(4)} TAO</p>
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <p className={`text-sm font-medium ${
                                        hasSufficientBalance ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                        {hasSufficientBalance 
                                            ? '✓ Sufficient balance for registration' 
                                            : '✗ Insufficient balance for registration'
                                        }
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-700">
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md mr-2 transition-colors"
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    {hasSufficientBalance && !isCheckingBalance && (
                        <button
                            type="button"
                            onClick={handleSubnetConfirm}
                            disabled={isLoading}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Registering...
                                </>
                            ) : (
                                'Join Subnet'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SubnetModelWizard;