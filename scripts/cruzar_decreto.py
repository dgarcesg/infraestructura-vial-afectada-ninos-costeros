"""Da su UBIGEO a cada distrito del Decreto Supremo 149-2026-PCM, para la pestaña «Emergencia 2026» de la página.

    python scripts/cruzar_decreto.py

El Anexo del decreto trae departamento, provincia y distrito sin UBIGEO, así que el cruce es por nombre, contra el
mapa distrital del IGN. Falla si aparece un distrito que no coincide y no está explicado abajo.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl
import pandas as pd

DATOS = Path(__file__).resolve().parents[1] / "datos"
ANEXO = DATOS / "originales" / "DS_149-2026-PCM_distritos_emergencia.xlsx"
SALIDA = DATOS / "procesados" / "decreto_149_2026_pcm.csv"
MAPA = DATOS / "tablas" / "distritos.geojson"
POR_DISTRITO = DATOS / "tablas" / "por_distrito.csv"
SIN_CRUCE = DATOS / "procesados" / "ubigeos_sin_cruce.csv"

CALLAO = "PROVINCIA CONSTITUCIONAL DEL CALLAO"

# El mismo distrito escrito distinto en el Anexo y en el mapa: (provincia, distrito en el Anexo) -> UBIGEO del mapa.
VARIANTES = {
    ("VICTOR FAJARDO", "HUALLA"): "051010",         # «Huaya» en el mapa; el SINPAD lo llama Hualla con este UBIGEO
    ("CONTUMAZA", "SANTA CRUZ DE TOLEDO"): "060506",  # nombre cortado en el mapa: «Santa Cruz de Toled»
    ("YAULI", "CHACAPALCA"): "120802",              # «Chacapalpa» en el mapa, único nombre parecido en la provincia
    ("HUAROCHIRI", "SAN PEDRO DE LARAOS"): "150712",  # «Laraos» en el mapa, el de Huarochirí (el 151018 es de Yauyos)
    ("ATALAYA", "RAIMONDI"): "250201",              # «Raymondi» en el mapa
}
# Dos distritos del Anexo que el mapa dibuja en un solo polígono.
COMPARTIDOS = {("SATIPO", "MAZAMARI"): ("120604", "120699"), ("SATIPO", "PANGOA"): ("120606", "120699")}
# En el Anexo, pero sin polígono ni registros en el mapa de 2020.
SIN_POLIGONO_NI_REGISTROS = {("TRUJILLO", "ALTO TRUJILLO")}


def norma(texto):
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", t)).strip()


def departamento_tablero(departamento, provincia):
    """El tablero separa Lima Metropolitana de Lima Provincias y llama Callao a la provincia constitucional."""
    if departamento == CALLAO:
        return "CALLAO"
    if departamento == "LIMA":
        return "LIMA METROPOLITANA" if provincia == "LIMA" else "LIMA PROVINCIAS"
    return departamento


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    hoja = openpyxl.load_workbook(ANEXO, data_only=True)["Distritos"]
    anexo = pd.DataFrame(list(hoja.iter_rows(min_row=2, values_only=True)),
                         columns=["numero_anexo", "departamento", "provincia", "distrito"]).dropna(subset=["distrito"])
    if anexo.duplicated(["departamento", "provincia", "distrito"]).any():
        raise SystemExit("Hay distritos repetidos en el Anexo.")

    geo = json.loads(MAPA.read_text(encoding="utf-8"))
    indice, ubigeos_mapa = {}, set()
    for f in geo["features"]:
        p = f["properties"]
        indice[(norma(p["departamento"]), norma(p["provincia"]), norma(p["distrito"]))] = p["ubigeo"]
        ubigeos_mapa.add(p["ubigeo"])
    sin_cruce = pd.read_csv(SIN_CRUCE, dtype=str)
    sin_poligono = {(norma(r.provincia), norma(r.distrito)): r.ubigeo for r in sin_cruce.itertuples()}

    filas, sin_explicar = [], []
    for r in anexo.itertuples():
        dep = "CALLAO" if r.departamento == CALLAO else norma(r.departamento)
        prov, dist = norma(r.provincia), norma(r.distrito)
        clave = (prov, dist)
        if (dep, prov, dist) in indice:
            ubigeo = mapa = indice[(dep, prov, dist)]
            cruce = "exacto"
        elif clave in VARIANTES:
            ubigeo = mapa = VARIANTES[clave]
            cruce = "variante de nombre"
        elif clave in COMPARTIDOS:
            ubigeo, mapa = COMPARTIDOS[clave]
            cruce = "polígono compartido"
        elif clave in sin_poligono:
            ubigeo, mapa = sin_poligono[clave], None
            cruce = "sin polígono"
        elif clave in SIN_POLIGONO_NI_REGISTROS:
            ubigeo, mapa = None, None
            cruce = "sin polígono"
        else:
            sin_explicar.append((r.departamento, r.provincia, r.distrito))
            continue
        if mapa is not None and mapa not in ubigeos_mapa:
            raise SystemExit(f"El UBIGEO {mapa} no existe en el mapa ({r.distrito}).")
        filas.append({"numero_anexo": r.numero_anexo, "departamento": r.departamento, "provincia": r.provincia,
                      "distrito": r.distrito, "departamento_tablero": departamento_tablero(r.departamento, r.provincia),
                      "ubigeo": ubigeo, "ubigeo_mapa": mapa, "cruce": cruce})
    if sin_explicar:
        raise SystemExit(f"Distritos sin cruce ni explicación: {sin_explicar}")

    salida = pd.DataFrame(filas)
    datos = pd.read_csv(POR_DISTRITO, dtype=str, usecols=["ubigeo", "departamento"]).drop_duplicates("ubigeo")
    datos = datos.set_index("ubigeo").departamento
    en_datos = salida[salida.ubigeo.isin(datos.index)]
    distintos = en_datos[en_datos.departamento_tablero != en_datos.ubigeo.map(datos)]
    if len(distintos):
        raise SystemExit(f"Departamento distinto del de los datos: {distintos.distrito.tolist()}")

    salida.to_csv(SALIDA, index=False, encoding="utf-8")
    print(f"{len(salida)} distritos del Anexo; {salida.ubigeo_mapa.nunique()} polígonos del mapa, de {len(ubigeos_mapa)}.")
    print(salida.cruce.value_counts().to_string())


if __name__ == "__main__":
    main()
