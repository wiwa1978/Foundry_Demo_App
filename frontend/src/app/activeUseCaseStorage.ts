import type { UseCaseId } from "@/app/types";
import { useCaseModules } from "@/app/useCaseRegistry";
import { readStorage, writeStorage } from "@/lib/storage";

const activeUseCaseStorageKey = "foundry-chat-active-use-case";
const fallbackUseCase: UseCaseId = "text_chat";

export function readActiveUseCase(): UseCaseId {
  const storedUseCase = readStorage(activeUseCaseStorageKey);
  return useCaseModules.some((useCase) => useCase.id === storedUseCase)
    ? (storedUseCase as UseCaseId)
    : fallbackUseCase;
}

export function writeActiveUseCase(useCase: UseCaseId) {
  writeStorage(activeUseCaseStorageKey, useCase);
}
