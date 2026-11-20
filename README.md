# ProcureYeti 🐾

> **Autonomous Business Procurement with Owner Authorization and On-Chain Sui Enforcement.**  
> *"AI recommends. Owners authorize. Sui enforces."*

---

## 1. Project Overview and Purpose

ProcureYeti bridges autonomous procurement intelligence with non-custodial cryptographic financial controls on the **Sui blockchain**.

Modern organizations want AI agents and automated workflows to analyze purchase requests, source competitive supplier quotations, and execute payments rapidly. However, delegating direct treasury access or raw private keys to software agents introduces catastrophic risks of budget overruns, unauthorized spending, double-spending, and malicious prompt injections.

**ProcureYeti solves this governance challenge through dual-layer separation:**
1. **Off-Chain Intelligence & Management:** Staff submit purchase requests, register verified suppliers, compare quotations, and review policy evaluations.
2. **On-Chain Sovereign Enforcement:** The business owner holds exclusive authority to create procurement policies and approve purchases on-chain. Autonomous software agents can execute payments **only** within owner-approved limits, funded strictly through **native Sui allowances** (`sui::allowance`), with cryptographic replay protection, per-purchase caps, and daily aggregate limits enforced at the blockchain layer.

---

## 2. The Core Principle

### *"AI recommends. Owners authorize. Sui enforces."*

```
┌─────────────────────────────────┐
│     1. AI / Off-Chain Layer     │
│   • Request Intake & Sorting    │
│   • Supplier Quotation Analysis │
│   • Policy Evaluation Rules     │
└────────────────┬────────────────┘
                 │ Recommendation
                 ▼
┌─────────────────────────────────┐
│     2. Business Owner Layer     │
│   • Non-Custodial Sui Wallet    │
│   • Policy Configuration        │
│   • On-Chain Purchase Approval  │
└────────────────┬────────────────┘
                 │ On-Chain Approval & Native Allowance
                 ▼
┌─────────────────────────────────┐
│      3. Autonomous Agent        │
│   • Pinned Agent Address        │
│   • Pre-submission Safe Markers │
│   • Execute Payment Transaction │
└────────────────┬────────────────┘
                 │ Move Call: execute_purchase
                 ▼
┌─────────────────────────────────┐
│     4. Sui Blockchain Engine    │
│   • Native Sui Allowance Check  │
│   • Replay Prevention           │
│   • Daily Spending Limit Check  │
│   • Direct Transfer to Supplier │
└─────────────────────────────────┘
```

---

## 3. Main Capabilities

- **Procurement Request Management:** Submit, categorize, track, and budget corporate purchase requests across fiat and SUI denominations.
- **Supplier Directory:** Register verified suppliers, store contact details, and record validated 64-character Sui Testnet hexadecimal wallet addresses.
- **Quotation Comparison:** Record supplier quotes, evaluate payment terms, delivery timelines, and accurately compare pricing across whole-number and 9-decimal MIST precision.
- **Owner-Controlled Approvals:** Decisions are authorized by the business owner. Purchases requiring on-chain SUI settlement are committed directly to the shared `ProcurementPolicy` smart contract.
- **Spending Policies & Limits:** Dynamic policy rules enforce allowable purchasing categories, maximum per-purchase amounts, and rolling UTC daily spending caps.
- **Native Sui Allowance Execution:** Payments draw funds from the owner's account using Sui's native `sui::allowance` framework, eliminating intermediate escrow custody or raw agent key funding.
- **Ambiguous Transaction Recovery & Reconciliation:** Pre-submission storage markers prevent duplicate payments during RPC dropouts or wallet timeouts. Ambiguous outcomes cannot be casually bypassed and require deterministic on-chain verification before state unlocks.

---

## 4. System Architecture

ProcureYeti explicitly separates off-chain coordination from immutable on-chain state:

| Layer | Responsibility | Components |
|---|---|---|
| **Off-Chain / Frontend** | User workflow, UI state, request forms, supplier registry, price comparison, recovery state persistence | Next.js 16 (App Router), React 19, Tailwind CSS 4, Browser `localStorage` (resilient hydration) |
| **Client Blockchain SDK** | Sui RPC communication, BCS binary encoding/decoding, wallet signing, transaction construction | `@mysten/sui`, `@mysten/dapp-kit-react`, `@mysten/sui/bcs`, `@mysten/sui/grpc` |
| **On-Chain Policy Engine** | Business rules, owner approvals, spending tracking, replay prevention, agent authorization | `procureyeti::procureyeti` Move module on Sui Testnet |
| **Native Allowance Subsystem** | Treasury withdrawal governance, lifetime cap enforcement, expiration checking | Official `sui::allowance` Move module (`Balance<SUI>`) bound to `ProcureYetiApp` |
| **Shared State & Time** | Shared object policy coordination and UTC daily limit resets | Sui Shared Object architecture, Sui Framework Clock (`0x6`) |

---

## 5. Technology Stack

- **Smart Contracts:** Sui Move (2024 edition)
  - Framework modules: `sui::allowance`, `sui::clock`, `sui::balance`, `sui::coin`, `sui::tx_context`
- **Toolchain:** Sui CLI `1.84.0`
- **Frontend Framework:** Next.js `16.4.6` with React `19.3.0`
- **Type Safety & Styling:** TypeScript `5`, Tailwind CSS `4.3.3` with Turbopack loader
- **Web3 Integration:**
  - `@mysten/sui` `^2.39.1` (Transaction builder, BCS schemas, gRPC client, address utilities)
  - `@mysten/dapp-kit-react` `^2.1.45` (Sui wallet connection and programmable transaction block signing)
- **Code Quality:** ESLint `9` with strict Next.js configuration

---

## 6. Sui Testnet Deployment Information

ProcureYeti is deployed, initialized, and verified on **Sui Testnet** (`chain-id: 4c78adac`):

| Resource | Identifier / Address |
|---|---|
| **Package ID** | `0xc12fc458dbbead5fcc92254a7a36f7c931eeec15298b82dadef15a2639390e0a` |
| **Upgrade Capability** | `0xa3754ece78d6e1e1052c970b6f4c8d33f8b95e5c655f5cf9cd65962078979f3a` |
| **ProcurementPolicy (Shared Object)** | `0x253ae60c635ceec06b63caa32111e3c8f1ade723dba8a7ec866b49bc0213c3ae` |
| **Registered Native Sui Allowance** | `0x4a58de319fc88b935ce9518ea9a1cd8561a51225663857a42d54d1592457a8cb` |
| **Sui Framework Clock** | `0x0000000000000000000000000000000000000000000000000000000000000006` (`0x6`) |
| **Demonstration Owner Address** | `0x0039b51dfb95f49d10255a54575786e36b0b223bf3f4ef91685db0f42b150c8e` |
| **Designated Agent Address** | `0x0039b51dfb95f49d10255a54575786e36b0b223bf3f4ef91685db0f42b150c8e` |
| **Configured Max Per-Purchase** | `100,000,000 MIST` (0.1 SUI) |
| **Configured Daily Limit** | `500,000,000 MIST` (0.5 SUI) |

> **Note on Source Verification:**  
> The deployed bytecode matches the repository source code byte-for-byte, verified using `sui client verify-source contracts`.

---

## 7. Local Setup Requirements and Installation Instructions

### Prerequisites
- **Node.js:** v20.x or v22.x LTS
- **Package Manager:** `npm` (v10+)
- **Sui CLI:** v1.84.0+ ([Sui Install Guide](https://docs.sui.io/guides/developer/getting-started/sui-install))
- **Browser Wallet:** Slingshot, Sui Wallet, or any Sui-compatible extension

### Step-by-Step Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Alafedoyinsola/ProcureYeti.git
   cd ProcureYeti
   ```

2. **Install frontend dependencies:**
   ```bash
   cd web
   npm install
   cd ..
   ```

3. **Verify smart contracts and dependencies:**
   ```bash
   sui move build --path contracts
   ```

---

## 8. Environment Configuration

The frontend references the deployed package ID via environment variables with a safe fallback:

1. **Copy the example environment configuration:**
   ```bash
   cp web/.env.example web/.env.local
   ```

2. **Configure `web/.env.local`:**
   ```env
   # ProcureYeti Sui Testnet Deployment Configuration
   NEXT_PUBLIC_PROCUREYETI_PACKAGE_ID=0xc12fc458dbbead5fcc92254a7a36f7c931eeec15298b82dadef15a2639390e0a
   ```

> **Security Note:** `web/.env.local` is ignored in Git and must contain only public contract addresses. Never commit private keys or seed phrases.

---

## 9. Verification and Development Commands

### Frontend Development Server
```bash
cd web
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Frontend Production Build
```bash
cd web
npm run build
```

### Frontend ESLint Verification
```bash
cd web
npm run lint
```

### Frontend TypeScript Check
```bash
cd web
npx tsc --noEmit
```

### Smart Contract Unit Tests
```bash
sui move test --path contracts
```
*Executes all 18 unit tests covering authorization, limit enforcement, daily resets, allowance verification, and replay rejection.*

### Smart Contract Source Verification
```bash
sui client verify-source contracts
```

---

## 10. Contract Security Model

The Move smart contract ([contracts/sources/procureyeti.move](contracts/sources/procureyeti.move)) enforces enterprise-grade purchasing guardrails:

### Strict Role Separation
- **Owner Role:**
  - Creates the shared policy object (`create_policy`).
  - Accepts native allowance proposals bound to `ProcureYetiApp` (`accept_allowance`).
  - Registers the allowance capability with the policy (`register_allowance`).
  - Approves specific purchase amounts and recipient supplier addresses (`approve_purchase`).
  - Holds emergency circuit-breaker authority to deactivate policies (`deactivate_policy`).
- **Agent Role:**
  - Cannot approve purchases.
  - Cannot change spending limits or register unapproved allowances.
  - Can only invoke `execute_purchase` for purchases explicitly approved by the owner.

### Allowance Integrity & Precision
- Native allowances are bound using the package-defined type witness `ProcureYetiApp`.
- When an agent executes a purchase, the Move function demands:
  ```move
  assert!(option::contains(&policy.allowance_id, &object::id(allowance_obj)), EAllowanceMismatch);
  ```
- The withdrawn balance from the allowance must exactly match the owner's approved amount:
  ```move
  assert!(balance::value(&payment_balance) == amount_mist, EIncorrectWithdrawalAmount);
  ```

### Replay Prevention
- Every approved purchase is assigned a strictly increasing, sequential `purchase_id`.
- The contract guarantees that each purchase can be executed exactly once:
  ```move
  assert!(purchase.approved, EPurchaseNotApproved);
  assert!(!purchase.executed, EPurchaseAlreadyExecuted);
  purchase.executed = true;
  ```

### Rolling Daily Spending Limits
- The contract references the official Sui Clock (`0x6`).
- It computes the current UTC day via `clock::timestamp_ms(clock) / 86400000`.
- At the start of a new UTC day, aggregate business spending automatically resets to zero, preventing budget exhaustion across multiple days without requiring manual owner intervention.

### Ambiguous Transaction Recovery & Safety
- **Pre-Submission Tracking:** Before wallet submission, an execution marker is saved in browser storage.
- **No Blind Retries:** If a wallet or RPC call fails ambiguously, the app preserves the marker in `reconciliation_failed` status.
- **On-Chain Reconciliation:** The system does not allow clearing recovery markers or retrying payments until an on-chain query confirms whether the purchase executed.

---

## 11. Verified Sui Testnet Demonstration

ProcureYeti has executed an end-to-end autonomous procurement payment on Sui Testnet:

| Demonstration Field | Verified Value |
|---|---|
| **Purchase ID** | `#1` |
| **Payment Amount** | `0.01 SUI` (`10,000,000 MIST`) |
| **Supplier / Recipient** | ProcureYeti Test Recipient (`0xb8af56e956e31fc74a28b27bca1ee37e78d2b1b56413117c2934dc526559568f`) |
| **Owner Approval Tx** | [`4kkC6p3YTuxMdATJHeT2k48VacJsrbvCHk1EUse1QM1e`](https://suiscan.xyz/testnet/tx/4kkC6p3YTuxMdATJHeT2k48VacJsrbvCHk1EUse1QM1e) |
| **Agent Execution Tx** | [`9MGirwFwcvQzXMhzpyzXtKPBc9PeC1aAGgE7DEy27p6Q`](https://suiscan.xyz/testnet/tx/9MGirwFwcvQzXMhzpyzXtKPBc9PeC1aAGgE7DEy27p6Q) |
| **Transferred Coin ID** | `0x8bd44a0f118cdc9216311d08e5f18abb3758cf16db7ab3d918539c1382e16c45` |
| **Receipt Confirmation** | Verified on-chain; supplier balance credited `+0.01 SUI`. |

---

## 12. Current Limitations & Testnet Notice

> **⚠️ Demonstration Disclaimer:**  
> ProcureYeti is currently deployed as a **Sui Testnet demonstration** developed for hackathon evaluation and technical review. It is not an audited production financial service.

### Known Scope & Limitations:
1. **Local Storage Coordination:** Non-chain metadata (unapproved drafts, historical quotation notes) is stored in browser `localStorage`. In a production release, off-chain data would be synchronized via a decentralized database (e.g. Walrus / decentralized storage indexer).
2. **Demonstration Key Roles:** In the testnet proof above, the owner and agent transactions were executed using the primary demonstration account (`0x0039b...`) to demonstrate both roles in a test environment. In production, the owner and autonomous agent must operate from distinct Sui addresses.
3. **UTC Boundary Timing:** Daily spending resets are tied to UTC midnight calculated via the Sui Clock (`0x6`). Transactions executing within milliseconds of UTC midnight are evaluated against the current on-chain timestamp.

---

## 13. License

This project is licensed under the Apache 2.0 License.
