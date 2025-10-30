# MegaETH Tracker

Real-time USDT balance flow monitor for Ethereum addresses with a beautiful terminal UI.

## Features

- **Real-time Balance Tracking**: Updates every 10 seconds via Ethereum mainnet
- **Flow Metrics**: Calculate balance changes over 10 minutes, 1 hour, and 24 hours
- **Flow Rate Analysis**: Track millions of USDT flowing in/out per hour
- **Persistent Storage**: Historical data saved locally (up to 7 days retention)
- **Beautiful Terminal UI**: Color-coded metrics with split-panel layout
- **Live Status**: Real-time indicators and timestamp tracking

## Prerequisites

- [Bun](https://bun.sh) runtime (v1.0 or higher)
- Terminal with UTF-8 support and color capability

## Installation

```bash
bun install
```

## Usage

Start the monitor:

```bash
bun start
```

Or run directly:

```bash
bun run index.ts
```

### Controls

- `q` - Quit
- `ESC` - Quit
- `Ctrl+C` - Quit

## Configuration

Edit the constants in `index.ts` to customize:

```typescript
const USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const MONITORED_ADDRESS = '0xab02bf85a7a851b6a379ea3d5bd3b9b4f5dd8461';
const UPDATE_INTERVAL = 10000; // milliseconds
```

## Data Storage

Historical balance data is stored in `.data/balance_history.json` and automatically:
- Created on first run
- Updated every minute (optimized for disk I/O)
- Saved on exit
- Retained for 7 days (older records auto-purge)

## Tech Stack

- **[Viem](https://viem.sh)**: Ethereum interaction
- **[Blessed](https://github.com/chjj/blessed)**: Terminal UI
- **[Bun](https://bun.sh)**: JavaScript runtime and package manager
- **TypeScript**: Type safety

## License

MIT
