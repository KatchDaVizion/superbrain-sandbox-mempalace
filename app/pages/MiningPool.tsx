import DashboardLayout from "../components/shared/DashboardLayout";
import { usePoolStats } from "../hooks/usePoolStats";

const STATUS_BADGE: Record<string, { dot: string; label: string; bg: string }> = {
  live: { dot: "bg-green-400", label: "Live", bg: "bg-green-900/50 border-green-500" },
  connecting: { dot: "bg-yellow-400 animate-pulse", label: "Connecting...", bg: "bg-yellow-900/50 border-yellow-500" },
  offline: { dot: "bg-red-400", label: "Offline", bg: "bg-red-900/50 border-red-500" },
  "not-configured": { dot: "bg-gray-400", label: "Not Configured", bg: "bg-gray-700/50 border-gray-500" },
};

function StatCard({ value, label, color, loading }: { value: string; label: string; color: string; loading?: boolean }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className={`text-2xl font-bold ${color}`}>
        {loading ? <div className="h-8 w-24 bg-gray-700 rounded animate-pulse" /> : value}
      </div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  );
}

const MiningPool = () => {
  const { stats, poolInfo, connectionStatus, configured, loading } = usePoolStats();
  const badge = STATUS_BADGE[connectionStatus];

  // ─── Not Configured ───
  if (!configured) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <h1 className="text-3xl font-bold text-blue-400">Mining Pool Dashboard</h1>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${badge.bg}`}>
              <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
          </div>

          <div className="max-w-2xl mx-auto mt-12">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
              <h2 className="text-2xl font-bold text-blue-400 mb-4">Configure Pool Connection</h2>
              <p className="text-gray-300 mb-6">
                Set up your pool API connection in <code className="bg-gray-700 px-2 py-0.5 rounded text-blue-300">.env</code> to see live pool statistics.
              </p>

              <div className="bg-gray-900 rounded-lg p-4 text-left font-mono text-sm mb-6">
                <p className="text-gray-500 mb-1"># Copy .env.example to .env and set:</p>
                <p className="text-green-400">VITE_POOL_API_URL=https://superbrain.tail083cac.ts.net/api</p>
              </div>

              <div className="text-sm text-gray-400 space-y-1">
                <p>1. Copy <code className="text-gray-300">.env.example</code> to <code className="text-gray-300">.env</code></p>
                <p>2. Set <code className="text-gray-300">VITE_POOL_API_URL</code> to your pool backend URL</p>
                <p>3. Restart the dev server</p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isLive = connectionStatus === "live";
  const dash = "\u2014"; // em-dash placeholder

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* ─── Header + Status Badge ─── */}
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-3xl font-bold text-blue-400">Mining Pool Dashboard</h1>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${badge.bg}`}>
            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>

        {/* ─── Offline Banner ─── */}
        {connectionStatus === "offline" && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6 text-red-300 text-sm">
            Pool API is unreachable. Stats will refresh automatically when the connection is restored.
          </div>
        )}

        {/* ─── Stats Cards ─── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            value={isLive ? `${stats!.total_stake_tao.toFixed(4)} TAO` : dash}
            label="Total Pool Stake"
            color="text-blue-400"
            loading={loading}
          />
          <StatCard
            value={isLive ? String(stats!.active_hotkeys) : dash}
            label="Active Hotkeys"
            color="text-green-400"
            loading={loading}
          />
          <StatCard
            value={isLive ? `${stats!.total_earned_tao.toFixed(4)} TAO` : dash}
            label="Total Pool Earnings"
            color="text-purple-400"
            loading={loading}
          />
          <StatCard
            value={isLive ? `${stats!.owner_fee_percent}%` : dash}
            label="Pool Fee"
            color="text-yellow-400"
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ─── Pool Configuration ─── */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 className="text-2xl font-bold mb-6 text-blue-400">Pool Configuration</h2>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Pool Name:</span>
                <span className="text-white font-medium">
                  {poolInfo?.name ?? dash}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">API URL:</span>
                <span className="text-blue-400 font-mono text-sm truncate max-w-[220px]">
                  {import.meta.env.VITE_POOL_API_URL}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Subnet:</span>
                <span className="text-white font-medium">
                  {poolInfo ? `SN${poolInfo.subnet_uid}` : dash}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Network:</span>
                <span className="text-white font-medium">
                  {poolInfo?.network ?? dash}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Distribution Model:</span>
                <span className="text-white font-medium">
                  {poolInfo?.distribution_model ?? dash}
                </span>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-gray-700">
              <button
                disabled
                className="w-full bg-gray-600 text-gray-400 font-medium py-2 px-4 rounded-lg cursor-not-allowed"
                title="Pool join/leave is handled in the TPN Setup Wizard"
              >
                Join / Leave Pool — Coming Soon
              </button>
            </div>
          </div>

          {/* ─── Pool Information ─── */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 className="text-2xl font-bold mb-6 text-green-400">Pool Information</h2>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Minimum Payout:</span>
                <span className="text-green-400 font-medium">
                  {poolInfo ? `${poolInfo.min_payout_tao} TAO` : dash}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-300">Pending Payouts:</span>
                <span className="text-yellow-400 font-medium">
                  {isLive ? `${stats!.pending_payouts_tao.toFixed(4)} TAO` : dash}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-300">Last Indexed Block:</span>
                <span className="text-blue-400 font-medium">
                  {isLive && stats!.last_index_block
                    ? stats!.last_index_block.toLocaleString()
                    : dash}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-300">Total Users:</span>
                <span className="text-purple-400 font-medium">
                  {isLive ? String(stats!.total_users) : dash}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Pool Members Summary ─── */}
        <div className="mt-6 bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-bold mb-4 text-blue-400">Pool Members</h2>

          {isLive ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{stats!.active_hotkeys}</div>
                <div className="text-sm text-gray-400">Active Hotkeys on Subnet</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">{stats!.total_users}</div>
                <div className="text-sm text-gray-400">Total Users</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-400">{stats!.total_hotkeys}</div>
                <div className="text-sm text-gray-400">Total Hotkeys</div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-center py-4">
              {loading ? (
                <div className="flex justify-center gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 w-40 bg-gray-700 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                "Pool data unavailable"
              )}
            </div>
          )}

          <p className="text-gray-500 text-sm mt-4 text-center">
            Individual worker details coming soon
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MiningPool;
