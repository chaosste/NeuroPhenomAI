# Domain Onboarding v1 Runbook

This runbook uses `scripts/domain_onboard.sh` to set Cloudflare DNS records required for Azure custom-domain validation.

## Purpose

For each app/domain cutover, the script:

1. Upserts Cloudflare `CNAME` for the app host.
2. Upserts Cloudflare `TXT` verification record (`asuid.<host>`).
3. Polls DNS propagation locally (`dig`) when available.
4. Prints the Azure add/bind next steps.

## Prerequisites

1. `bash`, `curl`, `jq` installed.
2. Cloudflare API token with:
   - Zone:Read
   - DNS:Edit
3. Azure Web App already exists.
4. Azure Custom Domain Verification ID copied from:
   - Web App -> Custom domains

## Configure

```bash
cp config/domain-onboard.template.env config/domain-onboard.env
```

Fill in:

- `CLOUDFLARE_API_TOKEN`
- `CF_ZONE_NAME`
- `SUBDOMAIN_HOST`
- `AZURE_WEBAPP_HOSTNAME`
- `AZURE_VERIFICATION_ID`

## Dry run

```bash
scripts/domain_onboard.sh --config config/domain-onboard.env --dry-run
```

## Apply

```bash
scripts/domain_onboard.sh --config config/domain-onboard.env
```

## Azure finish (portal)

1. Web App -> Custom domains -> Add custom domain
2. Enter full host (`<SUBDOMAIN_HOST>.<CF_ZONE_NAME>`)
3. Hostname record type: `CNAME`
4. Validate + Add
5. Add binding:
   - Certificate: App Service Managed Certificate
   - TLS type: SNI SSL

## Safe cutover pattern

1. Add new domain and validate SSL first.
2. Test `https://<new-domain>/api/health`.
3. Only then remove old domain binding from Azure and repoint old DNS.

## Troubleshooting

- `81053` host exists in Cloudflare:
  - Expected if record already exists; script updates existing record.
- Azure validation fails on TXT:
  - Ensure TXT host is `asuid.<SUBDOMAIN_HOST>` (not just `asuid` for subdomains).
- Validation works but HTTPS fails:
  - Wait for managed cert issuance (usually minutes).
