import { createPublicClient, http, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import blessed from 'blessed';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// Configuration
const USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const MONITORED_ADDRESS = '0xab02bf85a7a851b6a379ea3d5bd3b9b4f5dd8461';
const UPDATE_INTERVAL = 10000; // 10 seconds
const DATA_DIR = './.data';
const DATA_FILE = `${DATA_DIR}/balance_history.json`;

// Minimal ERC20 ABI for balanceOf
const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

// Data structure for historical records
interface BalanceRecord {
  timestamp: number;
  balance: number; // in USDT (not raw)
}

let balanceHistory: BalanceRecord[] = [];
let updateCounter = 0;
const SAVE_INTERVAL = 6; // Save to disk every 6 updates (1 minute)

// Create viem public client
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

// Ensure data directory exists
async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

// Load historical data from disk
async function loadHistory(): Promise<void> {
  try {
    await ensureDataDir();
    if (existsSync(DATA_FILE)) {
      const data = await readFile(DATA_FILE, 'utf-8');
      balanceHistory = JSON.parse(data);
      console.log(`Loaded ${balanceHistory.length} historical records`);
    }
  } catch (error) {
    console.error('Error loading history:', error);
    balanceHistory = [];
  }
}

// Save historical data to disk
async function saveHistory(): Promise<void> {
  try {
    await ensureDataDir();
    await writeFile(DATA_FILE, JSON.stringify(balanceHistory, null, 2));
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

// Add new balance record and save periodically
function addRecord(balance: number): void {
  balanceHistory.push({
    timestamp: Date.now(),
    balance,
  });

  // Keep last 7 days of data (at 10s intervals = ~60,000 records)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  balanceHistory = balanceHistory.filter(r => r.timestamp > sevenDaysAgo);

  // Save to disk periodically (every minute, not every 10 seconds)
  updateCounter++;
  if (updateCounter >= SAVE_INTERVAL) {
    updateCounter = 0;
    saveHistory();
  }
}

// Calculate flow rate and changes
function calculateMetrics(currentBalance: number) {
  const now = Date.now();

  // Find balance 1 hour ago
  const oneHourAgo = now - 60 * 60 * 1000;
  const recordOneHourAgo = balanceHistory
    .filter(r => r.timestamp <= oneHourAgo)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  // Find balance 24 hours ago
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const recordOneDayAgo = balanceHistory
    .filter(r => r.timestamp <= oneDayAgo)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  // Find balance 10 minutes ago for short-term flow
  const tenMinAgo = now - 10 * 60 * 1000;
  const recordTenMinAgo = balanceHistory
    .filter(r => r.timestamp <= tenMinAgo)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  const change1h = recordOneHourAgo
    ? currentBalance - recordOneHourAgo.balance
    : null;

  const change24h = recordOneDayAgo
    ? currentBalance - recordOneDayAgo.balance
    : null;

  const change10m = recordTenMinAgo
    ? currentBalance - recordTenMinAgo.balance
    : null;

  // Calculate flow rate (M USDT/hour)
  const flowRate1h = change1h !== null
    ? (change1h / 1_000_000)
    : null;

  // Extrapolate from 10min data if we don't have 1h yet
  const flowRateEstimate = change10m !== null
    ? (change10m * 6 / 1_000_000) // 6 x 10min = 1 hour
    : null;

  return {
    change1h,
    change24h,
    change10m,
    flowRate1h,
    flowRateEstimate,
    recordOneHourAgo,
    recordOneDayAgo,
    recordTenMinAgo,
  };
}

// Create the terminal UI
const screen = blessed.screen({
  smartCSR: true,
  title: 'USDT Flow Monitor',
});

// Header box - top info
const headerBox = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  tags: true,
  style: {
    fg: 'cyan',
    border: {
      fg: 'cyan',
    },
  },
  border: {
    type: 'line',
  },
});

// Address info box
const addressBox = blessed.box({
  top: 3,
  left: 0,
  width: '100%',
  height: 3,
  tags: true,
  style: {
    fg: 'white',
    border: {
      fg: 'green',
    },
  },
  border: {
    type: 'line',
  },
});

// MASSIVE balance display - the star of the show
const balanceBox = blessed.box({
  top: 6,
  left: 0,
  width: '100%',
  height: 9,
  tags: true,
  style: {
    fg: 'yellow',
    border: {
      fg: 'yellow',
    },
  },
  border: {
    type: 'double',
  },
});

// Flow metrics - left side
const flowLeftBox = blessed.box({
  top: 15,
  left: 0,
  width: '50%',
  height: 8,
  label: ' Flow Metrics ',
  tags: true,
  style: {
    fg: 'white',
    border: {
      fg: 'magenta',
    },
  },
  border: {
    type: 'line',
  },
});

// Statistics - right side
const flowRightBox = blessed.box({
  top: 15,
  left: '50%',
  width: '50%',
  height: 8,
  label: ' Statistics ',
  tags: true,
  style: {
    fg: 'white',
    border: {
      fg: 'cyan',
    },
  },
  border: {
    type: 'line',
  },
});

// Footer with status
const footerBox = blessed.box({
  top: 23,
  left: 0,
  width: '100%',
  height: 3,
  tags: true,
  style: {
    fg: 'gray',
    border: {
      fg: 'gray',
    },
  },
  border: {
    type: 'line',
  },
});

screen.append(headerBox);
screen.append(addressBox);
screen.append(balanceBox);
screen.append(flowLeftBox);
screen.append(flowRightBox);
screen.append(footerBox);

// Quit on Escape, q, or Control-C
screen.key(['escape', 'q', 'C-c'], async () => {
  // Save data before exiting
  await saveHistory();
  return process.exit(0);
});

// Format number with sign and color
function formatChange(value: number | null, suffix: string = ''): string {
  if (value === null) return '{gray-fg}N/A (waiting for data){/gray-fg}';

  const color = value > 0 ? 'green' : value < 0 ? 'red' : 'white';
  const sign = value > 0 ? '+' : '';
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `{${color}-fg}${sign}${formatted}${suffix}{/${color}-fg}`;
}

// Function to fetch USDT balance
async function fetchBalance(): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: USDT_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [MONITORED_ADDRESS],
  });
  return balance;
}

// Update the UI with new balance data
function updateUI(balance: number, isLoading: boolean = false) {
  const timestamp = new Date().toLocaleTimeString();
  const date = new Date().toLocaleDateString();
  const metrics = calculateMetrics(balance);

  // Update header - title and network info
  headerBox.setContent(
    `\n` +
    `{center}{bold}{cyan-fg}U S D T   F L O W   M O N I T O R{/cyan-fg}{/bold}{/center}`
  );

  // Update address box
  addressBox.setContent(
    ` {bold}{cyan-fg}Address:{/cyan-fg}{/bold} {white-fg}${MONITORED_ADDRESS}{/white-fg}  {gray-fg}|{/gray-fg}  ` +
    `{bold}{green-fg}Network:{/green-fg}{/bold} {yellow-fg}Ethereum Mainnet{/yellow-fg}  {gray-fg}|{/gray-fg}  ` +
    `{bold}{magenta-fg}Token:{/magenta-fg}{/bold} {white-fg}USDT (Tether){/white-fg}`
  );

  // Update MASSIVE balance display
  const formattedBalance = balance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Split balance into parts for dramatic effect
  const [wholePart, decimalPart] = formattedBalance.split('.');

  balanceBox.setContent(
    `\n` +
    `{center}{bold}{yellow-fg}${wholePart}{/yellow-fg}{/bold}{gray-fg}.${decimalPart}{/gray-fg}{/center}\n` +
    `\n` +
    `{center}{bold}{white-fg}U S D T{/white-fg}{/bold}{/center}\n` +
    `\n` +
    `{center}{gray-fg}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{/gray-fg}{/center}`
  );

  // Update flow metrics (left side)
  const flowRate = metrics.flowRate1h !== null
    ? metrics.flowRate1h
    : metrics.flowRateEstimate;

  const flowRateLabel = metrics.flowRate1h !== null
    ? 'Actual'
    : 'Estimated';

  flowLeftBox.setContent(
    `\n` +
    ` {bold}10 Minutes:{/bold}    ${formatChange(metrics.change10m, ' USDT')}\n` +
    `\n` +
    ` {bold}1 Hour:{/bold}        ${formatChange(metrics.change1h, ' USDT')}\n` +
    `\n` +
    ` {bold}24 Hours:{/bold}      ${formatChange(metrics.change24h, ' USDT')}`
  );

  // Update statistics (right side)
  const avgChange = balanceHistory.length > 1
    ? (balance - balanceHistory[0].balance) / balanceHistory.length
    : 0;

  const totalRecords = balanceHistory.length;
  const dataAge = balanceHistory.length > 0
    ? Math.floor((Date.now() - balanceHistory[0].timestamp) / (1000 * 60))
    : 0;

  flowRightBox.setContent(
    `\n` +
    ` {bold}Flow Rate:{/bold}     ${formatChange(flowRate, ' M/hr')} {gray-fg}(${flowRateLabel}){/gray-fg}\n` +
    `\n` +
    ` {bold}Data Points:{/bold}   {cyan-fg}${totalRecords}{/cyan-fg} records\n` +
    `\n` +
    ` {bold}Tracking For:{/bold}  {yellow-fg}${dataAge} minutes{/yellow-fg}`
  );

  // Update footer with status
  const statusColor = isLoading ? 'yellow' : 'green';
  const statusText = isLoading ? 'UPDATING...' : 'LIVE';

  footerBox.setContent(
    ` {gray-fg}Last Update:{/gray-fg} {white-fg}${date} ${timestamp}{/white-fg}  {gray-fg}|{/gray-fg}  ` +
    `{gray-fg}Status:{/gray-fg} {${statusColor}-fg}${statusText}{/${statusColor}-fg}  {gray-fg}|{/gray-fg}  ` +
    `{gray-fg}Updates:{/gray-fg} {cyan-fg}Every 10s{/cyan-fg}  {gray-fg}|{/gray-fg}  ` +
    `{gray-fg}Storage:{/gray-fg} {magenta-fg}${DATA_FILE}{/magenta-fg}`
  );

  screen.render();
}

// Main monitoring loop
async function monitor() {
  try {
    const balance = await fetchBalance();
    const formattedBalance = parseFloat(formatUnits(balance, 6));

    addRecord(formattedBalance);
    updateUI(formattedBalance, false);
  } catch (error) {
    balanceBox.setContent(
      `  {center}{red-fg}{bold}Error fetching balance{/bold}{/red-fg}{/center}\n` +
      `  {center}{yellow-fg}${error instanceof Error ? error.message : 'Unknown error'}{/yellow-fg}{/center}`
    );
    screen.render();
  }
}

// Initialize
async function init() {
  console.log('Loading historical data...');
  await loadHistory();

  screen.render();

  console.log('Starting USDT flow monitor...');
  await monitor(); // First fetch immediately
  setInterval(monitor, UPDATE_INTERVAL);
}

// Show help text initially
const helpText = blessed.box({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 80,
  height: 14,
  content: '\n' +
           '                {bold}{cyan-fg}█ █ █  USDT FLOW MONITOR  █ █ █{/cyan-fg}{/bold}\n\n' +
           '  {bold}Tracking:{/bold} USDT balance on Ethereum Mainnet\n' +
           `  {bold}Address:{/bold} {cyan-fg}${MONITORED_ADDRESS.slice(0, 10)}...${MONITORED_ADDRESS.slice(-8)}{/cyan-fg}\n` +
           `  {bold}Storage:{/bold} {magenta-fg}${DATA_FILE}{/magenta-fg}\n\n` +
           '  {bold}Features:{/bold}\n' +
           '    • Live balance updates every 10 seconds\n' +
           '    • Flow rate calculation (millions USDT/hour)\n' +
           '    • Historical data tracking (up to 7 days)\n\n' +
           '  {yellow-fg}Press q, ESC, or Ctrl+C to quit{/yellow-fg}',
  tags: true,
  border: {
    type: 'double',
    fg: 'cyan',
  },
  style: {
    fg: 'white',
    border: {
      fg: 'cyan',
    },
  },
  shadow: true,
});

// Remove help text after 4 seconds
setTimeout(() => {
  screen.remove(helpText);
  screen.render();
}, 4000);

// Start
init();
