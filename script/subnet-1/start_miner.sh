#!/bin/bash
# start_miner.sh - Start the Apex miner

cd ~/apex-miner

# Load configuration
if [ -f "miner_config.json" ]; then
    CONFIG=$(cat miner_config.json)
    WALLET_NAME=$(echo "$CONFIG" | jq -r '.wallet.name // "default"')
    HOTKEY_NAME=$(echo "$CONFIG" | jq -r '.wallet.hotkey // "default"')
else
    WALLET_NAME="default"
    HOTKEY_NAME="default"
fi

echo "Starting Apex Miner..."
echo "Wallet: $WALLET_NAME"
echo "Hotkey: $HOTKEY_NAME"

# Run miner
python3 -c "
import bittensor as bt
from apex.validator_api import Miner
import time

print('Initializing miner...')
config = bt.config(
    wallet=bt.wallet(name='$WALLET_NAME', hotkey='$HOTKEY_NAME'),
    netuid=1,
    network='finney',
    subtensor=bt.subtensor(chain_endpoint='wss://entrypoint-finney.opentensor.ai:443')
)

print('Creating miner instance...')
miner = Miner(config)

print('Starting miner loop...')
try:
    miner.run()
except KeyboardInterrupt:
    print('Miner stopped by user')
except Exception as e:
    print(f'Error running miner: {e}')
"