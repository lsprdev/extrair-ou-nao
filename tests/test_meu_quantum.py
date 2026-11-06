"""Contagens manuais, separação por filas e extensão da linha de comando."""

import argparse
from pathlib import Path
import subprocess
import sys

import pytest

import meu_quantum as q
import quantum as original

@pytest.mark.parametrize("forma,esperado", [
    (q.forma_monolito, (1, 0, 0, 1)),
    (q.forma_extracao, (2, 4, 0, 1)),
    (q.forma_service_based, (8, 15, 4, 4)),
    (q.forma_microsservicos, (10, 17, 5, 6)),
])
def test_contagem_manual_por_forma(forma, esperado):
    f = forma()
    linha = q.avaliar("contagem manual", f, assincronas=set())
    assert (linha.artefatos, linha.remotas, linha.diretas,
            q.artefatos_do_fechamento(f)) == esperado
    assert linha.quanta_sincrono == 1

def test_grafo_e_modulos_originais_preservados():
    assert q.ARESTAS == original.ARESTAS
    assert q.MODULOS == original.MODULOS
    assert (len(q.COMPONENTES), len(q.ARESTAS)) == (10, 17)


def test_extracao_corta_exatamente_as_quatro_entradas():
    assert set(q.arestas_remotas(q.forma_extracao())) == {
        ("Pedidos", "Notificacoes"), ("Pagamentos", "Notificacoes"),
        ("Logistica", "Notificacoes"), ("Integracoes", "Notificacoes"),
    }

@pytest.mark.parametrize("forma", [q.forma_monolito, q.forma_extracao,
                                     q.forma_service_based, q.forma_microsservicos])
@pytest.mark.parametrize("compartilhado", [True, False])
def test_quatro_situacoes_de_quanta(forma, compartilhado):
    linha = q.avaliar("filas", forma(), compartilhado, q.notificacoes_assincronas())
    assert linha.quanta_sincrono == 1
    esperado = 1 if compartilhado or forma is q.forma_monolito else 2
    assert linha.quanta_com_fila == esperado

def test_menor_corte_generico_tem_duas_arestas():
    f = q.forma_microsservicos()
    assert all(q.quanta(f, {aresta}, False) == 1 for aresta in q.ARESTAS)
    exemplo = {("Portal", "Clientes"), ("Checkout", "Clientes")}
    assert q.quanta(f, exemplo, False) == 2

def test_para_isolar_notificacoes_as_quatro_entradas_sao_necessarias():
    f = q.forma_extracao()
    quatro = q.notificacoes_assincronas()
    for aresta in quatro:
        assert q.quanta(f, quatro - {aresta}, False) == 1
    assert q.quanta(f, quatro, False) == 2

def test_banco_compartilhado_impede_separacao_mesmo_com_todas_as_filas():
    f = q.forma_microsservicos()
    assert q.quanta(f, set(q.ARESTAS), True) == 1
    assert q.quanta(f, set(q.ARESTAS), False) == 10


def test_parser_aceita_arestas_que_nao_chegam_em_notificacoes():
    assert q.ler_assincronas(" Portal>Clientes , Checkout>Clientes,Portal>Clientes ") == {
        ("Portal", "Clientes"), ("Checkout", "Clientes")}
    assert q.ler_assincronas("") == set()

@pytest.mark.parametrize("texto", ["Checkout", "Checkout>", ">Clientes", "A>B",
                                  "Clientes>Portal", "Portal>Clientes,", "Portal>>Clientes"])
def test_parser_rejeita_entrada_invalida(texto):
    with pytest.raises(argparse.ArgumentTypeError):
        q.ler_assincronas(texto)

def test_avaliar_rejeita_aresta_ignorada_e_forma_incompleta():
    with pytest.raises(ValueError):
        q.avaliar("erro", q.forma_monolito(), assincronas={("X", "Y")})
    with pytest.raises(ValueError):
        q.avaliar("erro", {"Checkout": "a"})

def test_chamadas_nao_sao_quantidade_de_artefatos_tocados():
    linha = q.avaliar("dominios", q.forma_service_based())
    assert linha.diretas == 4
    assert q.artefatos_do_fechamento(q.forma_service_based()) == 4
    assert linha.p_falha == pytest.approx(1 - .99**4)
    assert linha.disponibilidade == pytest.approx(.999**4)
    assert linha.minutos == pytest.approx((1 - .999**4) * 43200)

def test_filas_arbitrarias_nao_reescrevem_silenciosamente_modelo_de_disponibilidade():
    f = q.forma_microsservicos()
    sem = q.avaliar("sem", f, False)
    com = q.avaliar("com", f, False, {("Portal", "Clientes"), ("Checkout", "Clientes")})
    assert (com.remotas, com.diretas, com.p_falha, com.disponibilidade) == (
        sem.remotas, sem.diretas, sem.p_falha, sem.disponibilidade)
    assert (sem.quanta_com_fila, com.quanta_com_fila) == (1, 2)


RAIZ = Path(__file__).resolve().parents[1]

def test_cli_aplica_filas_escolhidas_e_opcoes_de_banco():
    for opcao, esperado in [("--banco-unico", "1"), ("--banco-por-servico", "2")]:
        resultado = subprocess.run(
            [sys.executable, "meu_quantum.py", opcao,
             "--assincronas", "Portal>Clientes,Checkout>Clientes"],
            cwd=RAIZ, capture_output=True, text=True, check=True,
        )
        micro = next(linha for linha in resultado.stdout.splitlines()
                     if linha.startswith("Microsservicos"))
        assert micro.split()[-1] == esperado

def test_cli_exibe_erro_util_para_dependencia_inexistente():
    resultado = subprocess.run([sys.executable, "meu_quantum.py", "--assincronas", "A>B"],
        cwd=RAIZ, capture_output=True, text=True)
    assert resultado.returncode == 2
    assert "dependencia inexistente" in resultado.stderr
