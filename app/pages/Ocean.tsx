import { useState } from 'react'
import DashboardLayout from '../components/shared/DashboardLayout'
import { Construction, Rocket, Clock, Zap } from 'lucide-react'

const Ocean = () => {
  const [release, setRelease] = useState(false) // Set to true when feature is ready
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [localAIOnly, setLocalAIOnly] = useState(false)
  const currentUser = ''

  const [datasets, setDatasets] = useState([
    {
      name: 'Financial Analytics Dataset',
      earnings: '$127.50',
      oceanDID: 'did:op:123...abc',
      status: 'Active',
    },
    {
      name: 'ML Training Data',
      earnings: '$89.20',
      oceanDID: 'did:op:456...def',
      status: 'Pending',
    },
  ])

  const [newDataset, setNewDataset] = useState({
    name: '',
    url: '',
  })

  const handleSubmitDataset = (e: React.FormEvent) => {
    e.preventDefault()
    if (newDataset.name && newDataset.url) {
      const oceanDID = `did:op:${Math.random().toString(36).substr(2, 9)}...${Math.random().toString(36).substr(2, 3)}`
      setDatasets([
        ...datasets,
        {
          name: newDataset.name,
          earnings: '$0.00',
          oceanDID,
          status: 'Processing',
        },
      ])
      setNewDataset({ name: '', url: '' })
    }
  }

  // Under Development UI
  if (!release) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex items-center justify-center px-4">
          <div className="max-w-2xl mx-auto text-center">
            {/* Animated Construction Icon */}
            <div className="relative mb-8">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/25 animate-pulse">
                <Construction size={48} className="text-white" />
              </div>
              <div className="absolute -top-2 -right-2">
                <div className="bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-sm font-bold animate-bounce">
                  BETA
                </div>
              </div>
            </div>

            {/* Main Message */}
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-6">
              Feature Under Development
            </h1>

            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              We're building something amazing! The Ocean Protocol integration is currently in development and will be
              released soon.
            </p>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 backdrop-blur-sm">
                <Rocket className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">Data Monetization</h3>
                <p className="text-gray-400 text-sm">Sell your AI datasets securely on Ocean Market</p>
              </div>

              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 backdrop-blur-sm">
                <Zap className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">Decentralized</h3>
                <p className="text-gray-400 text-sm">Leverage blockchain technology for data transactions</p>
              </div>

              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 backdrop-blur-sm">
                <Clock className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">Coming Soon</h3>
                <p className="text-gray-400 text-sm">Estimated release: Q1 2026</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>Development Progress</span>
                <span>75%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: '75%' }}
                ></div>
              </div>
            </div>

            {/* Notify Me Button */}
            <button
              onClick={() => {
                // Add notification logic here
                alert("We'll notify you when Ocean Protocol integration is released!")
              }}
              className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-2xl shadow-blue-500/25 hover:shadow-blue-500/40"
            >
              <Rocket size={20} className="mr-3 group-hover:animate-bounce" />
              Notify Me on Launch
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400 to-purple-500 opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
            </button>

            {/* Footer Note */}
            <p className="text-gray-500 text-sm mt-8">
              Working hard to bring you the best data monetization experience
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Released UI (Your original code)
  return (
    <DashboardLayout>
      <div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dataset Upload Form */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 className="text-2xl font-bold mb-6 text-blue-400">🌊 Ocean Protocol Miner</h2>

            <form onSubmit={handleSubmitDataset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Dataset Name</label>
                <input
                  type="text"
                  value={newDataset.name}
                  onChange={(e) => setNewDataset({ ...newDataset, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter dataset name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Dataset URL</label>
                <input
                  type="url"
                  value={newDataset.url}
                  onChange={(e) => setNewDataset({ ...newDataset, url: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="https://example.com/dataset.csv"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Submit to Ocean Market
              </button>
            </form>
          </div>

          {/* Datasets List */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h3 className="text-xl font-bold mb-4 text-green-400">📊 Your Datasets</h3>

            <div className="space-y-3">
              {datasets.map((dataset, index) => (
                <div key={index} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-white">{dataset.name}</h4>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        dataset.status === 'Active'
                          ? 'bg-green-600 text-green-100'
                          : dataset.status === 'Pending'
                            ? 'bg-yellow-600 text-yellow-100'
                            : 'bg-blue-600 text-blue-100'
                      }`}
                    >
                      {dataset.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-300 space-y-1">
                    <div>
                      Earnings: <span className="text-green-400 font-medium">{dataset.earnings}</span>
                    </div>
                    <div className="font-mono text-xs text-gray-400">Ocean DID: {dataset.oceanDID}</div>
                  </div>
                </div>
              ))}
            </div>

            {datasets.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                No datasets uploaded yet. Submit your first dataset to get started!
              </div>
            )}
          </div>
        </div>

        {/* Ocean Market Statistics */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="text-2xl font-bold text-blue-400">$216.70</div>
            <div className="text-sm text-gray-400">Total Ocean Earnings</div>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="text-2xl font-bold text-green-400">{datasets.length}</div>
            <div className="text-sm text-gray-400">Active Datasets</div>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="text-2xl font-bold text-purple-400">47</div>
            <div className="text-sm text-gray-400">Downloads This Month</div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Ocean
