FROM python:3.13-slim

# Keep the runtime self-contained so Foundry can start the image without
# installing dependencies at deployment time.
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The image entry point must start the Responses protocol server.
COPY main.py .
# Bundled Foundry Skill(s), read by load_skill_instructions() in main.py at
# startup. Refresh with ..\skills\download_skill.py, then rebuild the image.
COPY skills ./skills

CMD ["python", "main.py"]
