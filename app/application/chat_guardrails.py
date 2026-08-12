from app.core.errors import InvalidRequestError
from app.domain.models import DEPLOYMENT_DEFAULT_GUARDRAIL, GuardrailVariant, ModelSettings

GuardrailOption = tuple[GuardrailVariant | None, str | None]


def guardrail_variants(
    model_settings: ModelSettings,
    enabled: bool,
) -> list[GuardrailOption]:
    if not enabled:
        return [(None, None)]
    if len(model_settings.guardrail_policy_names) != 2:
        raise InvalidRequestError(
            f"Guardrail comparison is enabled for {model_settings.model}, "
            "but two policies are not selected."
        )
    return [
        (
            "policy_1" if index == 0 else "policy_2",
            None if policy_name == DEPLOYMENT_DEFAULT_GUARDRAIL else policy_name,
        )
        for index, policy_name in enumerate(model_settings.guardrail_policy_names)
    ]
