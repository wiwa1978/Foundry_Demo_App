from app.application.chat import ChatService
from app.application.conversations import ConversationService
from app.application.foundry_admin import AdministrationService
from app.application.models import ModelService
from app.application.services import ApplicationServices
from app.application.use_case_settings import UseCaseSettingsService
from app.infrastructure.azure.foundry.gateway import DefaultFoundryChatGateway
from app.infrastructure.azure.foundry.management import DefaultFoundryManagementGateway
from app.infrastructure.persistence.registry import get_repositories
from usecases_media.document_qa.backend.gateway import AzureDocumentGateway
from usecases_media.document_qa.backend.service import DocumentQaService
from usecases_media.shared.voice.backend.service import TraditionalVoiceService


def build_application_services() -> ApplicationServices:
    repositories = get_repositories()
    return ApplicationServices(
        chat=ChatService(
            gateway=DefaultFoundryChatGateway(),
            conversations=repositories.conversations,
            models=repositories.model_settings,
        ),
        administration=AdministrationService(DefaultFoundryManagementGateway()),
        conversations=ConversationService(repositories.conversations),
        models=ModelService(repositories.model_settings),
        use_case_settings=UseCaseSettingsService(repositories.use_case_settings),
    )


def build_document_qa_service(services: ApplicationServices) -> DocumentQaService:
    return DocumentQaService(services.chat, AzureDocumentGateway())


def build_traditional_voice_service(
    services: ApplicationServices,
) -> TraditionalVoiceService:
    return TraditionalVoiceService(services.chat)
