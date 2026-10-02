# GitHub Pages deployment

Public demo: https://sundaysebasidian-byte.github.io/arc-receipt/

The site uses the existing public MIT repository, `main` branch, `/docs` publishing folder and GitHub's built-in Pages build/deployment. No custom Actions permissions, new hosting account, custom domain or paid resource is required.

1. Run `npm test` for the 105 offline tests.
2. Run `node scripts/build-github-pages.mjs`. This copies the eleven browser assets and generates `.nojekyll` plus the asset manifest in `docs/`. Module and CSS bytes are preserved. The HTML uses relative asset links, an early CSP meta tag and a no-referrer meta tag.
3. Commit the reviewed source and generated `docs/` assets on `main`, preserving public history. Do not upload private development history, credentials or grant application material.
4. Repository Settings → Pages → Deploy from a branch → `main` → `/docs`. This is already the selected deployment target for this repository; subsequent pushes publish changes through GitHub's built-in Pages workflow.
5. Check the Pages workflow commit, fetch the public manifest/assets, and verify the single-transaction, batch, order, error and evidence-export flows in a fresh browser.

GitHub Pages ignores the alternative Cloudflare `web/_headers` file. Meta CSP cannot provide `frame-ancestors` or `X-Content-Type-Options`; no equivalent header claim is made. The app uses only https://rpc.mainnet.arc.io for public chain reads. CSV files, addresses, order labels and expected amounts stay in browser memory.

Running `scripts/prepare-publication.py` produces separate offline/Cloudflare candidates; it does not rebuild or publish the GitHub Pages folder. `scripts/deploy-pages.mjs` is the optional Cloudflare helper and defaults to instructions only.

Hosting is a public demonstration of software, not confirmation of grant eligibility. No grant application, organizer contact, wallet operation or chain transaction is part of this deployment.

References: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
