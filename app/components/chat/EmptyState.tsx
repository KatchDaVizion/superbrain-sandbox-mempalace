import React from 'react';
import { Shield, MessageCircle, Zap, Lock, PlayCircle } from 'lucide-react';
import { useTheme } from 'next-themes';

interface EmptyStateProps {
  selectedModel: string | null;
  onStartChat: () => void;
}

const EmptyState = ({ selectedModel, onStartChat }: EmptyStateProps) => {
  const { theme } = useTheme();
  
  const features = [
    {
      icon: <Lock className="w-4 h-4" />,
      title: "Private & Secure",
      description: "Your conversations are processed locally and never leave your device"
    },
    {
      icon: <Zap className="w-4 h-4" />,
      title: "Fast Processing", 
      description: "Get instant responses with optimized local AI models"
    },
    {
      icon: <MessageCircle className="w-4 h-4" />,
      title: "Natural Conversations",
      description: "Chat naturally with context-aware AI assistance"
    }
  ];

  return (
    <div className="h-full flex flex-col justify-center items-center px-4 py-8">
      <div className="max-w-3xl text-center space-y-6">
        {/* Main Icon */}
        <div className="relative mx-auto">
          <div className="p-4 bg-gradient-to-br from-blue-500/10 to-emerald-500/10 rounded-2xl w-fit mx-auto border border-blue-500/20">
            <Shield className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        {/* Welcome Text */}
        <div className="space-y-3">
          <h2 className={`text-3xl font-bold ${
            theme === 'dark' ? 'text-white' : 'text-slate-900'
          }`}>
            Welcome to {selectedModel || 'SuperBrain AI'}
          </h2>
          <p className={`leading-relaxed ${
            theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
          }`}>
            Start a secure conversation and experience intelligent AI assistance. 
            Your privacy is our priority.
          </p>
        </div>

        {/* Features */}
        <div className="flex items-center justify-center gap-6">
          {features.map((feature, index) => (
            <div key={index} className={`flex flex-col items-center text-center p-4 rounded-xl transition-colors min-w-0 flex-1 ${
              theme === 'dark' 
                ? 'bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/30' 
                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200/50'
            }`}>
              <div className="p-2 bg-blue-500/10 rounded-lg mb-3">
                {React.cloneElement(feature.icon, { 
                  className: "w-4 h-4 text-blue-400" 
                })}
              </div>
              <div>
                <h4 className={`text-sm font-semibold mb-1 ${
                  theme === 'dark' ? 'text-slate-200' : 'text-slate-700'
                }`}>
                  {feature.title}
                </h4>
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Action Button */}
        <div className="space-y-4">
          {selectedModel ? (
            <button
              onClick={onStartChat}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] hover:shadow-lg flex items-center justify-center space-x-3 group active:scale-[0.98]"
            >
              <PlayCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Start Conversation</span>
            </button>
          ) : (
            <div className={`w-full px-6 py-4 rounded-xl font-medium text-center border ${
              theme === 'dark' 
                ? 'bg-slate-800/50 text-slate-400 border-slate-600/30'
                : 'bg-slate-100 text-slate-600 border-slate-300/30'
            }`}>
              <div className="flex items-center justify-center space-x-2">
                <Shield className="w-4 h-4" />
                <span>Please select a model first</span>
              </div>
            </div>
          )}
          
          <p className={`text-xs ${
            theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
          }`}>
            Ready to chat? {selectedModel ? 'Click the button above to begin your secure conversation.' : 'Select a model to get started.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;