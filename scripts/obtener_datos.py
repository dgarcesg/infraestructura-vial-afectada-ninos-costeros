"""Obtención de datos.

Descarga en datos/originales/ los archivos de los que parte el proyecto y deja
constancia de su procedencia en datos/fuentes.csv (URL, fecha de descarga,
licencia, tamaño y SHA-256).

- SINPAD (INDECI): emergencias y daños 2003-2025, diccionario y metadatos. El
  análisis usa enero de 2016 a mayo de 2024; el archivo 2026-S1 del portal no se usa.
- IGP / ENFEN: Índice Costero El Niño (ICEN) y lista oficial de eventos El Niño costero.
- IGN vía HDX (COD-AB Perú): límites distritales con código UBIGEO.

Si un archivo ya existe no se vuelve a descargar (los de SINPAD se reemplazan
cada semestre en el portal): se recalcula su hash y se conserva su fecha de
descarga original. Con --forzar se descarga todo de nuevo.

Uso:  python scripts/obtener_datos.py [--forzar]
"""

import argparse
import csv
import hashlib
import sys
from datetime import date
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parents[1]
ORIGINALES = RAIZ / "datos" / "originales"
FUENTES = RAIZ / "datos" / "fuentes.csv"

PORTAL_SINPAD = "https://www.datosabiertos.gob.pe/dataset/emergencias-y-da%C3%B1os-nivel-nacional-por-departamento"
PORTAL_HDX = "https://data.humdata.org/dataset/cod-ab-per"

ARCHIVOS = [
    {
        "archivo": "BD_2003-2025_EMERGENCIAS.csv",
        "url": "https://www.datosabiertos.gob.pe/sites/default/files/BD_2003-2025_EMERGENCIAS.csv",
        "fuente": "INDECI - SINPAD, Plataforma Nacional de Datos Abiertos",
        "pagina": PORTAL_SINPAD,
        "licencia": "Open Data Commons Attribution License (ODC-By)",
        "contenido": "Microdatos de emergencias y daños por distrito, 2003-2025",
    },
    {
        "archivo": "Diccionario_de_datos_SINPAD.xlsx",
        "url": "https://www.datosabiertos.gob.pe/sites/default/files/Diccionario%20de%20datos_9.xlsx",
        "fuente": "INDECI - SINPAD, Plataforma Nacional de Datos Abiertos",
        "pagina": PORTAL_SINPAD,
        "licencia": "Open Data Commons Attribution License (ODC-By)",
        "contenido": "Diccionario de variables del dataset de emergencias",
    },
    {
        "archivo": "Metadatos_SINPAD.docx",
        "url": "https://www.datosabiertos.gob.pe/sites/default/files/Metadatos_99.docx",
        "fuente": "INDECI - SINPAD, Plataforma Nacional de Datos Abiertos",
        "pagina": PORTAL_SINPAD,
        "licencia": "Open Data Commons Attribution License (ODC-By)",
        "contenido": "Ficha de metadatos del dataset de emergencias",
    },
    {
        "archivo": "ICEN.txt",
        "url": "http://met.igp.gob.pe/datos/ICEN.txt",
        "fuente": "IGP - Índice Costero El Niño (ENFEN, 2024)",
        "pagina": "http://met.igp.gob.pe/variabclim/indices.html",
        "licencia": "Dato público del Estado peruano (sin licencia explícita; se cita la fuente)",
        "contenido": "ICEN mensual desde 1950, versión oficial",
    },
    {
        "archivo": "lista_eventos_ICEN.html",
        "url": "http://met.igp.gob.pe/datos/lista_eventos_ICEN.html",
        "fuente": "IGP - Eventos El Niño y La Niña costeros según el ICEN (ENFEN, 2024)",
        "pagina": "http://met.igp.gob.pe/variabclim/indices.html",
        "licencia": "Dato público del Estado peruano (sin licencia explícita; se cita la fuente)",
        "contenido": "Inicio, fin y magnitud oficiales de cada El Niño costero",
    },
    {
        "archivo": "per_admin_boundaries.gdb.zip",
        "url": "https://data.humdata.org/dataset/54fc7f4d-f4c0-4892-91f6-2fe7c1ecf363/resource/b45a5d27-dbcb-4c7a-a550-5564a9558ab2/download/per_admin_boundaries.gdb.zip",
        "fuente": "Instituto Geográfico Nacional (IGN), vía OCHA HDX (COD-AB Perú)",
        "pagina": PORTAL_HDX,
        "licencia": "Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)",
        "contenido": "Límites administrativos; capa per_admin3 = 1873 distritos con adm3_pcode = 'PE' + UBIGEO",
    },
]

COLUMNAS = ["archivo", "contenido", "fuente", "pagina", "url", "licencia",
            "fecha_descarga", "ultima_modificacion_servidor", "bytes", "sha256"]


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def descargar(url, destino):
    """Descarga url en destino y devuelve la cabecera Last-Modified del servidor."""
    with requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, stream=True, timeout=120) as r:
        r.raise_for_status()
        temporal = destino.with_suffix(destino.suffix + ".part")
        with open(temporal, "wb") as f:
            for bloque in r.iter_content(1 << 20):
                f.write(bloque)
        temporal.replace(destino)
        return r.headers.get("Last-Modified", "")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--forzar", action="store_true", help="vuelve a descargar aunque el archivo exista")
    args = parser.parse_args()

    ORIGINALES.mkdir(parents=True, exist_ok=True)
    previos = {}
    if FUENTES.exists():
        with open(FUENTES, encoding="utf-8") as f:
            previos = {fila["archivo"]: fila for fila in csv.DictReader(f)}

    filas = []
    for a in ARCHIVOS:
        destino = ORIGINALES / a["archivo"]
        previo = previos.get(a["archivo"], {})
        if destino.exists() and not args.forzar:
            fecha = previo.get("fecha_descarga", "")
            modificado = previo.get("ultima_modificacion_servidor", "")
            print(f"ya existe   {a['archivo']}")
        else:
            modificado = descargar(a["url"], destino)
            fecha = date.today().isoformat()
            print(f"descargado  {a['archivo']}")

        hash_actual = sha256(destino)
        if previo.get("sha256") and previo["sha256"] != hash_actual:
            print(f"  ¡atención! el SHA-256 de {a['archivo']} cambió respecto al registrado")
        filas.append({**a, "fecha_descarga": fecha, "ultima_modificacion_servidor": modificado,
                      "bytes": destino.stat().st_size, "sha256": hash_actual})

    # Los que no se descargan, como el Anexo del decreto transcrito a Excel, conservan su registro.
    descargables = {a["archivo"] for a in ARCHIVOS}
    filas += [fila for archivo, fila in previos.items() if archivo not in descargables]

    with open(FUENTES, "w", encoding="utf-8", newline="") as f:
        escritor = csv.DictWriter(f, fieldnames=COLUMNAS)
        escritor.writeheader()
        escritor.writerows({c: fila[c] for c in COLUMNAS} for fila in filas)
    print(f"\nRegistro de fuentes: {FUENTES.relative_to(RAIZ)}")
    for fila in filas:
        print(f"  {fila['archivo']:<34} {int(fila['bytes']):>11,} B  {fila['sha256'][:16]}…")


if __name__ == "__main__":
    main()
