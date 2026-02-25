#!/bin/bash
# submit_apex_solution.sh - Submit solution to Apex subnet

cd ~/apex-miner

if [ $# -lt 1 ]; then
    echo "Usage: $0 <solution_file.json> [--test]"
    echo ""
    echo "Examples:"
    echo "  $0 solution.json              # Submit to mainnet"
    echo "  $0 solution.json --test       # Test submission (dry run)"
    echo ""
    echo "Solution file format:"
    echo '  {"task_id": "123", "solution": "your_solution_data"}'
    exit 1
fi

SOLUTION_FILE=$1
TEST_MODE=false

if [ "$2" = "--test" ]; then
    TEST_MODE=true
fi

# Load config
if [ -f "miner_config.json" ]; then
    CONFIG=$(cat miner_config.json)
    WALLET_NAME=$(echo "$CONFIG" | jq -r '.wallet.name // "default"')
    HOTKEY_NAME=$(echo "$CONFIG" | jq -r '.wallet.hotkey // "default"')
else
    WALLET_NAME="default"
    HOTKEY_NAME="default"
fi

echo "Submitting solution..."
echo "Wallet: $WALLET_NAME"
echo "Hotkey: $HOTKEY_NAME"
echo "Solution file: $SOLUTION_FILE"
echo "Test mode: $TEST_MODE"

if [ ! -f "$SOLUTION_FILE" ]; then
    echo "Error: Solution file not found: $SOLUTION_FILE"
    exit 1
fi

# Submit solution
python3 -c "
import json
import sys
import traceback
from apex.validator_api import ApexAPI

def main():
    # Load solution
    with open('$SOLUTION_FILE', 'r') as f:
        solution_data = json.load(f)
    
    print(f'Loaded solution for task: {solution_data.get(\"task_id\", \"unknown\")}')
    
    # Initialize API
    print('Connecting to network...')
    api = ApexAPI(
        wallet_name='$WALLET_NAME',
        hotkey_name='$HOTKEY_NAME',
        netuid=1,
        network='finney'
    )
    
    if $TEST_MODE:
        print('\\n[TEST MODE] Validating solution format...')
        print(f'Solution data: {json.dumps(solution_data, indent=2)}')
        print('\\nNote: In test mode, solution is not actually submitted.')
        return
    
    # Submit solution
    print('Submitting solution to subnet...')
    try:
        result = api.submit_solution(solution_data)
        print('\\n✅ Solution submitted successfully!')
        print('Response:')
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f'\\n❌ Error submitting solution: {e}')
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
"