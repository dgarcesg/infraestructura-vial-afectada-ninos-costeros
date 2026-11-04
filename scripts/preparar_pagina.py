"""Prepara los datos de la página estática (docs/) a partir de las tablas de datos/tablas/.

    python scripts/preparar_pagina.py

Junta las tablas en un JSON y copia el GeoJSON. Los filtros y las sumas los hace la página en el navegador.
"""
import json
import shutil
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
DATA = RAIZ / "datos" / "tablas"
SALIDA = RAIZ / "docs" / "datos"
UB = {"ubigeo": str, "ubigeo_mapa": str}


def columnas(tabla):
    """Una lista por columna, con null en los vacíos: pesa mucho menos que una lista de filas."""
    return {c: [None if pd.isna(v) else v for v in tabla[c].tolist()] for c in tabla.columns}


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    # Solo temporadas completas: a la 2015-16 le falta diciembre de 2015 porque el periodo empieza
    # en enero de 2016. Esos meses siguen en la serie mensual.
    temporadas = pd.read_csv(DATA / "por_temporada.csv")
    temporadas = temporadas[temporadas.completa]
    completas = set(temporadas.temporada)
    peligros = pd.read_csv(DATA / "por_temporada_peligro.csv")
    deptos = pd.read_csv(DATA / "por_departamento.csv")
    distritos = pd.read_csv(DATA / "por_distrito.csv", dtype=UB)
    # Pestaña aparte: declaratoria de 2026, fuera del periodo y de las demás cifras del tablero.
    decreto = pd.read_csv(RAIZ / "datos" / "procesados" / "decreto_149_2026_pcm.csv", dtype=UB)
    decreto = decreto[["numero_anexo", "departamento_tablero", "provincia", "distrito", "ubigeo"]]
    datos = {
        "temporadas": columnas(temporadas),
        "peligros": columnas(peligros[peligros.temporada.isin(completas)]),
        "mensual": columnas(pd.read_csv(DATA / "serie_mensual.csv")),
        "deptos": columnas(deptos[deptos.temporada.isin(completas)]),
        "distritos": columnas(distritos[distritos.temporada.isin(completas)]),
        "reincidentes": columnas(pd.read_csv(DATA / "reincidentes.csv", dtype=UB)),
        "kpis": json.loads((DATA / "kpis.json").read_text(encoding="utf-8")),
        "decreto": columnas(decreto.rename(columns={"departamento_tablero": "departamento"})),
    }
    texto = json.dumps(datos, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    (SALIDA / "datos.json").write_text(texto, encoding="utf-8")
    shutil.copyfile(DATA / "distritos.geojson", SALIDA / "distritos.geojson")
    print(f"datos.json: {len(texto) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
