# One-transaction review and evidence handoff

Arc Receipt prepares an explicit, selected-address observation for manual reconciliation or a reviewer handoff. It shows incoming transfers, outgoing transfers/burns and their transaction-local net separately. The optional expectation compares with **transaction net**, not gross receipts, a whole invoice or an account balance change. Expected net accepts positive values; leave it blank when inspecting zero or outgoing-only flows.

This is a workflow hypothesis, not validated merchant demand. No recipient interviews, task-time savings, adoption or payment intent are claimed. The previous zero-net example was a normal swap intermediary; it was not evidence that a merchant was unpaid. The previous positive example also contained WETH exchange movements, so it has been replaced by a native direct transfer for the direct-flow demo. Prior files and claims are retained only as historical evidence under `evidence/before-scope-20261002/` and the earlier Git/Library versions.

## First-review improvements in this round

The first screen now offers a complete-check entry. The result places the full selected address and expected transaction net before the amount, and saved-JSON recheck sits beside exports. Existing examples, arithmetic and scope are unchanged. These are directly inspectable layout/interaction changes, not proof of increased adoption or a measured usability improvement.

## Four reproducible cases

All four were run through the real local UI with fresh public RPC queries. `evidence/workflows/acceptance.json` records the actual controls, outputs and requests. Preset clicks are demo steps, not measured human task performance. The four flows made20 read requests in total; the handoff flow includes a fresh direct-case preparation query and a second query after import. No responses were replaced by fixtures.

| Case | Input and selected scope | Visible result | What it cannot establish |
|---|---|---|---|
| Direct native transfer | [Public transaction](https://explorer.arc.io/tx/0x68e75b9710c19c0caf34d6cb440202ba5fffaef10dbcf13e5f49ee0d216dff2a), address `0xa818cfe3d358dc65a7a1a21514faeefacf2ec4b3`, expected net100.01 | Incoming100.01 / outgoing0 / net100.01; expected transaction net matches | Customer intent, address control or a merchant invoice. Explorer labels the sender Bybit2; this still establishes no user ownership or purpose |
| Exact expected-net difference | Same public transaction/address; expected net100.010001 | Exact0.000001 below expected net; no rounding | Whether an invoice is unpaid, whether the expectation is correctly allocated, or whether other partial payments exist |
| Normal swap intermediary | [Public Swap](https://explorer.arc.io/tx/0x1732bf16a26831ba5a7d183ceb35c893bb9053630f9549ed99269985ab62d7d8), selected `0xe9fae1c386c6f45b1fb3c3ef01ade424dad4bccf` (Explorer label TakerPositionManager); expectation blank |1458.033036 incoming and outgoing; net0. Paired18/6 logs correspond exactly. The UI explicitly identifies normal routing as technical context | Merchant nonpayment. The same transaction has positive USDC net at final receiver `0x870c73c98a14b6956b79247e1a1cdc68ba0060ee`; the8 new unit cases verify this address-role distinction |
| Evidence handoff | Direct case → download HTML/JSON → import the JSON | Saved claims recomputed, then fresh fixed-RPC read; consistent recheck. Review scope and full identifiers travel with the evidence | Signed proof, independent-provider confirmation, invoice identity or the truth of arbitrary saved presentation annotations |

The direct example was found through21 bounded public reads: empty calldata native send, recipient code `0x` at its inclusion block, successful receipt and one matching system transfer of100010000000000000000 raw18-decimal units. Research metadata is in `evidence/direct-native-example.json`. This makes the transaction type reproducible; it does not prove who controls the address. Every amount is third-party public sample data, not owner income, holdings or grant proceeds.

## Official Explorer comparison

An independent fresh headless browser visited the official Explorer's **Details, Token transfers, State and Logs** screens for the direct send and normal swap. Actual pages, screenshots, navigation and visible outputs are stored under `evidence/explorer-review/`; `scripts/explorer-review.mjs` reproduces the read-only inspection. The web text reader could not open these transaction URLs; the recorded browser pages are the source for these observations.

| Task | Observed official Explorer path and output | Arc Receipt path and output |
|---|---|---|
| Inspect direct incoming transfer | Open direct hash Details: Success, native value100.01, one USDC transfer. Token transfers shows the movement; State shows selected receiver change+100.01 | Preset direct case, or enter hash/address/expected net then Review: separate incoming100.01, outgoing0, net100.01 and exact expectation criterion |
| Compare100.010001 with observed100.01 | Same Details/Token transfers output. No expected-net input was visible in the inspected screens; perform the decimal comparison separately | Difference preset or change the expected-net field: explicit0.000001 difference and comparison basis |
| Interpret intermediary net | Swap Details/Token transfers identifies the cirBTC→USDC route and shows three correctly decoded USDC transfers, including equal incoming/outgoing at TakerPositionManager. State lists changed addresses; the zero-change intermediary is not among those visible rows | Selected intermediary shows both directions and net0, with explicit normal-swap context. No paid/unpaid verdict is produced |
| Handoff and later recheck | Share transaction URL; the inspected screens expose API navigation. We did not audit all API/download capabilities, so do not claim Explorer lacks exports or raw data | Download a script-free readable observation plus raw receipt/block JSON. Import recomputes saved claims and makes fresh reads from the fixed endpoint |

**Explorer already handles the native/ERC-20 representation correctly.** Arc Receipt is not presented as a fix for Explorer double-counting. Its limited contribution is a fixed-address review basis and portable, recomputable context. State output includes balance representations and gas effects; our explicit-transfer net excludes gas and incoming mints, so it is not a State balance delta. See [Arc's event reference](https://docs.arc.io/arc/references/usdc-system-events).

## Local batch extension

The current candidate imports up to20 transaction/address/expected-net records, keeps invalid and repeated inputs visible, makes paced sequential reads and exports exceptions. A row can open the existing portable observation. This combines repeated address/expectation comparisons into one local workflow; no batch capability assessment of all Explorer products or measured time-saving study was performed. Details, cancellation and spreadsheet-safe output are in [batch-review.md](batch-review.md).

## Review boundaries

Address control and customer intent require independent evidence. A matching amount does not allocate an invoice or prevent reuse. The single receipt does not aggregate partial payments. The separate order module can sum distinct assigned transaction nets, but cannot verify the order association or commercial settlement. Swept collections can have a valid gross receipt and zero selected-address net; inspect incoming events and controlled destinations under an independent collection policy. Incoming mints can increase a balance but are excluded from transfer totals; outgoing burns reduce this net. None of these conclusions is an invoice settlement decision.

The JSON/HTML is one provider's **unsigned RPC observation**, not validator signatures or a cryptographic inclusion proof. Imported presentation and endpoint claims are not trusted. `web/verifier.mjs` is byte-identical to the reviewed baseline; the import-recompute and fresh-recheck function bodies are also byte-identical. The app's labels, readable HTML and example constants intentionally changed. Do not reuse the prior six-file-freeze or51-test claims as proof of this scope: current evidence is105 unit tests,30 general browser checks,21 UI checks and4 separately recorded genuine workflows.
