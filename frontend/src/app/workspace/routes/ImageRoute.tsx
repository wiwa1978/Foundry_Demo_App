import { ImageComparisonWorkspace } from "@media/image_comparison/frontend";
import { ImageToImageWorkspace } from "@media/image_to_image/frontend";
import { TextToImageWorkspace } from "@media/text_to_image/frontend";

import type {
  WorkspaceContentRoute,
  WorkspaceImagesViewModel,
} from "./contracts";

export function ImageRoute({
  route,
  images,
}: {
  route: WorkspaceContentRoute;
  images: WorkspaceImagesViewModel;
}) {
  if (route.workspace === "image") {
    return (
      <TextToImageWorkspace
        model={images.model}
        models={images.models}
        prompt={images.prompt}
        submittedPrompt={images.submittedPrompt}
        size={images.size}
        result={images.result}
        generating={images.generating}
        error={images.error}
        saveToGallery={images.saveToGallery}
        onPromptChange={images.setPrompt}
        onSizeChange={images.setSize}
        onModelChange={images.setModel}
        onSaveToGalleryChange={images.setSaveToGallery}
        onGenerate={() => void images.runGeneration()}
      />
    );
  }

  if (route.workspace === "imageEdit") {
    return (
      <ImageToImageWorkspace
        model={images.model}
        models={images.editModels}
        prompt={images.prompt}
        size={images.size}
        source={images.editSource}
        result={images.editResult}
        generating={images.editGenerating}
        error={images.editError}
        onPromptChange={images.setPrompt}
        onSizeChange={images.setSize}
        onSourceChange={images.setEditSource}
        onModelChange={images.setModel}
        onGenerate={() => void images.runEdit()}
      />
    );
  }

  return (
    <ImageComparisonWorkspace
      allModels={images.models}
      models={images.selected}
      prompt={images.prompt}
      size={images.size}
      results={images.comparisonResults}
      errors={images.comparisonErrors}
      generating={images.comparisonGenerating}
      onPromptChange={images.setPrompt}
      onSizeChange={images.setSize}
      onGenerate={() => void images.runComparison()}
      onOpenSettings={images.onOpenSettings}
      onModelChange={images.replaceComparisonModel}
    />
  );
}
