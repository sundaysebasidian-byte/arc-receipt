# Try one complete Arc Receipt review

Start with **Try the complete check** on the first screen. It fills an existing third-party transaction, selected address and expected transaction net, then reads Arc mainnet. No wallet or funds are required.

1. **Confirm the basis before the amount.** Address `0xa818cfe3d358dc65a7a1a21514faeefacf2ec4b3`; expected transaction net `100.01 USDC`. Inspect incoming `100.01`, outgoing `0`, net `100.01`. The address and expectation are local review inputs, not proof of ownership or an invoice.
2. **Test the comparison yourself.** Change expected net to `100.010001` and press **Review transaction**. The result shows an exact `0.000001` difference. Changing a field clears the old observation; an incorrect expectation is not an unpaid-invoice verdict.
3. **Test the handoff.** Download **Raw evidence JSON** and optionally readable HTML. Beside these exports, choose **Recheck saved JSON** and select the downloaded file. Its claims are recomputed, then the transaction is queried again from the fixed official RPC. **Recheck live** alone does not exercise the saved file.

The shorter path is an intended review aid, not a measured human completion time. The old68-second QA video remains evidence of the previous interface; it was not re-rendered for this round.

## Review illustrative order assignments

Open **Reconcile orders & split payments**, choose **Load illustrative split order**, then **Review orders**. The persistent banner explains that these are made-up order IDs over unrelated third-party public transactions. Inspect DEMO-SPLIT:100.01 +1458.033036 =1558.043036, two distinct observations and one repeated input counted once. DEMO-MISSING stays incomplete. Export comparisons, exceptions or per-row evidence JSON; expand assigned payment records and open a payment for individual export/fresh recheck. The supplied order total is not used as a per-payment expectation.

Choose **Load allocation-conflict demo** to see one hash under two orders blocked before RPC, while the independent order verifies. These outcomes are local allocation review, not customer payment or commercial settlement decisions. See [order format and limits](order-review.md).

## Review a batch and its exceptions

Open **Review a local CSV batch**, load the public five-record example, then **Review batch**. Inspect an exact match, an above-expectation final receiver, a below-expectation normal intermediary, a repeated input and a deliberately unknown hash. Export the four exceptions, then open a verified row to export/recheck its individual JSON. None of these is an invoice verdict. See [CSV format and boundaries](batch-review.md).

## Why use this alongside Explorer?

Explorer already displays transfers and State correctly. Here, the selected address, both transfer directions, exact expected-net difference and portable review basis stay together. That removes a separate arithmetic/comparison step and the need to reconstruct that basis when handing off the observation; no measured time saving or missing Explorer export capability is claimed. See [observed comparison](workflow-comparison.md).

## Technical boundary case

1. Direct native transfer:100.01 incoming,0 outgoing,100.01 net and expected-net criterion. Precision detail shows native-only system log15/raw100010000000000000000, without inventing an ERC-20 mirror.
2. Exact expected-net difference: same transaction, expectation100.010001, exact0.000001 difference. Read the basis and no-invoice-verdict statement.
3. Normal swap intermediary:1458.033036 incoming/outgoing, net0, expectation blank. Read TakerPositionManager routing context and two18/6 precision pairs. Not merchant nonpayment evidence.
4. Return to direct case, export HTML/JSON, import JSON, observe recompute plus fresh recheck. Open boundaries for control/intent, invoices, partial payments, sweeps, mints/burns, balances and proof.

Compare the same questions with Explorer Details/Token transfers/State/Logs using workflow-comparison.md. Explorer already de-duplicates and provides State changes. No performed user study or time-saving claim.

Current proof:105 unit tests,30 browser checks (actual RPC and labelled abnormal fixtures),21 local UI checks,4 genuine workflows/screenshots. Core verifier and import/recheck function bodies unchanged; app/HTML/examples deliberately changed. See evidence/order-boundary-delivery-validation.json and core-preservation.json. Prior51-test/six-file-freeze claims belong to historical scope only.

| Official criterion | Implemented evidence | Gap |
|---|---|---|
| Arc relevance | Native-only/mirroredUSDC, chain5042, exact raw units and commit observation | Read-only deployment qualification unconfirmed |
| Credibility | Fixed read RPC, exact arithmetic, canonical checks and recompute/fresh recheck | Single-provider unsigned observation |
| Build quality | Directions/basis, normal-swap context, state handling, responsive UI and exports | No full accessibility/production certification |
| Worth continuing | Narrow review workflow and objective Explorer comparison | Usefulness hypothesis unvalidated |

Public source/hosting, actual terms and payout facts remain owner decisions. No grant or500USDC income assumed.
