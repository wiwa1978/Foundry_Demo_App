import argparse
import mimetypes
from pathlib import Path

from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, ContentSettings

PREFIXES = {"document": "document-samples/", "audio": "audio-samples/"}
EXTENSIONS = {
    "document": {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"},
    "audio": {".wav", ".mp3", ".m4a", ".mp4", ".ogg", ".webm", ".flac"},
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed local documents and audio files for Content Extractor."
    )
    parser.add_argument("mode", choices=sorted(PREFIXES))
    parser.add_argument("directory", type=Path)
    parser.add_argument("--account-url", required=True)
    parser.add_argument("--container", default="foundry-rag-documents")
    args = parser.parse_args()

    if not args.directory.is_dir():
        raise ValueError(f"Directory does not exist: {args.directory}")
    files = sorted(
        file
        for file in args.directory.iterdir()
        if file.is_file() and file.suffix.lower() in EXTENSIONS[args.mode]
    )
    if not files:
        raise ValueError(f"No supported {args.mode} files found in {args.directory}")

    service = BlobServiceClient(args.account_url, credential=DefaultAzureCredential())
    container = service.get_container_client(args.container)
    try:
        if not container.exists():
            container.create_container()
        for file in files:
            content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
            blob_name = f"{PREFIXES[args.mode]}{file.name}"
            container.upload_blob(
                blob_name,
                file.read_bytes(),
                overwrite=True,
                metadata={
                    "title": file.stem.replace("-", " ").replace("_", " ").title(),
                    "description": f"Pre-positioned {args.mode} sample: {file.name}",
                },
                content_settings=ContentSettings(content_type=content_type),
            )
            print(f"Uploaded {blob_name}")
    finally:
        service.close()


if __name__ == "__main__":
    main()
