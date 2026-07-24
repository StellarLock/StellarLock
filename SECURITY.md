# Security Policy

StellarLock handles locked financial assets (tokens and LP positions) secured by Soroban smart contracts on Stellar. We take security seriously and appreciate responsible disclosure.

## Supported Versions

| Version | Status       | Notes                          |
| ------- | ------------ | ------------------------------ |
| main    | ✅ Supported | Active development on testnet  |
| others  | ❌ Unsupported | No security patches provided  |

> **Note:** StellarLock is currently deployed on Stellar **Testnet only**. Smart contracts are unaudited. Do not lock mainnet assets.

## Scope

The following are **in scope** for security reports:

- **Smart contracts** — `contracts/token-locker/` and `contracts/lp-locker/` (Soroban/Rust)
- **Frontend application** — React/TypeScript UI in `src/`
- **Wallet integration** — Freighter wallet connection and transaction signing
- **Infrastructure** — Vercel deployment, build pipeline

The following are **out of scope**:

- Issues in upstream dependencies (Stellar SDK, Freighter, Soroban RPC) — report these to the respective projects
- Denial-of-service attacks against public RPC endpoints
- Social engineering attacks
- Issues requiring physical access to a victim's device
- Attacks relying on the user already running malware

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report vulnerabilities via email to:

**security@stellarlock.io** *(or open a [GitHub Security Advisory](https://github.com/StellarLock/StellarLock/security/advisories/new) if email is unavailable)*

### What to include in your report

1. **Description** — A clear description of the vulnerability and its potential impact
2. **Reproduction steps** — Step-by-step instructions to reproduce the issue
3. **Proof of concept** — Code, screenshots, or transaction hashes demonstrating the issue
4. **Affected components** — Which contract, file, or endpoint is affected
5. **Suggested fix** (optional) — If you have a proposed fix or mitigation

### Encrypted communication

If your report is particularly sensitive, you may PGP-encrypt it. Contact us first via GitHub Security Advisories to exchange keys.

## What to Expect

| Timeline       | Action                                                  |
| -------------- | ------------------------------------------------------- |
| Within 48 hours | Initial acknowledgment of your report                 |
| Within 7 days  | Preliminary assessment and severity classification      |
| Within 30 days | Fix developed and tested (critical/high severity)       |
| Within 90 days | Fix developed and tested (medium/low severity)          |
| After fix ships | Public disclosure (coordinated with reporter)          |

We will keep you informed throughout the process. If you do not receive an acknowledgment within 48 hours, please follow up via a GitHub Security Advisory.

## Safe Harbor

We commit to the following:

- We **will not** pursue legal action against researchers who report vulnerabilities in good faith
- We **will not** contact law enforcement regarding good-faith security research
- We **will** work collaboratively with you to understand and address the issue
- We **will** credit you in our public disclosure (unless you prefer to remain anonymous)

Good-faith research means:

- You avoid privacy violations, destruction of data, or disruption of services
- You only interact with accounts and assets you own or have explicit permission to test
- You do not exploit a vulnerability beyond what is necessary to demonstrate it
- You give us reasonable time to fix the issue before public disclosure

## Known Limitations

Please be aware of these known limitations before reporting:

- **Unaudited contracts** — The Soroban smart contracts have not undergone a formal security audit
- **Testnet only** — All contracts are deployed on Stellar Testnet; there is no mainnet deployment
- **No bug bounty program** — We do not currently offer monetary rewards for vulnerability reports, though we will publicly acknowledge reporters in our Hall of Fame
- **Single maintainer** — Response times may vary; we will always acknowledge within 48 hours

## Hall of Fame

We thank the following researchers for responsible disclosure:

*No reports yet — yours could be first!*

## Security Contacts

| Role             | Contact                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Primary contact  | [GitHub Security Advisories](https://github.com/StellarLock/StellarLock/security/advisories) |
| Backup contact   | Open a private discussion in the repository                                                  |

---

*This security policy is inspired by [disclose.io](https://disclose.io/) standards.*
