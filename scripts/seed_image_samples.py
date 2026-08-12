import argparse
from urllib.parse import urlparse
from urllib.request import urlopen

from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, ContentSettings

SAMPLES = (
    {
        "filename": "mountain-lake.jpg",
        "title": "Mountain lake",
        "attribution": "Luca Bravo on Unsplash",
        "source_url": "https://unsplash.com/photos/O453M2Liufs",
        "download_url": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=85",
    },
    {
        "filename": "city-street.jpg",
        "title": "City street",
        "attribution": "Jacek Dylag on Unsplash",
        "source_url": "https://unsplash.com/photos/jo8C9bt3uo8",
        "download_url": "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1400&q=85",
    },
    {
        "filename": "forest-path.jpg",
        "title": "Forest path",
        "attribution": "Casey Horner on Unsplash",
        "source_url": "https://unsplash.com/photos/4rDCa5hBlCs",
        "download_url": "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1400&q=85",
    },
    {
        "filename": "portrait.jpg",
        "title": "Studio portrait",
        "attribution": "Christopher Campbell on Unsplash",
        "source_url": "https://unsplash.com/photos/rDEOVtE7vOs",
        "download_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=85",
    },
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed image-to-image samples in private Blob Storage."
    )
    parser.add_argument(
        "--account-url",
        required=True,
        help="Blob endpoint, for example https://name.blob.core.windows.net",
    )
    parser.add_argument("--container", default="foundry-rag-documents")
    args = parser.parse_args()

    service = BlobServiceClient(args.account_url, credential=DefaultAzureCredential())
    container = service.get_container_client(args.container)
    try:
        if not container.exists():
            container.create_container()
        for sample in SAMPLES:
            download_url = sample["download_url"]
            if urlparse(download_url).scheme != "https":
                raise ValueError("Sample download URLs must use HTTPS.")
            with urlopen(download_url, timeout=30) as response:  # noqa: S310
                image = response.read()
            blob_name = f"image-samples/{sample['filename']}"
            container.upload_blob(
                blob_name,
                image,
                overwrite=True,
                metadata={key: sample[key] for key in ("title", "attribution", "source_url")},
                content_settings=ContentSettings(content_type="image/jpeg"),
            )
            print(f"Uploaded {blob_name}")
    finally:
        service.close()


if __name__ == "__main__":
    main()
