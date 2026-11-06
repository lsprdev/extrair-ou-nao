"""Ensaio de cobrança adaptado de ensaio.py, de Eduardo da Silva."""

import sys
from pathlib import Path

# Carrega o Mini-Orion fornecido pelo professor.
sys.path.insert(0, str(Path(__file__).resolve().parent / "base"))

import argparse
from dataclasses import dataclass
from mini_orion.montagem import CenarioRemoto, montar_remoto
from mini_orion.nucleo.modelos import Carrinho, ChaveIdempotencia, Cliente, ItemCarrinho
from mini_orion.rede.api import ParametrosRede, TIMEOUT_POR_CHAMADA
# Hipoteses didaticas, justificadas no relatorio; nao sao medicoes do Orion.
MEU_CENARIO = ParametrosRede(0.040, 0.700, 0.01)
POLITICAS = [
    ("nao repetir (1 tentativa)", 1, False),
    ("repetir sem chave (2)", 2, False),
    ("repetir sem chave (3)", 3, False),
    ("repetir com chave (2)", 2, True),
    ("repetir com chave (3)", 3, True),
]

CLIENTE = Cliente(nome="Maria", email="maria@exemplo.com", cartao="4111111111")

@dataclass
class Resultado:
    duracoes: list[float]
    confirmados: int
    indeterminados: int
    duplicadas: int
    cobrados_sem_pedido: int

    def percentil(self, p: float) -> float:
        """Percentil por posicao: o menor valor que cobre p% das rodadas."""
        ordenadas = sorted(self.duracoes)
        return ordenadas[int(p * len(ordenadas)) - 1]
    @property
    def na_cauda(self) -> int:
        """Fechamentos que esperaram pelo menos um timeout inteiro."""
        return sum(1 for d in self.duracoes if d >= TIMEOUT_POR_CHAMADA)


def carrinho() -> Carrinho:
    return Carrinho(itens=[ItemCarrinho(sku="TEC-01", preco_unitario=150.0, quantidade=2)])

def rodar(n: int, semente: int, tentativas: int, com_chave: bool) -> Resultado:
    if n < 1 or tentativas < 1:
        raise ValueError("fechamentos e tentativas devem ser positivos")
    gerar_chave = ChaveIdempotencia.nova if com_chave else (lambda: None)
    cenario: CenarioRemoto = montar_remoto(
        MEU_CENARIO, semente, tentativas=tentativas, gerar_chave=gerar_chave
    )
    duracoes: list[float] = []
    confirmados = indeterminados = duplicadas = cobrados_sem_pedido = 0
    for _ in range(n):
        antes = len(cenario.pagamentos.cobrancas_aprovadas)
        inicio = cenario.relogio.agora()
        desfecho = cenario.checkout.fechar_pedido(carrinho(), CLIENTE)
        duracoes.append(cenario.relogio.agora() - inicio)
        cobrancas = len(cenario.pagamentos.cobrancas_aprovadas) - antes
        confirmados += desfecho == "confirmado"
        indeterminados += desfecho == "cobranca_indeterminada"
        duplicadas += cobrancas > 1
        cobrados_sem_pedido += cobrancas >= 1 and desfecho != "confirmado"
    return Resultado(duracoes, confirmados, indeterminados, duplicadas, cobrados_sem_pedido)

def pct(parte: int, total: int) -> str:
    return f"{100 * parte / total:.2f}%".replace(".", ",")

def imprimir_politicas(n: int, semente: int) -> None:
    politicas = POLITICAS
    print(f"\n== {len(politicas)} politicas de repeticao, {n} fechamentos, semente {semente} ==")
    print(f"  {'politica':28} {'sem resposta':>13} {'duplicadas':>11} {'cobrado s/ pedido':>18} {'pior':>7}")
    for nome, tentativas, com_chave in politicas:
        r = rodar(n, semente, tentativas, com_chave)
        print(
            f"  {nome:28} {r.indeterminados:13d} {r.duplicadas:11d} "
            f"{r.cobrados_sem_pedido:18d} {max(r.duracoes):6.2f}s"
        )

def imprimir_varredura(n: int) -> None:
    print(f"\n== Mesma politica (repetir sem chave), {n} fechamentos, 10 sementes ==")
    print(f"  {'semente':>8} {'p95 (ms)':>9} {'timeout inteiro':>16} {'duplicadas':>11}")
    for semente in range(1, 11):
        r = rodar(n, semente, tentativas=2, com_chave=False)
        print(
            f"  {semente:8d} {r.percentil(0.95) * 1000:9.0f} "
            f"{pct(r.na_cauda, n):>16} {pct(r.duplicadas, n):>11}"
        )

def main() -> None:
    parser = argparse.ArgumentParser(description="Custo da rede na cobrança do Orion")
    parser.add_argument("--fechamentos", type=int, default=2000)
    parser.add_argument("--semente", type=int, default=42)
    parser.add_argument("--varrer", action="store_true", help="repete em dez sementes")
    args = parser.parse_args()
    if args.fechamentos < 1:
        parser.error("--fechamentos deve ser positivo")
    print("Hipóteses: mediana 40 ms; p99 700 ms; falha 1%; timeout 1 s.")
    imprimir_politicas(args.fechamentos, args.semente)
    if args.varrer:
        imprimir_varredura(args.fechamentos)


if __name__ == "__main__":
    main()
