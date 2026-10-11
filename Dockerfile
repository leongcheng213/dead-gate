# DEAD GATE on Fly.io — stdlib-only Python, nothing to install.
FROM python:3.11-slim
WORKDIR /app
COPY server.py index.html main.js three.min.js render.yaml ./
COPY models ./models
EXPOSE 8080
# Fly injects $PORT (= internal_port); server.py prefers it over the CLI arg.
CMD ["sh", "-c", "python server.py $PORT"]
