import { useState, useEffect } from 'react'
import DashboardLayout from '../components/shared/DashboardLayout'
import { EducationalSection } from '../components/taoMining/EducationalSection'
import { TaoMiningPanel } from '../components/taoMining/TaoMiningPanel'
import { StatsGrid } from '../components/taoMining/StatsGrid'
import { MiningLogs } from '../components/taoMining/MiningLogs'

const Mining = () => {
  const [multiMinerUnlocked, setMultiMinerUnlocked] = useState(false)
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    earnings: `0 TAO`,
    hashrate: '0 S',
    activeMiners: 0,
    totalMiners: 0,
    stakes: `0 TAO`
  });

  useEffect(() => {
    // Function to fetch data
    const fetchOverallStats = async () => {
      try {
        setIsLoading(true);
        const stats: any = await window.bittensorWalletAPI.getOverallStats();
        const aggregated = {
          earnings: `${stats.totalEarnings} TAO`,
          hashrate: '0 S',
          activeMiners: stats.activeMiners,
          totalMiners: 0,
          stakes: `${stats.totalStakes} TAO`
        }
        setStats(aggregated);
      } catch (error) {
        console.error('Error fetching complete miner data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Call immediately when component mounts
    fetchOverallStats();

    // Set up interval to call every 30 seconds
    const intervalId = setInterval(fetchOverallStats, 300000);

    // Cleanup function - clears interval when component unmounts
    return () => {
      clearInterval(intervalId);
    };
  }, []); // Empty dependency array means this effect runs only on mount and unmount

  const handleMultiMinerPurchase = () => {
    alert('Multi-miner plugin purchase: $99. This would redirect to payment processing...')
    setMultiMinerUnlocked(true);
  }

  return (
    <DashboardLayout>
      <div>
        <div className="mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">TAO Mining Dashboard</h1>
            <p className="text-gray-400">Monitor your TAO mining operations and Bittensor network participation</p>
          </div>

          <EducationalSection />
          <StatsGrid stats={stats} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <TaoMiningPanel
              multiMinerUnlocked={multiMinerUnlocked}
              onMultiMinerPurchase={handleMultiMinerPurchase}
            />

            {/* <BittensorMiningPanel
              bittensorMiningActive={bittensorMiningActive}
              setMiningStatus={setBittensorMiningActive}
              subscriptionActive={subscriptionActive}
              onBittensorToggle={handleBittensorToggle}
            /> */}
          </div>

          <MiningLogs />
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Mining
