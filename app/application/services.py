from dataclasses import dataclass

from app.application.chat import ChatService
from app.application.conversations import ConversationService
from app.application.foundry_admin import AdministrationService
from app.application.models import ModelService
from app.application.use_case_settings import UseCaseSettingsService


@dataclass(frozen=True)
class ApplicationServices:
    chat: ChatService
    administration: AdministrationService
    conversations: ConversationService
    models: ModelService
    use_case_settings: UseCaseSettingsService
