#!/usr/bin/env bash
set -euo pipefail

bash scripts/wait-for-container-app.sh

max_attempts=40
delay_seconds=15

revision=""
for ((attempt = 1; attempt <= max_attempts; attempt++)); do
  app_json=$(az containerapp show \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --name "$CONTAINER_APP_NAME" \
    --output json)
  latest_revision=$(jq -r '.properties.latestRevisionName // empty' <<< "$app_json")
  ready_revision=$(jq -r '.properties.latestReadyRevisionName // empty' <<< "$app_json")
  running_image=$(jq -r '.properties.template.containers[0].image // empty' <<< "$app_json")
  health_state=$(az containerapp revision show \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --name "$CONTAINER_APP_NAME" \
    --revision "$latest_revision" \
    --query properties.healthState \
    --output tsv 2>/dev/null || true)

  latest_revision=${latest_revision//$'\r'/}
  ready_revision=${ready_revision//$'\r'/}
  running_image=${running_image//$'\r'/}
  health_state=${health_state//$'\r'/}

  if [[ "$latest_revision" == "$ready_revision" && "$health_state" == "Healthy" ]]; then
    revision="$ready_revision"
    break
  fi
  echo "Revision '$latest_revision' is not ready and healthy yet ($attempt/$max_attempts)."
  sleep "$delay_seconds"
done

if [[ -z "$revision" ]]; then
  echo "Container App did not expose a healthy ready revision." >&2
  exit 1
fi

if [[ -n "${EXPECTED_IMAGE:-}" && "$running_image" != "$EXPECTED_IMAGE" ]]; then
  echo "Expected image '$EXPECTED_IMAGE' but Container App runs '$running_image'." >&2
  exit 1
fi

echo "Smoke test passed for healthy revision $revision running $running_image."
