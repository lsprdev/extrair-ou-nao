"""Repetição, idempotência e reprodução do ensaio personalizado."""

from pathlib import Path
import subprocess
import sys

import pytest

import ensaio
import meu_ensaio as e


@pytest.mark.parametrize("semente", [1, 7, 42])
def test_chave_evita_repetir_efeito(semente):
    resultado = e.rodar(2000, semente, tentativas=3, com_chave=True)
    assert resultado.duplicadas == 0
    assert resultado.confirmados + resultado.indeterminados == 2000

def test_semente_reproduz_o_mesmo_resultado():
    assert e.rodar(200, 42, 3, False) == e.rodar(200, 42, 3, False)


def test_cenario_personalizado_nao_altera_o_ensaio_original():
    assert ensaio.CAMPANHA.latencia_mediana == .020
    assert ensaio.CAMPANHA.taxa_falha == .02
    assert e.rodar(2000, 42, 2, False).duracoes != ensaio.rodar(2000, 42, 2, False).duracoes

def test_cli_executa_as_cinco_politicas():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        [sys.executable, "meu_ensaio.py", "--fechamentos", "30"],
        cwd=raiz, text=True, capture_output=True, check=True,
    )
    linhas = resultado.stdout.splitlines()
    assert sum("repetir" in linha for linha in linhas) == 5
    assert any("repetir sem chave (3)" in linha for linha in linhas)

def test_rejeita_experimento_sem_fechamentos():
    with pytest.raises(ValueError):
        e.rodar(0, 42, 2, False)
