export const StatsGrid = ({stats}:{stats:any}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
      <div className="bg-gradient-to-br from-green-900/50 to-blue-900/50 rounded-lg border border-green-500/30 p-6">
        <h3 className="text-lg font-semibold text-green-300 mb-2">Total Earnings</h3>
        <div className="text-3xl font-bold text-green-400">{stats.earnings}</div>
      </div>

      <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 rounded-lg border border-blue-500/30 p-6">
        <h3 className="text-lg font-semibold text-blue-300 mb-2">Active Miners</h3>
        <div className="text-3xl font-bold text-blue-400">{stats.activeMiners}</div>
        {/* <div className="text-sm text-gray-400">{aggregatedStats.activeMiners} TAO | {miners.length - aggregatedStats.activeMiners} Bittensor</div> */}
      </div>

      <div className="bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-lg border border-purple-500/30 p-6">
        <h3 className="text-lg font-semibold text-purple-300 mb-2">Total Hashrate</h3>
        <div className="text-3xl font-bold text-purple-400">{stats.totalHashrate}</div>
        <div className="text-sm text-gray-400">Combined mining power</div>
      </div>

      <div className="bg-gradient-to-br from-orange-900/50 to-red-900/50 rounded-lg border border-orange-500/30 p-6">
        <h3 className="text-lg font-semibold text-orange-300 mb-2">TAO Stake</h3>
        <div className="text-3xl font-bold text-orange-400">{stats.stakes}</div>
        <div className="text-sm text-gray-400">Bittensor Network</div>
      </div>
    </div>
  )
}
