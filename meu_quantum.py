"""Grafo do Orion e cálculos adaptados de quantum.py, de Eduardo da Silva."""

import argparse
from dataclasses import dataclass
# `A -> B`: A depende de B. As 17 arestas do grafo das Aulas 7 e 12.
ARESTAS: list[tuple[str, str]] = [
    ("Portal", "Catalogo"),
    ("Portal", "Checkout"),
    ("Portal", "Pedidos"),
    ("Portal", "Clientes"),
    ("Checkout", "Catalogo"),
    ("Checkout", "Clientes"),
    ("Checkout", "Promocoes"),
    ("Checkout", "Pagamentos"),
    ("Checkout", "Pedidos"),
    ("Promocoes", "Catalogo"),
    ("Pedidos", "Notificacoes"),
    ("Pedidos", "Logistica"),
    ("Pagamentos", "Notificacoes"),
    ("Logistica", "Notificacoes"),
    ("Integracoes", "Catalogo"),
    ("Integracoes", "Pedidos"),
    ("Integracoes", "Notificacoes"),
]
COMPONENTES = sorted({c for aresta in ARESTAS for c in aresta})
# Dois componentes que a conta trata de modo especial. Quem aplicar o script a
# outro grafo troca estes dois nomes, alem de ARESTAS e MODULOS.
ORIGEM_DO_FLUXO = "Checkout"  # o componente cujas chamadas formam o caminho do fluxo medido
DESTINO_DA_FILA = "Notificacoes"  # quem recebe as arestas que podem passar por fila
# Os oito modulos de dominio da Aula 12.
MODULOS: dict[str, list[str]] = {
    "Borda": ["Portal"],
    "Vitrine": ["Catalogo", "Promocoes"],
    "Compra": ["Checkout", "Pedidos"],
    "Financeiro": ["Pagamentos"],
    "Distribuicao": ["Logistica"],
    "Comunicacao": ["Notificacoes"],
    "Identidade": ["Clientes"],
    "Integracao": ["Integracoes"],
}
# Hipoteses de trabalho (Aulas 16 e 17): nao sao medicoes do Orion.
TAXA_DE_FALHA = 0.01  # hipotese do trabalho; mesma taxa sorteada de meu_ensaio.py
DISPONIBILIDADE = 0.999  # mensal, de cada artefato implantavel
MINUTOS_NO_MES = 30 * 24 * 60

Forma = dict[str, str]  # componente -> artefato implantavel em que vive


def forma_monolito() -> Forma:
    return {c: "orion" for c in COMPONENTES}

def forma_extracao() -> Forma:
    """Notificacoes em um artefato, os outros nove componentes em outro."""
    return {c: ("notificacoes" if c == "Notificacoes" else "orion") for c in COMPONENTES}


def forma_service_based() -> Forma:
    return {c: modulo for modulo, itens in MODULOS.items() for c in itens}

def forma_microsservicos() -> Forma:
    return {c: c for c in COMPONENTES}

def arestas_remotas(forma: Forma) -> list[tuple[str, str]]:
    """Arestas cujas pontas vivem em artefatos diferentes."""
    return [(a, b) for a, b in ARESTAS if forma[a] != forma[b]]


def chamadas_diretas_de(forma: Forma, origem: str = ORIGEM_DO_FLUXO) -> int:
    """Chamadas remotas que `origem` faz diretamente a outros componentes."""
    return sum(1 for a, b in arestas_remotas(forma) if a == origem)

def artefatos_do_fechamento(forma: Forma, origem: str = ORIGEM_DO_FLUXO) -> int:
    """Artefatos que um fechamento de compra toca: o do `Checkout` e os que ele chama."""
    tocados = {forma[origem]} | {forma[b] for a, b in ARESTAS if a == origem}
    return len(tocados)

def quanta(
    forma: Forma,
    assincronas: set[tuple[str, str]] | None = None,
    banco_compartilhado: bool = True,
) -> int:
    """Une componentes por artefato, chamada síncrona ou banco compartilhado."""
    assincronas = assincronas or set()
    pai = {c: c for c in COMPONENTES}

    def raiz(c: str) -> str:
        while pai[c] != c:
            pai[c] = pai[pai[c]]
            c = pai[c]
        return c
    ligacoes = [(a, b) for a in COMPONENTES for b in COMPONENTES if forma[a] == forma[b]]
    ligacoes += [aresta for aresta in ARESTAS if aresta not in assincronas]
    if banco_compartilhado:
        ligacoes += [(COMPONENTES[0], c) for c in COMPONENTES[1:]]
    for a, b in ligacoes:
        pai[raiz(a)] = raiz(b)
    return len({raiz(c) for c in COMPONENTES})

def notificacoes_assincronas() -> set[tuple[str, str]]:
    """As arestas que chegam em `DESTINO_DA_FILA`, trocadas por fila."""
    return {(a, b) for a, b in ARESTAS if b == DESTINO_DA_FILA}


def p_ao_menos_uma_falha(chamadas: int, taxa: float = TAXA_DE_FALHA) -> float:
    return 1 - (1 - taxa) ** chamadas


def disponibilidade_em_serie(artefatos: int, base: float = DISPONIBILIDADE) -> float:
    return base**artefatos

@dataclass
class Linha:
    nome: str
    artefatos: int
    remotas: int
    diretas: int
    p_falha: float
    disponibilidade: float
    minutos: float
    quanta_sincrono: int
    quanta_com_fila: int


def avaliar(
    nome: str, forma: Forma, banco_compartilhado: bool = True,
    assincronas: set[tuple[str, str]] | None = None,
) -> Linha:
    """Filas alteram os quanta; os custos mantêm o recorte direto do Checkout."""
    if set(forma) != set(COMPONENTES):
        raise ValueError("a forma deve mapear exatamente todos os componentes")
    if assincronas and not assincronas <= set(ARESTAS):
        raise ValueError("ha arestas assincronas fora do grafo")
    tocados = artefatos_do_fechamento(forma)
    diretas = chamadas_diretas_de(forma)
    disp = disponibilidade_em_serie(tocados)
    return Linha(
        nome=nome,
        artefatos=len(set(forma.values())),
        remotas=len(arestas_remotas(forma)),
        diretas=diretas,
        p_falha=p_ao_menos_uma_falha(diretas),
        disponibilidade=disp,
        minutos=(1 - disp) * MINUTOS_NO_MES,
        quanta_sincrono=quanta(forma, banco_compartilhado=banco_compartilhado),
        quanta_com_fila=quanta(forma, assincronas, banco_compartilhado),
    )

def ler_assincronas(texto: str) -> set[tuple[str, str]]:
    """Le A>B,C>D e rejeita erros em vez de ignorar dependencias inexistentes."""
    if not texto.strip():
        return set()
    saida = set()
    for item in texto.split(","):
        partes = [p.strip() for p in item.split(">")]
        if len(partes) != 2 or not all(partes):
            raise argparse.ArgumentTypeError(f"aresta malformada: {item!r}; use A>B")
        aresta = (partes[0], partes[1])
        if aresta not in ARESTAS:
            raise argparse.ArgumentTypeError(f"dependencia inexistente: {item!r}")
        saida.add(aresta)
    return saida

def main() -> None:
    parser = argparse.ArgumentParser(description="Formas de implantar o Orion")
    filas = parser.add_mutually_exclusive_group()
    filas.add_argument("--assincronas", type=ler_assincronas, default=set(), metavar="A>B,C>D")
    filas.add_argument("--notificacoes-assincronas", action="store_true",
                       help="seleciona as quatro entradas de Notificacoes")
    bancos = parser.add_mutually_exclusive_group()
    bancos.add_argument("--banco-unico", action="store_true", help="banco compartilhado (padrão)")
    bancos.add_argument("--banco-por-servico", action="store_true")
    args = parser.parse_args()
    assincronas = notificacoes_assincronas() if args.notificacoes_assincronas else args.assincronas
    formas = [
        ("Monolito", forma_monolito()),
        ("So Notificacoes", forma_extracao()),
        ("Por dominio", forma_service_based()),
        ("Microsservicos", forma_microsservicos()),
    ]
    print("Banco: " + ("por serviço" if args.banco_por_servico else "compartilhado"))
    print("Filas: " + (", ".join(f"{a}>{b}" for a, b in sorted(assincronas)) or "nenhuma"))
    print("Hipóteses: falha 1% por chamada; disponibilidade 99,9% por artefato; mês de 30 dias.")
    print(f"{'Forma':18} {'Art.':>4} {'Rem.':>4} {'Dir.':>4} {'Falha':>8} "
          f"{'Disponib.':>10} {'Min/mês':>8} {'Q sinc.':>7} {'Q filas':>7}")
    for nome, forma in formas:
        x = avaliar(nome, forma, not args.banco_por_servico, assincronas)
        print(f"{nome:18} {x.artefatos:4} {x.remotas:4} {x.diretas:4} {100*x.p_falha:7.2f}% "
              f"{100*x.disponibilidade:9.2f}% {x.minutos:8.2f} "
              f"{x.quanta_sincrono:7} {x.quanta_com_fila:7}")
    print("\nArt. = artefatos; Rem. = dependências remotas; Dir. = remotas diretas do Checkout.")
    print("Q = quanta. Filas alteram Q; custos representam o recorte direto síncrono do Checkout.")


if __name__ == "__main__":
    main()
