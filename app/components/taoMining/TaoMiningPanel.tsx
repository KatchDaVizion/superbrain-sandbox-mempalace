import { useEffect, useState } from 'react'
// TAO Mining Panel Component
import { MinerCard } from './MinerCard'
import { BtcliConfig, TaoMiner, WalletConfig, WalletSecrets } from '@/lib/bittensor/types'
// import { MinerSetupWizard } from './MinerSetupWizard'
import { WalletSetupWizard } from './WalletSetupWizard'
import SubnetSelectionWizard from './SubnetSelectionWizard'
import { WalletWithStats } from '@/lib/bittensor/miningService'
import { MinerStats } from '@/lib/bittensor/walletStatsService'
import SubnetModelWizard from './SubnetModelWizard'

export const TaoMiningPanel = ({
  multiMinerUnlocked,
  onMultiMinerPurchase,
}: {
  multiMinerUnlocked: boolean
  onMultiMinerPurchase: () => void
}) => {
  const [wallets, setWallets] = useState<WalletConfig[]>([])
  const [btcliConfig, setBtcliConfig] = useState<BtcliConfig | null>(null)
  const [selectedOs, setSelectedOs] = useState('')
  const [selectedWallet, setSelectedWallet] = useState<WalletConfig | null>(null)
  const [selectedSubnet, setSelectedSubnet] = useState<number | null>(null)
  const [taoMiners, setTaoMiners] = useState<MinerStats[]>([])
  const [showWalletWizard, setShowWalletWizard] = useState(false)
  const [showMinerWizard, setShowMinerWizard] = useState(false)
  const [showModelWizard, setShowModelWizard] = useState(false)
  const [minersRefreshing, setMinersRefreshing] = useState(false)
  // const [multiMinerUnlocked, setMultiMinerUnlocked] = useState(false);
  // const taoMiners = [
  //   { id: 1, model: 'Claude-3.5-Sonnet', status: 'active', earnings: '$42.50', hashrate: '1.2 TH/s' },
  //   { id: 2, model: 'GPT-4', status: 'active', earnings: '$38.75', hashrate: '0.9 TH/s' },
  //   { id: 3, model: 'Ollama-Phi3', status: 'idle', earnings: '$0.00', hashrate: '0.0 TH/s' },
  // ]

  const fetchWallets = async () => {
    const wallets: WalletConfig[] = await window.bittensorWalletAPI.loadConfig()
    setWallets(wallets)

    if (wallets.length > 0 && !selectedWallet) {
      setSelectedWallet(wallets[0])
    }
  }

  const loadBtcliConfig = async () => {
    try {
      const config = await window.bittensorWalletAPI.loadBtcliConfig()
      setBtcliConfig(config)
    } catch (error) {
      console.log('No existing config found')
    }
  }

  const handleOsConfigSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const config: BtcliConfig = {
      os: formData.get('os') as string,
      distro: selectedOs === 'windows' ? (formData.get('distro') as string) : null,
      wslPath: selectedOs === 'windows' ? (formData.get('wslPath') as string) : null,
      btcliPath: formData.get('btcliPath') as string,
      walletsDir: selectedOs === 'windows' ? (formData.get('walletsDir') as string) : null,
    }

    try {
      await window.bittensorWalletAPI.saveBtcliConfig(config)
      setBtcliConfig(config)
    } catch (error) {
      console.error('Failed to save configuration:', error)
    }
  }

  useEffect(() => {
    fetchWallets()
    loadBtcliConfig()
  }, [])

  const fetchWalletStats = async () => {
    try {
      // setIsLoading(true);
      console.log(`TaoMining.fetchWalletStats -> Fetching wallet ${selectedWallet?.walletName} statistics`)

      const wallet: WalletWithStats = await window.bittensorWalletAPI.getWalletStats(selectedWallet?.walletName)
      if (!wallet.walletName) {
        console.log(`TaoMiningPanel->fetchWalletStats: no getWalletStats response has found`)
        return
      }
      console.log(
        `TaoMining.fetchWalletStats -> updating statistics of wallet: ${wallet.walletName} with `,
        wallet.miners
      )
      setTaoMiners(wallet.miners)
    } catch (error) {
      console.error('TaoMining.fetchWalletStats -> Error fetching complete miner data:', error)
    } finally {
      // setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedWallet) return

    fetchWalletStats()

    // Set up interval to call every 30 seconds
    const intervalId = setInterval(fetchWalletStats, 300000)

    // Cleanup function - clears interval when component unmounts
    return () => {
      clearInterval(intervalId)
    }
  }, [selectedWallet])

  const handleWalletChange = (wallet: WalletConfig) => {
    setSelectedWallet(wallet)
  }

  const truncateAddress = (address: string, startChars: number = 4, endChars: number = 4) => {
    if (address.length <= startChars + endChars) return address
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`
  }

  const handleWalletSetup = async (walletName: string, hotkey: string) => {
    // In a real app, this would create the wallet using the bittensor API
    console.log('Setting up wallet with:', { walletName, hotkey })

    // Save to config
    await window.bittensorWalletAPI.saveConfig({ walletName, hotkey, miners: [] })

    await fetchWallets()
    // TODO: set subnet window wizard true
    // setShowMinerWizard(true);
  }

  const handleSubnetRegistration = async (
    walletSecret: WalletSecrets | null,
    subnetId: number | null,
    model: string | null
  ) => {
    if (!walletSecret) {
      console.log(`TaoMiningPanel.handleSubnetRegistration -> no wallet has been passed`)
      return
    }

    const wallet = walletSecret as WalletSecrets
    // In a real app, this would create the wallet using the bittensor API
    console.log(
      `TaoMiningPanel.handleSubnetRegistration -> Setting up miner for ${wallet.walletName} with subnet ${subnetId}`
    )

    try {
      if (selectedSubnet) {
        wallet.miners = [...wallet.miners, { subnetId: selectedSubnet, active: false, model, status: 'registering' }]
        await window.bittensorWalletAPI.saveConfig(wallet)
      }
    } catch (error) {
      console.error('TaoMiningPanel.handleSubnetRegistration -> error saving configuration:', error)
    }

    try {
      if (selectedSubnet) {
        await window.bittensorWalletAPI.registerWallet(wallet, selectedSubnet)
        setTimeout(async () => {
          await fetchWalletStats()
          setMinersRefreshing(false)
        }, 5000)
        // TODO: set subnet window wizard true
        setShowMinerWizard(false)
        setMinersRefreshing(true)
      }
    } catch (error: any) {
      console.error('TaoMiningPanel.handleSubnetRegistration -> Miner setup error:', error)
      // Re-throw the error with a specific message that the wizard can parse
      if (error?.message?.includes('network')) {
        throw new Error('connection_error')
      } else if (error.message.includes('permission')) {
        throw new Error('permission_denied')
      } else {
        throw new Error('mining_failed')
      }
    }
  }

  const handleSubnetSelection = async (subnetId: number) => {
    if (!subnetId) {
      setSelectedSubnet(null)
      setShowModelWizard(false)
      return
    }

    setSelectedSubnet(subnetId)
    setShowModelWizard(true)
  }

  if (!btcliConfig) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">TAO Mining Panel</h2>
        </div>
        <div className="space-y-4 mb-6">
          <form onSubmit={handleOsConfigSubmit} className="space-y-4">
            {/* OS Selection */}
            <div>
              <label htmlFor="os" className="block text-sm font-medium text-gray-300 mb-2">
                Operating System
              </label>
              <select
                id="os"
                name="os"
                required
                value={selectedOs}
                onChange={(e) => setSelectedOs(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select your OS</option>
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
                <option value="macos">macOS</option>
              </select>
            </div>

            {/* Distro Selection (only shown for Windows) */}
            {selectedOs === 'windows' && (
              <div>
                <div>
                  <label htmlFor="distro" className="block text-sm font-medium text-gray-300 mb-2">
                    WSL Distribution Name *
                  </label>
                  <input
                    type="text"
                    id="distro"
                    name="distro"
                    required
                    placeholder="e.g., Ubuntu, Debian, kali-linux"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Enter the exact name of your WSL distribution (run{' '}
                    <code className="bg-gray-900 px-1 rounded">wsl --list</code> to see available distributions)
                  </p>
                </div>

                <div>
                  <label htmlFor="wslPath" className="block text-sm font-medium text-gray-300 mb-2">
                    WSL Executable Path
                  </label>
                  <input
                    type="text"
                    id="wslPath"
                    name="wslPath"
                    placeholder="e.g., C:\\Windows\\System32\\wsl.exe"
                    defaultValue="C:\\Windows\\System32\\wsl.exe"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                  />
                  <p className="mt-1 text-xs text-gray-400">Path to WSL executable (usually the default path)</p>
                </div>

                <div>
                  <label htmlFor="btcliPath" className="block text-sm font-medium text-gray-300 mb-2">
                    btcli Path in WSL *
                  </label>
                  <input
                    type="text"
                    id="btcliPath"
                    name="btcliPath"
                    required
                    placeholder="e.g., /usr/local/bin/btcli"
                    defaultValue="/usr/local/bin/btcli"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                  />
                  <p className="mt-1 text-xs text-gray-400">Path to btcli executable inside your WSL distribution</p>
                </div>

                <div>
                  <label htmlFor="walletsDir" className="block text-sm font-medium text-gray-300 mb-2">
                    Wallets Directory in WSL *
                  </label>
                  <input
                    type="text"
                    id="walletsDir"
                    name="walletsDir"
                    required
                    placeholder="e.g., /home/username/.bittensor/wallets"
                    defaultValue="/home/ubuntu/.bittensor/wallets"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Path to the wallets directory inside your WSL distribution
                  </p>
                </div>
              </div>
            )}

            {selectedOs !== 'windows' && (
              <div>
                <label htmlFor="btcliPath" className="block text-sm font-medium text-gray-300 mb-2">
                  btcli Path *
                </label>
                <input
                  type="text"
                  id="btcliPath"
                  name="btcliPath"
                  required
                  placeholder="e.g., /usr/local/bin/btcli"
                  defaultValue="/usr/local/bin/btcli"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
                <p className="mt-1 text-xs text-gray-400">Path to btcli executable inside your distribution</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              Save Configuration
            </button>
          </form>
        </div>
      </div>
    )
  }
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">TAO Mining Panel</h2>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">Wallet:</span>

          {wallets.length === 0 ? (
            <button
              onClick={() => setShowWalletWizard(true)}
              className="text-blue-400 hover:text-blue-300 font-medium text-sm underline transition-colors"
            >
              Setup Wallet
            </button>
          ) : wallets.length === 1 ? (
            <span className="text-blue-400 font-mono text-sm">
              {truncateAddress(`${wallets[0].walletName}/${wallets[0].hotkey}`)}
            </span>
          ) : (
            <select
              className="text-blue-400 font-mono text-sm bg-gray-700 border border-gray-600 rounded px-2 py-1"
              value={selectedWallet ? `${selectedWallet.walletName}/${selectedWallet.hotkey}` : ''}
              onChange={(e) => {
                const [walletName, hotkey] = e.target.value.split('/')
                const wallet = wallets.find((w) => w.walletName === walletName && w.hotkey === hotkey)
                if (wallet) handleWalletChange(wallet)
              }}
            >
              {wallets.map((wallet) => (
                <option key={`${wallet.walletName}-${wallet.hotkey}`} value={`${wallet.walletName}/${wallet.hotkey}`}>
                  {truncateAddress(`${wallet.walletName}/${wallet.hotkey}`)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {taoMiners.map((miner) => (
          <MinerCard key={miner.subnetId} stats={{ earnings: miner.earnings, stakes: miner.stakes }} miner={miner} />
        ))}
        {minersRefreshing && (
          <p className="text-lg font-semibold text-yellow-400 mb-2">Miner list update is in progress ...</p>
        )}
      </div>

      {!multiMinerUnlocked && (
        <div className="bg-gray-700 rounded-lg p-4 mb-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">🚀 Multi-Miner Plugin</h3>
          <p className="text-gray-300 text-sm mb-3">
            Launch multiple miners simultaneously with our advanced plugin. Includes automated switching and
            optimization.
          </p>
          <button
            onClick={onMultiMinerPurchase}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg font-medium"
          >
            Unlock for $99 (One-time)
          </button>
        </div>
      )}

      {(taoMiners.length == 0 || multiMinerUnlocked) && selectedWallet && (
        <div className="bg-gray-700 rounded-lg p-4 mb-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">Add a Miner for {selectedWallet?.walletName}</h3>
          <button
            onClick={() => setShowMinerWizard(true)}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium"
          >
            Start a Miner
          </button>
        </div>
      )}

      {(wallets.length == 0 || multiMinerUnlocked) && (
        <div className="bg-gray-700 rounded-lg p-4 mb-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">
            {multiMinerUnlocked ? 'Configure Multiple Wallets' : 'Wallet Required'}
          </h3>
          {multiMinerUnlocked ? (
            <p className="text-gray-300 text-sm mb-3">
              Launch multiple miners simultaneously with our advanced plugin. Includes automated switching and
              optimization.
            </p>
          ) : (
            <p className="text-gray-300 text-sm mb-3">
              You need to set up a Bittensor wallet before you can start mining.
            </p>
          )}

          {multiMinerUnlocked ? (
            <button
              onClick={() => setShowWalletWizard(true)}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium"
            >
              Set a New Wallet
            </button>
          ) : (
            <button
              onClick={() => setShowWalletWizard(true)}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg font-medium"
            >
              Setup Wallet
            </button>
          )}
        </div>
      )}

      <WalletSetupWizard
        isOpen={showWalletWizard}
        onClose={() => setShowWalletWizard(false)}
        onFinish={handleWalletSetup}
      />

      <SubnetSelectionWizard
        isOpen={showMinerWizard}
        wallet={selectedWallet}
        onClose={() => setShowMinerWizard(false)}
        onFinish={handleSubnetSelection}
      />

      <SubnetModelWizard
        isOpen={showModelWizard}
        wallet={selectedWallet}
        subnetId={selectedSubnet}
        onClose={() => setShowModelWizard(false)}
        onFinish={handleSubnetRegistration}
      />
    </div>
  )
}
