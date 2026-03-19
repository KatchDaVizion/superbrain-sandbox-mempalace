import React, { useRef, useState, useEffect } from 'react';
import { ChevronDown, Check, HardDrive, Cpu, Zap } from 'lucide-react';
import { BrowseModel } from '@/app/types/model';
import { formatSize, getRAMColor } from '@/app/utils/modelHelpers';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';

interface ModelVersionSelectorProps {
  model: BrowseModel;
  selectedVersion: { [key: string]: string };
  onVersionSelect: (modelName: string, version: string) => void;
  theme: string | undefined;
}

export const ModelVersionSelector: React.FC<ModelVersionSelectorProps> = ({
  model,
  selectedVersion,
  onVersionSelect,
  theme
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number | undefined>(undefined);

  const selected = selectedVersion[model.name] || model.versions[0]?.model_name;
  const selectedVersionData = model.versions.find((v) => v.model_name === selected);

  // Measure trigger width
  useEffect(() => {
    if (triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    }
  }, []);

  return (
    <div className="mt-2">
      <label className={`block text-xs font-medium mb-2 ${
        resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'
      }`}>
        Select Version ({model.versions.length} available)
      </label>

      <DropdownMenu>
        <DropdownMenuTrigger
          ref={triggerRef}
          className={`w-full px-4 py-3 rounded-lg text-left flex items-center justify-between transition-all duration-200 shadow-sm hover:shadow-md border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            resolvedTheme === 'dark'
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-100 border-gray-600'
              : 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300'
          }`}
        >
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <HardDrive className={`h-4 w-4 flex-shrink-0 ${
                resolvedTheme === 'dark' ? 'text-blue-400' : 'text-blue-600'
              }`} />
              <span className="font-medium truncate max-w-[90px]">{selected}</span>
            </div>
          </div>
          <div className={`flex items-center space-x-2 text-xs ml-2 ${
            resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}>
            {selectedVersionData && (
              <>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  resolvedTheme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                }`}>
                  {formatSize(selectedVersionData.size)}
                </span>
                {selectedVersionData.estimatedRAMGB && (
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      getRAMColor(selectedVersionData.estimatedRAMGB, theme)
                    } ${resolvedTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}
                  >
                    {selectedVersionData.estimatedRAMGB.toFixed(1)}GB
                  </span>
                )}
              </>
            )}
            <ChevronDown className={`h-4 w-4 ${
              resolvedTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'
            }`} />
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          style={{ width: triggerWidth }} // <-- Dropdown width matches trigger
          className={`max-h-80 overflow-auto border shadow-xl rounded-lg ${
            resolvedTheme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
          }`}
        >
          <div className="p-2">
            <div className={`text-xs font-medium mb-3 px-2 ${
              resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Available Versions for {model.name}
            </div>
            {model.versions.map((version, index) => {
              const isSelected = selected === version.model_name;
              return (
                <DropdownMenuItem
                  key={version.model_name}
                  onClick={() => onVersionSelect(model.name, version.model_name)}
                  className={`flex flex-col gap-2 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? `border mb-2 ${
                          resolvedTheme === 'dark' 
                            ? 'bg-blue-900/20 border-blue-500/30' 
                            : 'bg-blue-50 border-blue-200'
                        }`
                      : `border border-transparent ${
                          resolvedTheme === 'dark' ? 'hover:bg-blue-900/30' : 'hover:bg-gray-50'
                        }`
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center space-x-2">
                      <HardDrive className={`h-4 w-4 ${
                        resolvedTheme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                      }`} />
                      <span className={`font-medium truncate ${
                        resolvedTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        {version.model_name}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="flex items-center space-x-1">
                        <Check className={`h-4 w-4 ${
                          resolvedTheme === 'dark' ? 'text-green-400' : 'text-green-600'
                        }`} />
                        <span className={`text-xs font-medium ${
                          resolvedTheme === 'dark' ? 'text-green-400' : 'text-green-600'
                        }`}>
                          Selected
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <div className={`flex items-center space-x-1 px-2 py-1 rounded ${
                      resolvedTheme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                    }`}>
                      <HardDrive className={`h-3 w-3 ${
                        resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`} />
                      <span>{formatSize(version.size)}</span>
                    </div>

                    {version.estimatedRAMGB && (
                      <div
                        className={`flex items-center space-x-1 px-2 py-1 rounded ${
                          version.estimatedRAMGB < 4
                            ? `${resolvedTheme === 'dark' ? 'bg-green-900/30' : 'bg-green-100'}`
                            : version.estimatedRAMGB < 8
                            ? `${resolvedTheme === 'dark' ? 'bg-yellow-900/30' : 'bg-yellow-100'}`
                            : version.estimatedRAMGB < 16
                            ? `${resolvedTheme === 'dark' ? 'bg-orange-900/30' : 'bg-orange-100'}`
                            : `${resolvedTheme === 'dark' ? 'bg-red-900/30' : 'bg-red-100'}`
                        }`}
                      >
                        <Cpu className={`h-3 w-3 ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
                        <span className={`font-medium ${getRAMColor(version.estimatedRAMGB, theme)}`}>
                          {version.estimatedRAMGB.toFixed(1)}GB RAM
                        </span>
                      </div>
                    )}

                    {version.input_type && (
                      <div className={`flex items-center space-x-1 px-2 py-1 rounded ${
                        resolvedTheme === 'dark' ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-100 text-purple-700'
                      }`}>
                        <span className="font-medium">{version.input_type}</span>
                      </div>
                    )}

                    {version.gpu && (
                      <div className={`flex items-center space-x-1 px-2 py-1 rounded ${
                        resolvedTheme === 'dark' ? 'bg-emerald-900/30 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        <Zap className={`h-3 w-3 ${resolvedTheme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
                        <span className="font-medium">GPU: {version.gpu.vramGB}GB VRAM</span>
                      </div>
                    )}
                  </div>

                  {index < model.versions.length - 1 && (
                    <div className={`border-b -mx-1 mt-2 ${
                      resolvedTheme === 'dark' ? 'border-gray-600/30' : 'border-gray-200'
                    }`}></div>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
