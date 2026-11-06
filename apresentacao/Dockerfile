# Apresentação do projeto: roda as simulações e serve o frontend.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Só o necessário: o código da base, as adaptações e a apresentação.
# Nenhuma dependência externa: o servidor usa apenas a biblioteca padrão.
COPY base/ ./base/
COPY meu_ensaio.py meu_quantum.py ./
COPY apresentacao/ ./apresentacao/

RUN useradd --create-home --uid 10001 orion
USER orion

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/saude', timeout=2)"

CMD ["python", "apresentacao/server.py"]
