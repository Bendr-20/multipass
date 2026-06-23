# Security

Do not commit secrets, private keys, wallets, raw logs, local memory files, database files, `.env` files, generated media dumps, or private drafts.

Security hardening is intentionally staged. Before production launch, this repo should have:

- secret scanning
- dependency scanning
- branch protection
- reviewed deployment credentials
- contract upgrade and pause policy review
- storage layout checks for upgradeable contracts
