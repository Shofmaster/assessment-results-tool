# Search Console and Bing Setup (AeroGap)

This runbook covers domain verification, sitemap submission, and first checks for indexing.

> Canonical host: `https://www.aerogaptechnologies.com`. Legacy hosts `aerogap.com` and `www.aerogap.com` are configured in `vercel.json` to 301-redirect to the canonical.

## 1) Google Search Console

1. Go to [https://search.google.com/search-console](https://search.google.com/search-console) and add property `aerogaptechnologies.com` as a Domain property (covers all subdomains, including `www`).
2. Copy the TXT verification value provided by Google.
3. Add TXT record at DNS host for `aerogaptechnologies.com`.
4. After DNS propagates, click Verify in Search Console.
5. Submit sitemap: `https://www.aerogaptechnologies.com/sitemap.xml`.
6. Use URL Inspection on these URLs:
   - `https://www.aerogaptechnologies.com/`
   - `https://www.aerogaptechnologies.com/aviation-compliance-audit-services`
   - `https://www.aerogaptechnologies.com/aviation-quality-software`
7. Request indexing for any page that is not yet discovered.
8. (Optional) Keep the old `aerogap.com` property in Search Console with the Change-of-Address tool pointing to `aerogaptechnologies.com` until redirects are fully recognized.

## 2) Bing Webmaster Tools

1. Go to [https://www.bing.com/webmasters](https://www.bing.com/webmasters).
2. Import site from Search Console when possible.
3. If needed, verify with DNS TXT record for `aerogaptechnologies.com`.
4. Submit sitemap: `https://www.aerogaptechnologies.com/sitemap.xml`.

## 3) Post-verification checks (same day)

- Confirm `robots.txt` resolves at `https://www.aerogaptechnologies.com/robots.txt`.
- Confirm sitemap resolves and returns all target URLs.
- Confirm canonical host redirect works:
  - `https://aerogap.com/aviation-quality-software` -> `https://www.aerogaptechnologies.com/aviation-quality-software`.
  - `https://www.aerogap.com/aviation-quality-software` -> `https://www.aerogaptechnologies.com/aviation-quality-software`.
  - `https://aerogaptechnologies.com/aviation-quality-software` -> `https://www.aerogaptechnologies.com/aviation-quality-software`.

## 4) First 30-day tracking baseline

Record these values at day 0:

- Indexed pages (Google)
- Total impressions
- Total clicks
- Average position
- CTR

Create a weekly capture cadence (same weekday each week).
