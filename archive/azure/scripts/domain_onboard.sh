#!/usr/bin/env bash
set -euo pipefail

# Domain onboarding helper for Cloudflare + Azure App Service custom domains.
#
# Usage:
#   scripts/domain_onboard.sh --config config/domain-onboard.env
#   scripts/domain_onboard.sh --config config/domain-onboard.env --dry-run
#
# Required config keys:
#   CLOUDFLARE_API_TOKEN
#   CF_ZONE_NAME
#   SUBDOMAIN_HOST
#   AZURE_WEBAPP_HOSTNAME
#   AZURE_VERIFICATION_ID
#
# Optional:
#   CF_PROXIED=false
#   CF_TTL=120
#   AZURE_WEBAPP_NAME
#   AZURE_RESOURCE_GROUP
#   DIG_RETRIES=12
#   DIG_SLEEP_SECONDS=10

SCRIPT_NAME="$(basename "$0")"
DRY_RUN="false"
CONFIG_FILE=""

usage() {
  cat <<EOF
$SCRIPT_NAME - Cloudflare DNS + Azure custom-domain prep

Flags:
  --config <path>   Path to env-style config file
  --dry-run         Print intended changes without writing Cloudflare records
  -h, --help        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG_FILE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$CONFIG_FILE" ]]; then
  echo "Missing --config." >&2
  usage
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command missing: $1" >&2
    exit 1
  }
}

require_var() {
  local var_name="$1"
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required config variable: $var_name" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd jq

require_var "CLOUDFLARE_API_TOKEN"
require_var "CF_ZONE_NAME"
require_var "SUBDOMAIN_HOST"
require_var "AZURE_WEBAPP_HOSTNAME"
require_var "AZURE_VERIFICATION_ID"

CF_PROXIED="${CF_PROXIED:-false}"
CF_TTL="${CF_TTL:-120}"
DIG_RETRIES="${DIG_RETRIES:-12}"
DIG_SLEEP_SECONDS="${DIG_SLEEP_SECONDS:-10}"

CF_API_BASE="https://api.cloudflare.com/client/v4"
FULL_SUBDOMAIN="${SUBDOMAIN_HOST}.${CF_ZONE_NAME}"
TXT_HOST="asuid.${SUBDOMAIN_HOST}"
FULL_TXT_HOST="${TXT_HOST}.${CF_ZONE_NAME}"

cf_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local response

  if [[ -n "$body" ]]; then
    response="$(curl -sS -X "$method" "${CF_API_BASE}${path}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$body")"
  else
    response="$(curl -sS -X "$method" "${CF_API_BASE}${path}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json")"
  fi

  local success
  success="$(echo "$response" | jq -r '.success // false')"
  if [[ "$success" != "true" ]]; then
    echo "Cloudflare API error on ${method} ${path}" >&2
    echo "$response" | jq -r '.errors // empty' >&2
    exit 1
  fi
  echo "$response"
}

echo "Resolving zone ID for ${CF_ZONE_NAME}..."
ZONE_RESPONSE="$(cf_api GET "/zones?name=${CF_ZONE_NAME}")"
ZONE_ID="$(echo "$ZONE_RESPONSE" | jq -r '.result[0].id // empty')"
if [[ -z "$ZONE_ID" ]]; then
  echo "Zone not found for ${CF_ZONE_NAME}" >&2
  exit 1
fi
echo "Zone ID: ${ZONE_ID}"

upsert_cname() {
  local name="$1"
  local content="$2"
  local proxied="$3"
  local ttl="$4"
  local full_name="${name}.${CF_ZONE_NAME}"

  local existing
  existing="$(cf_api GET "/zones/${ZONE_ID}/dns_records?type=CNAME&name=${full_name}")"
  local count
  count="$(echo "$existing" | jq '.result | length')"

  local desired_json
  desired_json="$(jq -cn \
    --arg type "CNAME" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied "$proxied" \
    --argjson ttl "$ttl" \
    '{type:$type,name:$name,content:$content,proxied:$proxied,ttl:$ttl}')"

  if [[ "$count" -eq 0 ]]; then
    echo "Creating CNAME ${full_name} -> ${content} (proxied=${proxied})"
    if [[ "$DRY_RUN" == "false" ]]; then
      cf_api POST "/zones/${ZONE_ID}/dns_records" "$desired_json" >/dev/null
    fi
    return
  fi

  local record_id current_content current_proxied
  record_id="$(echo "$existing" | jq -r '.result[0].id')"
  current_content="$(echo "$existing" | jq -r '.result[0].content')"
  current_proxied="$(echo "$existing" | jq -r '.result[0].proxied')"

  if [[ "$current_content" == "$content" && "$current_proxied" == "$proxied" ]]; then
    echo "CNAME ${full_name} already correct."
    return
  fi

  echo "Updating CNAME ${full_name} -> ${content} (proxied=${proxied})"
  if [[ "$DRY_RUN" == "false" ]]; then
    cf_api PUT "/zones/${ZONE_ID}/dns_records/${record_id}" "$desired_json" >/dev/null
  fi
}

upsert_txt() {
  local name="$1"
  local content="$2"
  local ttl="$3"
  local full_name="${name}.${CF_ZONE_NAME}"

  local existing
  existing="$(cf_api GET "/zones/${ZONE_ID}/dns_records?type=TXT&name=${full_name}")"
  local count
  count="$(echo "$existing" | jq '.result | length')"

  local desired_json
  desired_json="$(jq -cn \
    --arg type "TXT" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson ttl "$ttl" \
    '{type:$type,name:$name,content:$content,ttl:$ttl}')"

  if [[ "$count" -eq 0 ]]; then
    echo "Creating TXT ${full_name}"
    if [[ "$DRY_RUN" == "false" ]]; then
      cf_api POST "/zones/${ZONE_ID}/dns_records" "$desired_json" >/dev/null
    fi
    return
  fi

  local record_id current_content
  record_id="$(echo "$existing" | jq -r '.result[0].id')"
  current_content="$(echo "$existing" | jq -r '.result[0].content')"

  if [[ "$current_content" == "$content" ]]; then
    echo "TXT ${full_name} already correct."
    return
  fi

  echo "Updating TXT ${full_name}"
  if [[ "$DRY_RUN" == "false" ]]; then
    cf_api PUT "/zones/${ZONE_ID}/dns_records/${record_id}" "$desired_json" >/dev/null
  fi
}

echo
echo "Applying Cloudflare DNS records..."
upsert_cname "$SUBDOMAIN_HOST" "$AZURE_WEBAPP_HOSTNAME" "$CF_PROXIED" "$CF_TTL"
upsert_txt "$TXT_HOST" "$AZURE_VERIFICATION_ID" "$CF_TTL"

echo
echo "Waiting for DNS visibility..."
if command -v dig >/dev/null 2>&1; then
  for i in $(seq 1 "$DIG_RETRIES"); do
    cname_result="$(dig +short CNAME "$FULL_SUBDOMAIN" | tr -d '\r' | sed 's/\.$//')"
    txt_result="$(dig +short TXT "$FULL_TXT_HOST" | tr -d '"' | tr -d '\r')"

    if [[ "$cname_result" == "$AZURE_WEBAPP_HOSTNAME" && "$txt_result" == "$AZURE_VERIFICATION_ID" ]]; then
      echo "DNS verification records visible."
      break
    fi

    if [[ "$i" -eq "$DIG_RETRIES" ]]; then
      echo "DNS still propagating. Continue in Azure after a few minutes." >&2
      break
    fi
    sleep "$DIG_SLEEP_SECONDS"
  done
else
  echo "dig not found; skipping local DNS propagation check."
fi

echo
echo "Next Azure steps:"
echo "1) Azure Portal -> Web App -> Custom domains -> Add custom domain"
echo "2) Domain: ${FULL_SUBDOMAIN}"
echo "3) Hostname record type: CNAME"
echo "4) Validate + Add"
echo "5) Add binding -> App Service Managed Certificate + SNI SSL"

if [[ -n "${AZURE_WEBAPP_NAME:-}" && -n "${AZURE_RESOURCE_GROUP:-}" ]]; then
  cat <<EOF

Optional Azure CLI add command:
az webapp config hostname add --webapp-name "${AZURE_WEBAPP_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --hostname "${FULL_SUBDOMAIN}"
EOF
fi

echo
echo "Completed."
