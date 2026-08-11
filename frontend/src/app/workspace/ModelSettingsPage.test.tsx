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
  {
    name: "FoundryChat-Microsoft-Default",
    type: "UserManaged",
    mode: "Blocking",
    base_policy_name: "Microsoft.Default",
    content_filters: [],
    is_selectable: true,
  },
  {
    name: "FoundryChat-Microsoft-DefaultV2",
    type: "UserManaged",
    mode: "Blocking",
    base_policy_name: "Microsoft.DefaultV2",
    content_filters: [],
    is_selectable: true,
  },
];

it("shows system-managed policies without allowing invalid request overrides", async () => {
  const user = userEvent.setup();
  const onCreatePolicyCopies = vi.fn();
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
      creatingPolicyCopies={false}
      error=""
      onClose={vi.fn()}
      onSave={vi.fn()}
      onCreatePolicyCopies={onCreatePolicyCopies}
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
    screen.getAllByRole("option", {
      name: "Microsoft.Default (selectable copy)",
    })[0],
  ).toBeEnabled();
  expect(
    screen.getAllByRole("option", {
      name: "Microsoft.DefaultV2 (selectable copy)",
    })[0],
  ).toBeEnabled();
  await user.click(
    screen.getByRole("button", { name: "Create selectable copies" }),
  );
  expect(onCreatePolicyCopies).toHaveBeenCalledOnce();
  expect(
    screen.getByText(/cannot be sent as request-level overrides/i),
  ).toBeVisible();
});
