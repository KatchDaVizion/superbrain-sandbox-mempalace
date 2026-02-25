export const getThinkingSectionTheme = (theme: string) => {
  if (theme === 'dark') {
    return {
      container: 'bg-slate-900/40',
      button: 'hover:bg-slate-800/60',
      content: 'bg-slate-900/60',
      text: 'text-slate-400',
      thinkingBg: 'bg-slate-800/80 text-slate-300',
    }
  } else {
    return {
      container: 'bg-slate-50/60',
      button: 'hover:bg-slate-100/80',
      content: 'bg-slate-50/80',
      text: 'text-slate-600',
      thinkingBg: 'bg-white/90 text-slate-700',
    }
  }
}

export const getMessageTheme = (theme: string, role: 'user' | 'assistant',isError = false) => {
  const baseClasses = 'border transition-all duration-200'
  if (isError) {
    return theme === 'dark'
      ? `${baseClasses} bg-red-900/20 border-red-500/30 text-red-100`
      : `${baseClasses} bg-red-50/80 border-red-200 text-red-900`
  }
  if (theme === 'dark') {
    return role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700/50'
  } else {
    return role === 'user'
      ? 'bg-blue-600 text-white' // Keep user messages blue in both themes
      : 'bg-white/90 text-slate-800 border border-slate-200/80 shadow-sm'
  }
}

export const getRightSidebarTheme = (theme: string) => {
  if (theme === 'dark') {
    return {
      systemCard: 'bg-card/50 border-cyan-500/30',
      systemTitle: 'text-cyan-300',
      systemText: 'text-muted-foreground',
      privacyCard: 'bg-gradient-to-br from-green-900/20 to-emerald-900/20 border-green-500/30',
      privacyTitle: 'text-green-300',
      privacyText: 'text-muted-foreground',
      performanceCard: 'bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-500/30',
      performanceTitle: 'text-purple-300',
      performanceText: 'text-muted-foreground',
      modelCard: 'bg-card/50 border-blue-500/30',
      modelTitle: 'text-blue-300',
    }
  } else {
    return {
      systemCard: 'bg-cyan-100/20 border-cyan-300/70',
      systemTitle: 'text-slate-700',
      systemText: 'text-slate-600',
      privacyCard: 'bg-gradient-to-br from-green-50/80 to-emerald-50/80 border-green-300/40',
      privacyTitle: 'text-green-700',
      privacyText: 'text-slate-700',
      performanceCard: 'bg-gradient-to-br from-purple-50/80 to-pink-50/80 border-purple-300/40',
      performanceTitle: 'text-purple-700',
      performanceText: 'text-slate-700',
      modelCard: 'bg-blue-200/30 border-blue-300/50',
      modelTitle: 'text-slate-700',
    }
  }
}

export const getChatHistoryTheme = (theme: string, isSelected: boolean) => {
  if (theme === 'dark') {
    return {
      container: 'bg-card/50',
      thread: isSelected
        ? 'bg-blue-600/10 border border-blue-600/30 shadow-sm'
        : 'hover:bg-muted/50 border border-transparent',
      title: isSelected ? 'text-primary' : 'text-foreground',
      text: 'text-muted-foreground',
    }
  } else {
    return {
      container: 'bg-white/60 border-slate-200/60',
      thread: isSelected
        ? 'bg-blue-50/80 border border-blue-300/60 shadow-sm'
        : 'hover:bg-slate-50/80 border border-transparent',
      title: isSelected ? 'text-blue-700' : 'text-slate-800',
      text: 'text-slate-600',
    }
  }
}

export const getChatInputTheme = (theme: string) => {
    if (theme === "dark") {
      return "bg-slate-800/90 border-slate-700/30";
    } else {
      return "bg-white/80 border-slate-300/50 shadow-sm";
    }
  };
  
  export const getButtonTheme = (
    theme: string,
    variant: "primary" | "secondary" | "destructive"
  ) => {
    if (theme === "dark") {
      switch (variant) {
        case "primary":
          return "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white";
        case "secondary":
          return "bg-slate-700 hover:bg-slate-600 text-slate-200";
        case "destructive":
          return "bg-red-600 hover:bg-red-500 text-white";
      }
    } else {
      switch (variant) {
        case "primary":
          return "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-md hover:shadow-lg";
        case "secondary":
          return "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm hover:shadow-md";
        case "destructive":
          return "bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg";
      }
    }
  };