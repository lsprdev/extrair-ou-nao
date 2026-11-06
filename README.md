# Extrair ou não extrair — Orion

Gabriel Lopes Pereira — Cenário, Parte 1 e Parte 2.

- [relatorio.md](relatorio.md): hipóteses, contagem manual, resultados e testes.
- [meu_ensaio.py](meu_ensaio.py): cobrança com cinco políticas de repetição.
- [meu_quantum.py](meu_quantum.py): comparação das formas e opção `--assincronas`.
- [tests/](tests/): testes das adaptações.
- [base/](base/): código e testes de Eduardo da Silva, checkpoint [07-remoto](https://github.com/eduardo-da-silva/fundamentos-arquitetura-code/tree/e37835c32e2d6458d01121d1a2d708bda5b5f260/07-remoto).

Python 3.12 ou superior:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python base/ensaio.py --varrer
python meu_ensaio.py --varrer
python meu_quantum.py --notificacoes-assincronas --banco-unico
python meu_quantum.py --notificacoes-assincronas --banco-por-servico
python meu_quantum.py --assincronas "Portal>Clientes,Checkout>Clientes" --banco-por-servico
python -m pytest -q
```

A rede é simulada: os scripts não fazem cobranças nem enviam mensagens reais.

## Apresentação

[apresentacao/](apresentacao/) traz uma apresentação animada dos resultados, por Gabriel Alves e Gabriel Lopes Pereira.
Quando o servidor sobe, ele roda `meu_ensaio.py`, `meu_quantum.py` e `base/ensaio.py` e serve os números ao frontend.
O servidor só usa a biblioteca padrão do Python.

```bash
docker compose up -d --build        # http://localhost:8000
PORTA=9000 docker compose up -d     # outra porta
python apresentacao/server.py       # sem Docker
```

Atalhos: `→`/`espaço` avançam, `←` volta, `F` abre tela cheia, `T` troca o tema. Cada slide guarda a etapa na URL (`#6.2`).
