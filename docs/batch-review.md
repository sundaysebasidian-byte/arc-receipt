# Local CSV transaction-net review

Open **Review a local CSV batch**. Import your CSV or load the public five-record example, inspect the preview, then choose **Review batch**. The file is not uploaded. Invalid or repeated records stay visible and are skipped. One failed observation does not discard the other rows.

## File format

UTF-8, up to100000 bytes inclusive and20 nonempty data records. Three required columns, in any order:

```csv
tx_hash,address,expected_net_usdc
0x68e75b9710c19c0caf34d6cb440202ba5fffaef10dbcf13e5f49ee0d216dff2a,0xa818cfe3d358dc65a7a1a21514faeefacf2ec4b3,100.01
```

Use a32-byte hash, nonzero20-byte address and positive decimal expectation with up to18 fractional digits. No exponent notation. A batch expectation is required and refers to **incoming transfers minus outgoing transfers/burns for that address in that transaction**, not a whole invoice balance. An invalid row remains available for export/correction. A malformed CSV structure or wrong header is a file-level error; a previous loaded batch is retained.

Quoted commas, doubled quotes, embedded newlines, BOM, CRLF and LF are supported. A transaction/address pair repeated in the file is flagged even if the expectation differs. The first valid pair is reviewed once; repetitions need source-record reconciliation. Two addresses in the same transaction are legitimate separate reviews. There is no cross-file or invoice-reuse ledger.

## Results and continuation

**Expected net matched / Below expected net / Above expected net** are exact arithmetic comparisons with your chosen expectation. **Repeated input** does not mean a second chain payment. **Could not verify** means receipt, chain or evidence checks could not complete. **Cancelled / Not checked** make unfinished work explicit. The optional included-block policy must be met before a batch match conclusion.

Review incoming and outgoing separately. In the public swap case, a normal intermediary has zero net; assigning an illustrative expected net of1 creates a below-expectation comparison, not merchant nonpayment evidence. Address control, customer intent, invoice allocation, partial payments across transactions and sweep policies remain independent questions. Gas and incoming mints are excluded, so net is not a State balance change.

**Export exceptions CSV** keeps every row except a matched row, including invalid, repeated, failed and unfinished records. CSV delimiter escaping and a literal apostrophe prefix for formula/control starters protect spreadsheet opening. Negative numeric differences are also exported as literal text; the CSV is an operational list, not cryptographic evidence or an import template.

For a verified row, **Open receipt & evidence** opens the existing single-review view. Export its readable HTML/JSON; reimport the JSON for recomputation and a fresh official RPC read. Batch CSV itself is not a receipt that can prove claims. The observation timestamp travels in the per-row JSON.

## Privacy and bounded RPC use

No backend, analytics, persistence or customer-data upload. Files, target addresses and expectations stay in page memory and are cleared by reload. The browser requests only validated public transaction hashes and canonical blocks from the fixed official Arc RPC. The RPC operator can see ordinary request metadata and queried hashes; this is not network anonymity.

Maximum20 records, one request at a time, 350ms configured minimum between request starts plus a10ms scheduling guard. Transaction receipt and block evidence are cached only within a run; the observed head refreshes per reviewed address. Every new run queries afresh. Cancelling aborts the current network request and retains completed rows; later rows are marked not checked. HTTP429 and wrong-chain responses stop further requests rather than automatically retrying. Single-review chain actions are disabled while the batch runs.

## Actual reproducible demo

The five-record example includes:

1. Native direct receiver:100.01 expected,100.01 transaction net → match.
2. Final receiver of the public swap:1458 expected,1458.033036 net → above by0.033036.
3. Normal swap intermediary:illustrative expectation1, net0 → below by1, with explicit normal-routing context.
4. Repeat of record1 → repeated input, no extra RPC query.
5. All-zero hash → deliberately unknown hash, not an existing public transaction → could not verify if no receipt is returned.

Two existing third-party transactions are used; none are user earnings, validated merchant payments or builder-originated transactions. `node scripts/batch-qa.mjs` records actual reads first, then separately labelled local429/cancellation and file-validation cases. `npm test` covers exact arithmetic, CSV escaping, missing/precision errors, duplicate semantics, partial failure, cancellation and spreadsheet safety. Test counts and screenshots are in `evidence/batch-validation.json` and the current delivery receipt.

## Remaining product hypothesis

This broadens one-observation review into a small exception-review batch. This three-column batch does not allocate invoices or sum partial payments. The separate four-column order module sums user-assigned distinct transaction nets and warns about conflicting allocation; it still does not prove commercial settlement, persist a ledger or authorize refunds/collection. See order-review.md. Validate whether independent reviewers can correct and hand off real exception lists before expanding batch size or building a backend.
