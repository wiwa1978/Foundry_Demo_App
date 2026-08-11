import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { GuardrailPolicy, ModelSettings } from "@/app/workspace/contracts";

import { ModelSettingsPage } from "./ModelSettingsPage";

const draft: ModelSettings = {
  model: "gpt-5.5",
  api_surface: "responses",
  modalities: ["text"],
  system_prompt: "Be concise.",
  temperature: 0.7,
  top_p: 1,
  max_tokens: 1024,
  repetition_penalty: 1,
  guardrail_policy_names: [],
};

const policies: GuardrailPolicy[] = [
  {
    name: "Microsoft.Default",
    type: "SystemManaged",
    mode: "Blocking",
    content_filters: [],
    is_selectable: false,
  },
  {
    name: "Microsoft.DefaultV2",
    type: "SystemManaged",
    mode: "Blocking",
    content_filters: [],
    is_selectable: false,
  },
  {
    name: "NoGuardrails",
    type: "UserManaged",
    mode: "Blocking",
    content_filters: [],
    is_selectable: true,
  },
];

it("shows system-managed policies without allowing invalid request overrides", async () => {
  const user = userEvent.setup();
  render(
    <ModelSettingsPage
      model="gpt-5.5"
      draft={draft}
      saving={false}
      policies={policies}
      deploymentPolicy={{
        deployment_name: "gpt-5.5",
        policy_name: "NoGuardrails",
      }}
      policiesLoading={false}
      error=""
      onClose={vi.fn()}
      onSave={vi.fn()}
      onReset={vi.fn()}
      onChange={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("tab", { name: "Guardrails" }));

  expect(
    screen.getAllByRole("option", {
      name: "Microsoft.Default (system-managed; deployment only)",
    })[0],
  ).toBeDisabled();
  expect(
    screen.getAllByRole("option", {
      name: "Microsoft.DefaultV2 (system-managed; deployment only)",
    })[0],
  ).toBeDisabled();
  expect(
    screen.getAllByRole("option", { name: "NoGuardrails" })[0],
  ).toBeEnabled();
  expect(
    screen.getByText(/cannot be sent as request-level overrides/i),
  ).toBeVisible();
});
