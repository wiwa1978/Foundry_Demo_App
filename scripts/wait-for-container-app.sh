#!/usr/bin/env bash
set -euo pipefail

max_attempts=40
delay_seconds=15
error_file=$(mktemp)
trap 'rm -f "$error_file"' EXIT

for ((attempt = 1; attempt <= max_attempts; attempt++)); do
  if ! state=$(az containerapp show \
      --resource-group "$RESOURCE_GROUP_NAME" \
      --name "$CONTAINER_APP_NAME" \
      --query properties.provisioningState \
      --output tsv 2>"$error_file"); then
    error=$(<"$error_file")
    if [[ "$error" == *"ResourceNotFound"* ]]; then
      exit 0
    fi
    echo "$error" >&2
    exit 1
  fi

  state=${state//$'\r'/}

  case "$state" in
    Succeeded)
      exit 0
      ;;
    Failed|Canceled)
      echo "Container App provisioning ended in state '$state'." >&2
      exit 1
      ;;
    *)
      echo "Container App provisioning is '$state'; waiting ($attempt/$max_attempts)."
      sleep "$delay_seconds"
      ;;
  esac
done

echo "Timed out waiting for Container App provisioning to finish." >&2
exit 1
