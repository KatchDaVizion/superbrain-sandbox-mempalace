// --------------------
// Local Model Interface
// --------------------
export interface LocalModel {
  details: any;
  model: string;
  name: string;
  size: string;
  parameters: string;
  ram?: string;
  description?: string;
  speed?: string;
  specialty?: string;
  status: "installed" | "available" | "unknown";
  active?: boolean;
  type?: 'text' | 'embedding' | 'vision';
  isEmbedding?: boolean; // Add this to identify embedding models
}

// --------------------
// Browse Model Interface
// --------------------
export interface GPUInfo {
  vramGB: number;
  cuda: boolean;
  cores: number;
}

export interface ModelVersion {
  model_name: string;
  size: string;
  context: string;
  input_type: string;
  id?: string;
  updated?: string;
  sizeGB?: number;
  contextTokens?: number;
  contextGB?: number;
  estimatedRAMGB?: number;
  gpu?: GPUInfo;
  passesFilter?: boolean;
  parameters?: string;
  arch?: string;
  quantization?: string;
}

export interface BrowseModel {
  name: string;
  description?: string;
  versions: ModelVersion[];
  type?: 'text' | 'embedding'; // Add this to distinguish model types
  parameters?: string;
}

export interface ToastState {
  message: string;
  type: 'success' | 'error';
}

export interface ModelsState {
  showBrowser: boolean;
  searchQuery: string;
  selectedVersion: { [key: string]: string };
  deleteDialogOpen: boolean;
  toastMessage: ToastState | null;
  selectedModelForDelete: LocalModel | null;
  showRefreshHint: boolean;
  lastDownloadTime: number | null;
}

export interface ModelsActions {
  setShowBrowser: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setSelectedVersion: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  setDeleteDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setToastMessage: React.Dispatch<React.SetStateAction<ToastState | null>>;
  setSelectedModelForDelete: React.Dispatch<React.SetStateAction<LocalModel | null>>;
  setShowRefreshHint: React.Dispatch<React.SetStateAction<boolean>>;
  setLastDownloadTime: React.Dispatch<React.SetStateAction<number | null>>;
}