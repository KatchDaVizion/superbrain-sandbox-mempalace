import { useState, useCallback } from 'react';
import { LocalModel } from '../types/model';

export interface ToastState {
  message: string;
  type: 'success' | 'error';
}

export const useModelsState = () => {
  const [showBrowser, setShowBrowser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<{ [key: string]: string }>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<ToastState | null>(null);
  const [selectedModelForDelete, setSelectedModelForDelete] = useState<LocalModel | null>(null);
  const [showRefreshHint, setShowRefreshHint] = useState(false);
  const [lastDownloadTime, setLastDownloadTime] = useState<number | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 5000);
  }, []);

  const hideRefreshHint = useCallback(() => {
    setShowRefreshHint(false);
  }, []);

  return {
    // State
    showBrowser,
    searchQuery,
    selectedVersion,
    deleteDialogOpen,
    toastMessage,
    selectedModelForDelete,
    showRefreshHint,
    lastDownloadTime,
    
    // Actions
    setShowBrowser,
    setSearchQuery,
    setSelectedVersion,
    setDeleteDialogOpen,
    setToastMessage,
    setSelectedModelForDelete,
    setShowRefreshHint,
    setLastDownloadTime,
    
    // Helper functions
    showToast,
    hideRefreshHint,
  };
};