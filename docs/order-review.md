# Local order review

Four CSV columns, in any order: `order_id,order_total_usdc,tx_hash,address`. UTF-8 file limit100000 bytes inclusive,1–20 nonempty payment records. CSV quotes/BOM/CRLF supported. Nonempty data records are counted using all original fields before known-column projection; extra-only malformed rows are retained as unassigned invalid records and count toward20. Their extra values survive run/export/recomputation in the evidence bundle. Order comparison CSV lists orders; unassigned errors remain in the page and raw JSON. Order ID is case-sensitive,1–80 characters without controls. Repeat the same positive total (up to18 fractional digits) for each order row; equivalent decimal spellings normalize exactly. An order total is counted once.

Each contributing row is one transaction at one address. The app verifies chain5042, successful receipt, matching numbered block, canonical USDC events, exact18/6 mirror correspondence and observation policy. Gas, incoming mints and self/zero movements are excluded; outgoing burns are deducted. This is explicit-transfer net, not State balance change. Zero/negative components stay visible with routing/context warnings.

Distinct hashes aggregate. Identical order/hash/address repeats warn and count once. A hash under different orders or addresses blocks all affected assignments before RPC, including when the address is missing/invalid or another order field is invalid. A valid hash is recognized independently of full input validation; unresolved address assignments conservatively block a repeated hash. Output-level allocation is unsupported. Conflicting totals block comparison. Any unresolved row keeps the order incomplete, even if already-observed net happens to equal the supplied total. Prior observations survive partial failures or cancellation; HTTP429/wrong-chain stops later queries, without automatic retry. Requests are sequential, with350ms configured spacing and a10ms scheduling guard; chain/receipt/block cache is run-local and head is refreshed per observed address.

## Clearly illustrative walkthrough

Load illustrative split order, then Review orders. `DEMO-SPLIT` combines100.01 and1458.033036 from unrelated existing public transactions, with repeated input counted once. `DEMO-MISSING` has an explicitly unknown all-zero hash and remains incomplete. The persistent demo banner and CSV scope state these labels/totals are made up, not customer bills or user earnings. Load allocation-conflict demo to see a shared hash blocked and an unrelated order still observed.

Expand assigned payments to inspect complete hashes, addresses, directions/net and per-payment evidence. Open receipt & evidence, export individual JSON, then Recheck saved JSON: saved claims are recomputed before fresh fixed-RPC reads. The order total is never injected as a per-payment expected amount.

Export comparisons CSV, exception CSV (including matched orders with repeated/context warnings) or evidence JSON. CSV formula/control starters are literal text. Bundle input rows preserve malformed-field markers; offline recomputation ignores claimed summaries and recomputes raw receipts. `node scripts/audit-order-bundle.mjs [bundle.json]` adds independent18-decimal system-log decoding and a distinct contributing-hash check.

## Practical limits

An order association is supplied by the reviewer; the tool does not prove address control, customer intent, legitimate allocation, commercial settlement or absence of reuse in another file. Saved evidence is unsigned single-provider data; offline internal consistency is not chain authenticity. There is no cross-file ledger, automatic collection/shipment/refund or wallet action. Files/IDs/totals/addresses remain local; the fixed RPC receives validated public transaction hashes and block queries. No measured adoption, time saving or award probability is claimed.

## Independent-review fixes

The prior batch candidate accepted a100000-byte CSV but expanded it during re-encoding before execution. Descriptors now validate directly and malformed extra fields remain invalid. The exact external-review fixture is included in evidence/boundary-100000.csv and verified via fresh reads. HTML footer links now wrap at narrow widths and are rendered at four widths. Final deployment manifests hash generated candidate bytes, distinguishing them from working-tree bytes changed by the publication footer. All current acceptance scripts are run against the extracted final runtime candidate; archived evidence is explicitly historical.

The prior01ca161f external review found that invalid addresses hid hashes and extra-only fields disappeared. Both are covered by the exact included fixtures and six new regression cases. The single-receipt help explicitly limits non-aggregation to its own mode; order sums do not prove commercial settlement.
