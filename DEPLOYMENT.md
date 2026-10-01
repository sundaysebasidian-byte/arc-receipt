# Static deployment instructions

This folder is a candidate, not an existing deployment. No credentials are included. The owner approved publication of this source repository under MIT at https://github.com/sundaysebasidian-byte/arc-receipt. Website hosting, its account/terms, and external organizer contact require separate authorization. This script does not publish anything.

1. Run `python3 scripts/prepare-publication.py`. Keep `release/pages/` or `release/arc-pages-assets.zip` for Cloudflare Pages Free Direct Upload. It contains exactly eight files at the ZIP root, with no backend or Functions.
2. After publication approval, the owner can upload that ZIP/folder in the Cloudflare dashboard following https://developers.cloudflare.com/pages/get-started/direct-upload/. Registration/login or new terms remain owner controlled. Estimated free static hosting is $0/month; no paid domain or verification gas is required. Free-plan/RPC limits may change.
3. Optional CLI route after approval: install or invoke the official pinned `wrangler@4.145.0` (Node >=22), complete owner-controlled login, choose the exact approved account/project, then `node scripts/deploy-pages.mjs --project YOUR_PROJECT --account APPROVED_ACCOUNT_ID --publish-approved`. The default invocation only prints instructions. The script does not create a project or log in. If Wrangler requests a new account/project or terms unexpectedly, stop for the owner.
4. In a fresh source checkout, create a new Git repository and upload only this source candidate to the approved GitHub destination. Do not upload an older local Git history.
5. Verify the deployed root URL loads, the eight runtime assets return successful responses, _headers were applied, and the browser can read the official Arc RPC. Re-run both public examples and download/reimport evidence. Never treat successful hosting as grant qualification.

Direct Upload cannot later be switched into Git integration without a new project. Wrangler accepts a folder; the dashboard accepts a folder or ZIP. Ordinary GitHub Pages project subpaths require URL adjustment because runtime assets currently use root-relative paths.
