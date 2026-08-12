import { AppSettingsPage } from "@/app/workspace/AppSettingsPage";
import { ModelSettingsPage } from "@/app/workspace/ModelSettingsPage";

import type {
  WorkspaceContentRoute,
  WorkspaceSettingsViewModel,
} from "./contracts";

export function SettingsRoute({
  route,
  settings,
}: {
  route: WorkspaceContentRoute;
  settings: WorkspaceSettingsViewModel;
}) {
  if (route.view === "settings") {
    return <AppSettingsPage {...settings.app} />;
  }

  if (settings.model.settingsModel) {
    return (
      <ModelSettingsPage
        model={settings.model.settingsModel}
        draft={settings.model.draft}
        saving={settings.model.saving}
        policies={settings.model.policies}
        deploymentPolicy={settings.model.deploymentPolicy}
        policiesLoading={settings.model.policiesLoading}
        creatingPolicyCopies={settings.model.creatingPolicyCopies}
        error={settings.model.error}
        onClose={settings.model.onClose}
        onSave={() => void settings.model.save()}
        onCreatePolicyCopies={() => void settings.model.createPolicyCopies()}
        onReset={settings.model.resetDraft}
        onChange={settings.model.changeDraft}
      />
    );
  }

  return null;
}
