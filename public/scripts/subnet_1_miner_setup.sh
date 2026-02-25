#!/bin/bash
# setup_miner_revised.sh - Automated Apex Miner Setup for WSL/Linux (Following Official Docs)
set -e  # Exit on error
echo "=== Apex Miner Automated Setup (Revised) ==="
# Configuration defaults
DEFAULT_WALLET_NAME="default"
DEFAULT_HOTKEY_NAME="default"
DEFAULT_WALLET_PATH="$HOME/.bittensor/wallets"
REPO_NAME="apex-miner-base"
MINER_DIR="$HOME/$REPO_NAME"
# CONFIG_FILE="$MINER_DIR/miner_config.json" # No longer strictly needed as we use the official repo's config/cli

# Function to expand ~ in paths
expand_path() {
    echo "${1/#\~/$HOME}"
}

# --- Step 1: Update system and Install basic dependencies ---
echo "[1/8] Updating system packages and installing dependencies..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget jq build-essential python3 python3-pip python3-venv

# --- Step 2: Install CUDA (if using NVIDIA GPU) ---
read -p "Do you have an NVIDIA GPU and want to install CUDA? (y/n): " install_cuda
if [[ $install_cuda == "y" ]]; then
    echo "[2/8] Installing CUDA 11.8..."
    wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-wsl-ubuntu.pin
    sudo mv cuda-wsl-ubuntu.pin /etc/apt/preferences.d/cuda-repository-pin-600
    sudo apt-key adv --fetch-keys https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/3bf863cc.pub
    sudo add-apt-repository "deb https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/ /"
    sudo apt update
    # Note: Using the single metapackage for 11.8 for simplicity
    sudo apt install -y cuda-cudart-11-8 cuda-compiler-11-8 --no-install-recommends
    
    # Check if lines already exist before appending
    grep -q 'export PATH=/usr/local/cuda-11.8/bin:$PATH' ~/.bashrc || echo 'export PATH=/usr/local/cuda-11.8/bin:$PATH' >> ~/.bashrc
    grep -q 'export LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH' ~/.bashrc || echo 'export LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
    
    source ~/.bashrc
    echo "   (Source your shell config or restart your terminal for CUDA paths to take effect.)"
else
    echo "[2/8] Skipping CUDA installation (CPU-only mode)"
fi

# --- Step 3: Clone the official Apex Miner repository ---
echo "[3/8] Cloning the official Apex Miner repository..."
if [ -d "$MINER_DIR" ]; then
    echo "   Directory $MINER_DIR already exists. Pulling latest changes..."
    cd "$MINER_DIR"
    git pull
else
    git clone https://github.com/macrocosm-os/apex.git "$MINER_DIR"
    cd "$MINER_DIR"
fi

# --- CRITICAL PYTHON VERSION FIX ---
# Modify install_cli.sh to explicitly use the absolute path to system python3.12
echo "    Modifying install_cli.sh to use the ABSOLUTE PATH to system python3.12 for VENV creation..."
# Define the absolute path.
PYTHON_312_PATH="/usr/bin/python3.12" 

# Use '#' as the delimiter in sed to safely handle the '/' in the path.
# 1. Replace 'python3 -m venv .venv' with the absolute path command
sed -i 's#python3 -m venv \.venv#'"$PYTHON_312_PATH"' -m venv \.venv#g' install_cli.sh
# 2. Replace 'python3 -m venv --system-site-packages .venv' with the absolute path command
sed -i 's#python3 -m venv --system-site-packages \.venv#'"$PYTHON_312_PATH"' -m venv --system-site-packages \.venv#g' install_cli.sh

# Note: The subsequent steps inside install_cli.sh will use the VENV's python
# once the VENV is activated, so we don't need to change the pip install command.
# The VENV created by $PYTHON_312_PATH will have Python 3.12, and its internal 'python3' will point to 3.12.
# --- NEW FIX: Clean repository of build artifacts ---
echo "    Cleaning repository of previous build artifacts and old VENV..."
rm -rf "$MINER_DIR/.venv" "$MINER_DIR/src/apex.egg-info" "$MINER_DIR/build"
find "$MINER_DIR" -type d -name "__pycache__" -exec rm -rf {} +
find "$MINER_DIR" -type d -name "*.egg-info" -exec rm -rf {} +
# Return to the miner directory
cd "$MINER_DIR"

# --- Step 4: Install Python dependencies using install_cli.sh ---
# The install_cli.sh script handles venv creation and dependency installation.
echo "[4/8] Installing Python dependencies via install_cli.sh..."
./install_cli.sh

# --- CRITICAL FIX: Ensure dependencies are installed into the NEW VENV ---
VENV_PATH="$MINER_DIR/.venv/bin/activate"
if [ -f "$VENV_PATH" ]; then
    echo "    Attempting to install dependencies directly into the new VENV..."
    # Activate the new VENV temporarily within the setup subshell
    source "$VENV_PATH"
    
    # Install the apex miner package along with bittensor dependencies
    pip install -e .[all] || pip install -e . # Use -e .[all] as the primary method
    
    # Deactivate the new VENV, returning to the parent's VENV (btcli_9_10_1_venv)
    deactivate
    echo "    New VENV dependencies installed."
else
    echo "✗ WARNING: Miner's VENV was not found after running install_cli.sh. Dependencies may be missing."
fi

# --- Step 5: Configure the virtual environment path ---
VENV_PATH="$MINER_DIR/.venv/bin/activate"
# --- Step 6: Create common functions file (Adjusted for Apex Repo) ---
echo "[5/8] Creating common functions file (common.sh)..."
cat > common.sh << 'EOF'
#!/bin/bash

# Common functions for Apex Miner scripts

DEFAULT_WALLET_PATH="$HOME/.bittensor/wallets"

# Function to expand ~ in paths
expand_path() {
    echo "${1/#\~/$HOME}"
}


EOF

chmod +x common.sh

# --- Step 7: Create run script (Adjusted for venv activation) ---
echo "[6/8] Creating run script (run_miner.sh)..."
cat > run_miner.sh << EOF
#!/bin/bash

# Navigate to miner directory
cd "$MINER_DIR"

# Source common functions
source ./common.sh

# Activate the virtual environment as per official documentation
VENV_PATH="./.venv/bin/activate"

if [ -f "\$VENV_PATH" ]; then
    source "\$VENV_PATH"
    echo "✓ Virtual environment activated."
else
    echo "✗ ERROR: Virtual environment not found at \$VENV_PATH. Run ./install_cli.sh first."
    exit 1
fi

# Run the miner function from common.sh
apex link

EOF

chmod +x run_miner.sh

# --- Step 8: Create submit script (Adjusted for venv activation) ---
echo "[7/8] Creating submit script (submit_solution.sh)..."
cat > submit_solution.sh << EOF
#!/bin/bash

# Navigate to miner directory
cd "$MINER_DIR"

# Source common functions
source ./common.sh

# Activate the virtual environment as per official documentation
VENV_PATH="./.venv/bin/activate"

if [ -f "\$VENV_PATH" ]; then
    source "\$VENV_PATH"
    echo "✓ Virtual environment activated."
else
    echo "✗ ERROR: Virtual environment not found at \$VENV_PATH. Run ./install_cli.sh first."
    exit 1
fi

apex dashboard
apex submit
EOF

chmod +x submit_solution.sh

echo "[8/8] Setup complete!"
echo ""
echo "=== Next Steps ==="
echo "1. Navigate to the miner directory:"
echo "   **cd $MINER_DIR**"
echo ""
echo "2. Run the miner (it will activate the virtual environment automatically):"
echo "   **./run_miner.sh**"
echo ""
echo "3. To submit a solution (it will also activate the virtual environment):"
echo "  **./submit_solution.sh**"
echo ""
echo "Note: The Python code in common.sh now correctly uses imports from the cloned Apex repository, and the run/submit scripts ensure the virtual environment is active."
