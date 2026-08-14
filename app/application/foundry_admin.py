from dataclasses import dataclass

from app.application.foundry_admin_config import (
    AdminConfigDocument,
    FoundryAdminConfig,
    admin_config_to_dict,
    load_admin_config,
)
from app.application.foundry_deployments import (
    DeploymentGuardrailPolicy,
    DeploymentRequest,
    DeploymentResult,
    DeploymentSummary,
    ModelRouterRouting,
    create_foundry_deployment,
    get_deployment_guardrail_policy,
    get_model_router_routing,
    list_foundry_deployments,
    update_model_router_routing,
)
from app.application.foundry_guardrails import (
    SYSTEM_GUARDRAIL_POLICY_COPIES,
    GuardrailContentFilter,
    GuardrailPolicy,
    create_system_guardrail_policy_copies,
    guardrail_policy_exists,
    list_guardrail_policies,
)
from app.application.ports.foundry_management import FoundryManagementGateway


@dataclass(frozen=True)
class AdministrationService:
    gateway: FoundryManagementGateway

    def list_guardrail_policies(self) -> list[GuardrailPolicy]:
        return list_guardrail_policies(self.gateway)

    def create_guardrail_policy_copies(self) -> list[GuardrailPolicy]:
        return create_system_guardrail_policy_copies(self.gateway)

    def list_deployments(self) -> list[DeploymentSummary]:
        return list_foundry_deployments(self.gateway)

    def guardrail_policy_exists(self, policy_name: str) -> bool:
        return guardrail_policy_exists(self.gateway, policy_name)

    def deployment_guardrail_policy(
        self,
        deployment_name: str,
    ) -> DeploymentGuardrailPolicy:
        return get_deployment_guardrail_policy(self.gateway, deployment_name)

    def create_deployment(self, request: DeploymentRequest) -> DeploymentResult:
        return create_foundry_deployment(self.gateway, request)

    def model_router_routing(self, deployment_name: str) -> ModelRouterRouting:
        return get_model_router_routing(self.gateway, deployment_name)

    def update_model_router_routing(
        self,
        deployment_name: str,
        mode: str,
    ) -> ModelRouterRouting:
        return update_model_router_routing(self.gateway, deployment_name, mode)


__all__ = [
    "AdminConfigDocument",
    "AdministrationService",
    "DeploymentGuardrailPolicy",
    "DeploymentRequest",
    "DeploymentResult",
    "DeploymentSummary",
    "ModelRouterRouting",
    "FoundryAdminConfig",
    "GuardrailContentFilter",
    "GuardrailPolicy",
    "SYSTEM_GUARDRAIL_POLICY_COPIES",
    "admin_config_to_dict",
    "create_foundry_deployment",
    "create_system_guardrail_policy_copies",
    "get_deployment_guardrail_policy",
    "get_model_router_routing",
    "guardrail_policy_exists",
    "list_foundry_deployments",
    "list_guardrail_policies",
    "update_model_router_routing",
    "load_admin_config",
]
