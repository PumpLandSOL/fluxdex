# FluxDEX ($FLUX)

Perpetual futures on **BTC, ETH, SOL, HYPE, ZEC, NEAR, JUP and PUMP** (up to 50x), on Solana, running on a port of the **percolator** risk engine (toly's open-source percolator lineage):

- **Haircut H** — capital is senior, profit is junior; exits are paid only from the residual that exists.
- **A/K/F lazy indices** — O(1) mark, funding and deleveraging per account; no ADL queue.
- **Bounded cranks** — one update can't move a mark more than `max_move_bps` per slot.
- **Side recovery** — Normal → DrainOnly → ResetPending → Normal.

Prices: CoinGecko for majors (10s), Jupiter for Solana mints and as fallback. Permissionless listing of any Solana mint with ≥ $50k liquidity (leverage capped by depth). Phantom wallet with ed25519-signed sessions on every open/close.

Dependency-free Node. `npm start` (port 8254). Tests: `node _studio/e2e.cjs`, `node _studio/e2e-ui.cjs`.

Env: `PORT`, `DATA_PATH`, `FLUX_MINT`, `SEED_USDC`, `DISC_MAX` (meme auto-discovery, off by default), `LIST_MIN_LIQ`.
