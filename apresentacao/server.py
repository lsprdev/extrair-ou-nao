"""Servidor da apresentação: roda as simulações do projeto e serve o frontend.

Nada aqui inventa números: os dados vêm de `meu_ensaio.py`, `meu_quantum.py`
e de `base/ensaio.py`, executados quando o servidor sobe.

    python apresentacao/server.py          # http://localhost:8000
    PORT=9000 python apresentacao/server.py
"""

from __future__ import annotations

import json
import os
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "base"))

import meu_ensaio  # noqa: E402  (também adiciona base/ ao caminho)
import meu_quantum as mq  # noqa: E402
import ensaio as ensaio_base  # noqa: E402  (base/ensaio.py, do professor)
from mini_orion.montagem import montar_remoto  # noqa: E402
from mini_orion.nucleo.modelos import ChaveIdempotencia  # noqa: E402
from mini_orion.rede.api import CAMPANHA, TIMEOUT_POR_CHAMADA  # noqa: E402

ESTATICOS = Path(__file__).resolve().parent / "static"
N = 2000
SEMENTE = 42

FORMAS = {
    "monolito": ("Monólito", mq.forma_monolito),
    "extracao": ("Só Notificações separado", mq.forma_extracao),
    "dominio": ("Por domínio", mq.forma_service_based),
    "micro": ("Microsserviços", mq.forma_microsservicos),
}


# ---------------------------------------------------------------- Parte 1

def rastrear(parametros, semente: int, tentativas: int, com_chave: bool) -> list[list]:
    """Mesmo laço de `meu_ensaio.rodar`, mas guarda cada compra.

    Cada item é [desfecho, cobranças, duração em ms], com desfecho
    1 = confirmado e 0 = cobrança indeterminada.
    """
    gerar_chave = ChaveIdempotencia.nova if com_chave else (lambda: None)
    cenario = montar_remoto(parametros, semente, tentativas=tentativas, gerar_chave=gerar_chave)
    compras = []
    for _ in range(N):
        antes = len(cenario.pagamentos.cobrancas_aprovadas)
        inicio = cenario.relogio.agora()
        desfecho = cenario.checkout.fechar_pedido(meu_ensaio.carrinho(), meu_ensaio.CLIENTE)
        duracao = cenario.relogio.agora() - inicio
        cobrancas = len(cenario.pagamentos.cobrancas_aprovadas) - antes
        compras.append([int(desfecho == "confirmado"), cobrancas, round(duracao * 1000)])
    return compras


def resumo(r) -> dict:
    return {
        "duplicadas": r.duplicadas,
        "incertos": r.indeterminados,
        "cobrado_sem_pedido": r.cobrados_sem_pedido,
        "confirmados": r.confirmados,
        "pior_s": round(max(r.duracoes), 2),
        "p50_ms": round(r.percentil(0.50) * 1000),
        "p95_ms": round(r.percentil(0.95) * 1000),
        "p99_ms": round(r.percentil(0.99) * 1000),
        "na_cauda": r.na_cauda,
    }


def politica_id(tentativas: int, com_chave: bool) -> str:
    return f"{tentativas}{'c' if com_chave else 's'}"


def dados_parte1() -> dict:
    novo = []
    for nome, tentativas, com_chave in meu_ensaio.POLITICAS:
        r = meu_ensaio.rodar(N, SEMENTE, tentativas, com_chave)
        compras = rastrear(meu_ensaio.MEU_CENARIO, SEMENTE, tentativas, com_chave)
        # O rastro precisa bater com o ensaio original.
        assert sum(1 for c in compras if c[1] > 1) == r.duplicadas
        assert sum(1 for c in compras if c[0] == 0) == r.indeterminados
        novo.append({
            "id": politica_id(tentativas, com_chave),
            "nome": nome,
            "tentativas": tentativas,
            "com_chave": com_chave,
            **resumo(r),
            "compras": compras,
        })

    base = []
    for tentativas, com_chave in [(1, False), (2, False), (2, True), (3, True)]:
        r = ensaio_base.rodar(N, SEMENTE, tentativas, com_chave)
        base.append({"id": politica_id(tentativas, com_chave), "tentativas": tentativas,
                     "com_chave": com_chave, **resumo(r)})

    varredura = []
    for semente in range(1, 11):
        rb = ensaio_base.rodar(N, semente, 2, False)
        rn = meu_ensaio.rodar(N, semente, 2, False)
        varredura.append({
            "semente": semente,
            "p95_base": round(rb.percentil(0.95) * 1000),
            "p95_novo": round(rn.percentil(0.95) * 1000),
            "timeout_base": rb.na_cauda / N,
            "timeout_novo": rn.na_cauda / N,
            "dup_base": rb.duplicadas / N,
            "dup_novo": rn.duplicadas / N,
        })

    def hip(p):
        return {"mediana_ms": round(p.latencia_mediana * 1000), "p99_ms": round(p.latencia_p99 * 1000),
                "falha": p.taxa_falha, "perda_na_volta": p.proporcao_perda_na_volta}

    return {
        "hipoteses": {
            "novo": hip(meu_ensaio.MEU_CENARIO),
            "base": hip(CAMPANHA),
            "timeout_s": TIMEOUT_POR_CHAMADA,
            "compras": N,
            "semente": SEMENTE,
        },
        "novo": novo,
        "base": base,
        "varredura": varredura,
    }


# ---------------------------------------------------------------- Parte 2

def grupos_de_quanta(forma, assincronas, banco_compartilhado) -> list[list[str]]:
    """Mesma união de `meu_quantum.quanta`, devolvendo os grupos em vez da contagem."""
    pai = {c: c for c in mq.COMPONENTES}

    def raiz(c):
        while pai[c] != c:
            pai[c] = pai[pai[c]]
            c = pai[c]
        return c

    ligacoes = [(a, b) for a in mq.COMPONENTES for b in mq.COMPONENTES if forma[a] == forma[b]]
    ligacoes += [e for e in mq.ARESTAS if e not in assincronas]
    if banco_compartilhado:
        ligacoes += [(mq.COMPONENTES[0], c) for c in mq.COMPONENTES[1:]]
    for a, b in ligacoes:
        pai[raiz(a)] = raiz(b)
    grupos: dict[str, list[str]] = {}
    for c in mq.COMPONENTES:
        grupos.setdefault(raiz(c), []).append(c)
    saida = sorted(grupos.values(), key=lambda g: (-len(g), g))
    assert len(saida) == mq.quanta(forma, assincronas, banco_compartilhado)
    return saida


def linha(forma_id: str, banco_compartilhado=True, assincronas=None) -> dict:
    nome, fabrica = FORMAS[forma_id]
    forma = fabrica()
    x = mq.avaliar(nome, forma, banco_compartilhado, assincronas or set())
    return {
        "id": forma_id,
        "nome": nome,
        "artefatos": x.artefatos,
        "remotas": x.remotas,
        "diretas": x.diretas,
        "p_falha": x.p_falha,
        "disponibilidade": x.disponibilidade,
        "minutos": x.minutos,
        "quanta_sincrono": x.quanta_sincrono,
        "quanta_com_fila": x.quanta_com_fila,
        "artefato_de": forma,
        "arestas_remotas": [f"{a}>{b}" for a, b in mq.arestas_remotas(forma)],
        "tocados": mq.artefatos_do_fechamento(forma),
    }


def dados_parte2() -> dict:
    filas = mq.notificacoes_assincronas()
    matriz = []
    for forma_id, (nome, fabrica) in FORMAS.items():
        forma = fabrica()
        matriz.append({
            "id": forma_id,
            "nome": nome,
            "valores": [
                mq.quanta(forma, set(), True),
                mq.quanta(forma, filas, True),
                mq.quanta(forma, set(), False),
                mq.quanta(forma, filas, False),
            ],
        })
    return {
        "componentes": mq.COMPONENTES,
        "arestas": [f"{a}>{b}" for a, b in mq.ARESTAS],
        "modulos": mq.MODULOS,
        "origem": mq.ORIGEM_DO_FLUXO,
        "destino_fila": mq.DESTINO_DA_FILA,
        "filas_notificacoes": sorted(f"{a}>{b}" for a, b in filas),
        "hipoteses": {"taxa_falha": mq.TAXA_DE_FALHA, "disponibilidade": mq.DISPONIBILIDADE,
                      "minutos_mes": mq.MINUTOS_NO_MES},
        "formas": [linha(f) for f in FORMAS],
        "matriz_quanta": matriz,
    }


def consultar_quanta(consulta: dict[str, list[str]]) -> dict:
    forma_id = consulta.get("forma", ["micro"])[0]
    if forma_id not in FORMAS:
        raise ValueError(f"forma desconhecida: {forma_id}")
    banco_compartilhado = consulta.get("banco", ["unico"])[0] != "servico"
    texto = consulta.get("assincronas", [""])[0]
    assincronas = mq.ler_assincronas(texto)
    forma = FORMAS[forma_id][1]()
    grupos = grupos_de_quanta(forma, assincronas, banco_compartilhado)
    return {"forma": forma_id, "banco_compartilhado": banco_compartilhado,
            "assincronas": sorted(f"{a}>{b}" for a, b in assincronas),
            "quanta": len(grupos), "grupos": grupos}


# ---------------------------------------------------------------- HTTP

def montar_dados() -> bytes:
    dados = {
        "projeto": {
            "titulo": "Extrair ou não extrair — Orion",
            "alunos": ["Gabriel Alves", "Gabriel Lopes Pereira"],
        },
        "parte1": dados_parte1(),
        "parte2": dados_parte2(),
    }
    return json.dumps(dados, ensure_ascii=False, separators=(",", ":")).encode()


class Manipulador(SimpleHTTPRequestHandler):
    dados: bytes = b""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ESTATICOS), **kwargs)

    def _json(self, corpo: bytes, status=HTTPStatus.OK):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/dados":
            return self._json(self.dados)
        if url.path == "/api/quanta":
            try:
                corpo = consultar_quanta(parse_qs(url.query))
            except Exception as erro:  # entrada inválida vira 400, não 500
                return self._json(json.dumps({"erro": str(erro)}).encode(), HTTPStatus.BAD_REQUEST)
            return self._json(json.dumps(corpo, ensure_ascii=False).encode())
        if url.path == "/saude":
            return self._json(b'{"ok":true}')
        return super().do_GET()

    def log_message(self, formato, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), formato % args))


def main() -> None:
    print("Rodando as simulações do projeto…", flush=True)
    Manipulador.dados = montar_dados()
    porta = int(os.environ.get("PORT", "8000"))
    servidor = ThreadingHTTPServer(("0.0.0.0", porta), Manipulador)
    print(f"Apresentação em http://localhost:{porta}", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
