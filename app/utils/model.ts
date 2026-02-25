export const getStatusColor = (status: string, theme: string | undefined) => {
    switch (status) {
      case 'installed':
        return `${theme === 'dark' ? 'text-green-400 bg-green-900/20 border-green-800' : 'text-green-600 bg-green-50 border-green-200'}`;
      case 'available':
        return `${theme === 'dark' ? 'text-blue-400 bg-blue-900/20 border-blue-800' : 'text-blue-600 bg-blue-50 border-blue-200'}`;
      default:
        return `${theme === 'dark' ? 'text-gray-400 bg-gray-900/20 border-gray-800' : 'text-gray-600 bg-gray-50 border-gray-200'}`;
    }
  };
  
  export const formatSize = (size: string): string => {
    if (!size) return 'Unknown';
    return size.replace(/(\d)([KMGT]B)/, '$1 $2');
  };
  
  export const getRAMColor = (ramGB: number | undefined, theme: string | undefined): string => {
    if (!ramGB) return `${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`;
    if (ramGB < 4) return `${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`;
    if (ramGB < 8) return `${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'}`;
    if (ramGB < 16) return `${theme === 'dark' ? 'text-orange-400' : 'text-orange-600'}`;
    return `${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`;
  };