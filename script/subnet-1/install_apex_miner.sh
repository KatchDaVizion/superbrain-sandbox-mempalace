#!/bin/bash

echo "Installing Apex Miner on WSL..."

# Download and run setup
wget -O setup_miner.sh https://raw.githubusercontent.com/KatchDaVizion/superbrain-desktop-work/main/script/subnet-1/start_miner.sh
chmod +x setup_miner.sh
./setup_miner.sh

echo "Installation complete!"
echo ""
echo "To start mining:"
echo "  cd ~/apex-miner && ./start_miner.sh"
echo ""
echo "To submit a solution:"
echo "  cd ~/apex-miner && ./submit_apex_solution.sh solution.json"
