# RBAC guidance

## GitHub deployment identity

The bootstrap script currently grants subscription-level `Contributor` and `User Access
Administrator` because it provisions resource groups and role assignments. This is intentionally a
bootstrap convenience, not the recommended steady state.

After initial provisioning, replace those grants with scoped assignments:

- Contributor on the app resource group
- Contributor only on shared resources the workflow updates
- Role Based Access Control Administrator on the specific resource groups where role assignments are managed
- AcrPush on the target registry when replacing ACR Tasks with a local Docker push workflow

Validate deployment after narrowing access, then remove subscription-level grants.

## Runtime managed identity

The application uses resource-scoped data-plane roles where possible. `Search Service Contributor`
is currently required because the demo creates/updates its Search index at runtime. Move index
provisioning fully to infrastructure before removing that management role.

Never assign Owner to either identity.
