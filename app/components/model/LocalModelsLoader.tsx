import { Loader2 } from 'lucide-react';
import React from 'react';

const LocalModelsLoader: React.FC<{ theme?: string }> = ({ theme }) =>{
    return (
        <div className="flex-1 flex items-center justify-center h-full">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 
            className={`h-8 w-8 animate-spin ${
              theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
            }`} 
          />
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
            Loading local models...
          </p>
        </div>
      </div>
    );
};

export default LocalModelsLoader;