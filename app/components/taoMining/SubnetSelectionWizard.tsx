import { Subnet, WalletSecrets } from '@/lib/bittensor/types';
import React, { useEffect, useState } from 'react';

interface SubnetSelectionWizardProps {
    isOpen: boolean;
    wallet: WalletSecrets | null;
    onClose: () => void;
    onFinish: (subnetId: number) => Promise<void>;
}

const SubnetSelectionWizard: React.FC<SubnetSelectionWizardProps> = ({ isOpen, wallet, onFinish, onClose }) => {
    const [subnets, setSubnets] = useState<Subnet[]>([]);
    const [expandedSubnet, setExpandedSubnet] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            // Reset states when wizard opens
            setError(null);
            setSuccess(null);
            setIsLoading(true);

            // Simulate loading subnets from an API
            const loadSubnets = async () => {
                try {
                    // In a real app, you would fetch this from an API
                    const response = await window.bittensorWalletAPI.getSubnets();
                    setSubnets(response);

                    // Using sample data for demonstration
                    // setSubnets(sampleSubnets);
                    setIsLoading(false);
                } catch (err) {
                    setError("Failed to load subnets. Please check your connection and try again.");
                    setIsLoading(false);
                }
            };

            loadSubnets();
        }
    }, [isOpen]);

    const handleSubnetSelect = async (netuid) => {
        setError(null);
        setSuccess(null);

        try {
            // Call the parent's handler
            await onFinish(netuid);
            setSuccess(`subnet ${netuid} has been selected. please wait for next step...`);

            // Close the wizard after a brief success message
            setTimeout(() => {
                onClose();
            }, 1000);
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

            console.error("Miner setup error:", err);
        }
    };

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg border border-purple-500/30 p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <h2 className="text-xl font-semibold text-purple-300 mb-4">Select Bittensor Subnet</h2>

                {/* Error message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
                        <p className="text-red-200 text-sm">{error}</p>
                    </div>
                )}

                {/* Success message */}
                {success && (
                    <div className="mb-4 p-3 bg-green-900/30 border border-green-500/50 rounded-lg">
                        <p className="text-green-200 text-sm">{success}</p>
                    </div>
                )}

                <div className="overflow-y-auto flex-grow mb-4">
                    <div className="space-y-4">
                        {subnets.map((subnet, index) => (
                            <div key={index} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                                {/* Header */}
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-medium text-white">{subnet.name} - {subnet.netuid}</h3>
                                        <p className="text-gray-300 text-sm mt-1">{subnet.description}</p>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        <button
                                            onClick={() => setExpandedSubnet(expandedSubnet === subnet.netuid ? null : subnet.netuid)}
                                            className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors"
                                        >
                                            {expandedSubnet === subnet.netuid ? 'Less' : 'Details'}
                                        </button>
                                        <button
                                            onClick={() => handleSubnetSelect(subnet.netuid)}
                                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors"
                                        >
                                            Select
                                        </button>
                                    </div>
                                </div>

                                {/* Requirements Summary */}
                                {subnet.requirements_summary && (
                                    <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded">
                                        <p className="text-yellow-200 text-xs">
                                            ⚠️ {subnet.requirements_summary}
                                        </p>
                                    </div>
                                )}

                                {/* Expandable Details */}
                                {expandedSubnet === subnet.netuid && (
                                    <div className="mt-4 space-y-3 animate-fadeIn">
                                        {/* Configurations */}
                                        {subnet.configurations && subnet.configurations.length > 0 && (
                                            <div>
                                                <h4 className="text-white text-sm font-medium mb-2">Configurations</h4>
                                                <div className="space-y-2">
                                                    {subnet.configurations.map((config, configIndex) => (
                                                        <div key={configIndex} className="flex items-center justify-between bg-gray-600 p-2 rounded">
                                                            <span className="text-gray-200 text-sm">{config.label}</span>
                                                            <a
                                                                href={config.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-400 hover:text-blue-300 text-xs"
                                                            >
                                                                View Guide →
                                                            </a>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Critical Dependencies */}
                                        {subnet.critical_dependencies && subnet.critical_dependencies.length > 0 && (
                                            <div>
                                                <h4 className="text-white text-sm font-medium mb-2">Dependencies</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {subnet.critical_dependencies.map((dep, depIndex) => (
                                                        <div key={depIndex} className="bg-red-700 px-3 py-1 rounded-full">
                                                            <span className="text-white text-xs">{dep.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-700">
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md mr-2 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SubnetSelectionWizard;