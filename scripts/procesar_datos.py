"""Limpieza y unificación.

Lee el CSV 2003-2025 del SINPAD, se queda con los registros de enero de 2016 a
mayo de 2024 (cierre de la temporada de lluvias del Niño Costero 2023), limpia
los registros, normaliza los peligros, marca
las temporadas de lluvias y los meses de El Niño costero, cruza el UBIGEO con los
límites distritales del IGN y guarda en datos/procesados/:

- emergencias_viales.csv      registros de lluvias, huaicos/deslizamientos e
                              inundaciones que tienen algún daño vial
- catalogo_peligros.csv       nombre original -> nombre normalizado -> grupo
- revision_extremos.csv       valores extremos revisados a mano y su decisión
- ubigeos_sin_cruce.csv       distritos del SINPAD que no están en el mapa del IGN
- eventos_nino_costero.csv    lista oficial de El Niño costero (ENFEN, 2024)
- temporadas.csv              cada temporada dic-may con sus meses de Niño costero
- icen_mensual.csv            ICEN mensual del periodo de análisis
- distritos.geojson           límites distritales simplificados para la web
- resumen_procesamiento.json  conteos de cada paso, para el README

Uso:  python scripts/procesar_datos.py
"""

import json
import sys
import unicodedata
from io import StringIO
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
ORIGINALES = RAIZ / "datos" / "originales"
PROCESADOS = RAIZ / "datos" / "procesados"

# Cobertura temporal del análisis: de enero de 2016 a mayo de 2024, el cierre de la
# temporada de lluvias 2023-24, la última con Niño costero cuyos efectos ya están
# registrados (el evento de 2026 sigue en curso).
DESDE = pd.Timestamp("2016-01-01")
HASTA = pd.Timestamp("2024-05-31")

# Columnas que se usan del CSV, con su nombre original (algunos con espacios dobles o finales).
COLUMNAS = {
    "CODIGO DE EMERGENCIA-SINPAD": "codigo_sinpad",
    "FECHA  DE LA EMER": "fecha_texto",
    "AÑO": "anio",
    "MES": "mes_nombre",
    "COD. DISTRITO": "ubigeo",
    "DPTO.": "departamento",
    "PROV.": "provincia",
    "DIST.": "distrito",
    "PELIGRO": "peligro_original",
    "TIPO DE PELIGRO": "tipo_peligro",
    "REGIÓN NATURAL": "region_natural",
    "FALLECIDOS": "fallecidos",
    "DAMNIFICADOS": "damnificados",
    "AFECTADOS": "afectados",
    "PUENTE DESTRUIDO": "puentes_destruidos",
    "PUENTE AFECTADO": "puentes_afectados",
    "CARRETERA DESTRUIDA KM ": "carretera_destruida_km",
    "CARRETERA AFECTADA KM": "carretera_afectada_km",
    "CAMINO RURAL DESTRUIDO KM": "camino_rural_destruido_km",
    "CAMINO RURAL AFECTADO KM": "camino_rural_afectado_km",
}
VIALES = ["puentes_destruidos", "puentes_afectados",
          "carretera_destruida_km", "carretera_afectada_km",
          "camino_rural_destruido_km", "camino_rural_afectado_km"]

MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO",
         "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]

# Nombres que solo difieren en la forma (plural, tilde, ortografía).
# Las tildes y los espacios dobles se quitan antes, en normalizar().
SINONIMOS = {
    "LLUVIAS INTENSAS": "LLUVIA INTENSA",
    "HUAICO": "HUAYCO",
    "DERRUMBE CERROS": "DERRUMBE DE CERRO",
    "INCENDIOS FORESTALES": "INCENDIO FORESTAL",
    "TORMENTAS ELECTRICAS": "TORMENTA ELECTRICA",
    "PLAGA": "PLAGAS",
}

# Peligros climáticos asociados a las lluvias del Niño costero. Quedan fuera los
# que no dependen de la lluvia (sismos, heladas, incendios, aludes glaciares,
# oleaje) y la erosión, que mezcla causas y pesa poco en el daño vial.
GRUPOS = {
    "LLUVIA INTENSA": "Lluvias",
    "HUAYCO": "Huaicos y deslizamientos",
    "ALUVIONES": "Huaicos y deslizamientos",
    "DESLIZAMIENTO": "Huaicos y deslizamientos",
    "DERRUMBE DE CERRO": "Huaicos y deslizamientos",
    "DERRUMBE DE ROCAS": "Huaicos y deslizamientos",
    "REPTACION": "Huaicos y deslizamientos",
    "INUNDACION": "Inundaciones",
    "INUNDACION POR DESBORDE DE RIO": "Inundaciones",
    "INUNDACION POR DESBORDE DE CANALES": "Inundaciones",
    "INUNDACION POR DESBORDE LAGO O LAGUNA": "Inundaciones",
    "INUNDACION POR SATURACION DEL SUELO PARA DRENAJE (PLUVIAL)": "Inundaciones",
    "INUNDACION POR COLAPSO DE DEFENSA RIBERENA": "Inundaciones",
}

# Las dos temporadas de lluvias del foco del análisis.
TEMPORADAS_FOCO = {"2016-17": "Niño Costero 2017", "2022-23": "Niño Costero 2023"}

# Revisión manual de valores extremos (ver revision_extremos.csv). Solo se
# anulan valores inverosímiles; el resto del registro se conserva.
EXCLUIR = {
    (199967, "puentes_destruidos"): "Candarave (Tacna), 17/04/2024: 100 puentes destruidos y 1000 afectados "
                                    "en un solo evento; en el resto del periodo el máximo de cada variable es 40",
    (199967, "puentes_afectados"): "Mismo registro: 1000 puentes afectados, 25 veces el siguiente valor más alto",
}

# Mazamari y Pangoa (Satipo) aparecen unidos en el mapa del IGN.
UBIGEO_MAPA = {"120604": "120699", "120606": "120699"}


def normalizar(texto):
    """Mayúsculas, sin tildes y con un solo espacio entre palabras."""
    sin_tildes = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return " ".join(sin_tildes.upper().split())


def leer_sinpad():
    df = pd.read_csv(ORIGINALES / "BD_2003-2025_EMERGENCIAS.csv", sep=";", encoding="latin-1",
                     dtype=str, usecols=list(COLUMNAS))
    return df.rename(columns=COLUMNAS)


def convertir_fechas(df):
    """dd/mm/aaaa (2003-2024) y mm/dd/aa (2025): se distinguen por su largo."""
    texto = df["fecha_texto"].str.strip()
    largo_10 = pd.to_datetime(texto.where(texto.str.len() == 10), format="%d/%m/%Y", errors="coerce")
    largo_8 = pd.to_datetime(texto.where(texto.str.len() == 8), format="%m/%d/%y", errors="coerce")
    df["fecha"] = largo_10.fillna(largo_8)

    # Control: la fecha convertida debe coincidir con las columnas AÑO y MES.
    mes_columna = df["mes_nombre"].str.strip().map({m: i + 1 for i, m in enumerate(MESES)})
    df["anio"] = df["anio"].astype(int)
    incoherentes = df["fecha"].isna() | (df["fecha"].dt.year != df["anio"]) | (df["fecha"].dt.month != mes_columna)
    if incoherentes.any():
        raise ValueError(f"{incoherentes.sum()} fechas no coinciden con AÑO/MES")
    df["mes"] = df["fecha"].dt.month
    return df.drop(columns=["fecha_texto", "mes_nombre"])


def temporada_de(fecha):
    """Temporada de lluvias dic-may: diciembre de 2016 a mayo de 2017 -> '2016-17'."""
    if fecha.month == 12:
        inicio = fecha.year
    elif fecha.month <= 5:
        inicio = fecha.year - 1
    else:
        return None
    return f"{inicio}-{(inicio + 1) % 100:02d}"


def leer_eventos_nino():
    """Tabla 'El Niño Costero' de la lista oficial del IGP (ENFEN, 2024)."""
    html = (ORIGINALES / "lista_eventos_ICEN.html").read_text(encoding="latin-1")
    tablas = [t for t in pd.read_html(StringIO(html)) if "Magnitud" in t.columns]
    eventos = tablas[0]                     # la primera es El Niño; la segunda, La Niña
    eventos.columns = ["anio_inicio", "mes_inicio", "anio_fin", "mes_fin", "duracion_meses", "magnitud"]
    eventos["en_curso"] = pd.to_numeric(eventos["anio_fin"], errors="coerce").isna()
    eventos["anio_fin"] = pd.to_numeric(eventos["anio_fin"], errors="coerce").astype("Int64")
    eventos["mes_fin"] = eventos["mes_fin"].astype("Int64")
    eventos["inicio"] = pd.to_datetime(dict(year=eventos.anio_inicio, month=eventos.mes_inicio, day=1))
    fin = pd.to_datetime(dict(year=eventos.anio_fin.fillna(2100), month=eventos.mes_fin.fillna(12), day=1))
    eventos["fin"] = fin.where(~eventos["en_curso"], pd.NaT)
    return eventos


def leer_icen():
    icen = pd.read_csv(ORIGINALES / "ICEN.txt", sep=r"\s+", comment="%", names=["anio", "mes", "icen"])
    fecha = pd.to_datetime(dict(year=icen.anio, month=icen.mes, day=1))
    return icen[(fecha >= DESDE) & (fecha <= HASTA)].reset_index(drop=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    PROCESADOS.mkdir(parents=True, exist_ok=True)
    resumen = {}

    # 1. Leer y recortar al periodo de análisis -----------------------------
    df = leer_sinpad()
    resumen["registros_leidos"] = len(df)
    df = convertir_fechas(df)
    df = df[(df["fecha"] >= DESDE) & (df["fecha"] <= HASTA)].reset_index(drop=True)
    resumen["periodo"] = {"desde": str(DESDE.date()), "hasta": str(HASTA.date()), "registros": len(df)}

    # 2. Duplicados ----------------------------------------------------------
    exactos = df.duplicated()
    df = df[~exactos]
    repetidos = df[df["codigo_sinpad"].duplicated(keep=False)]
    resumen["duplicados_exactos_eliminados"] = int(exactos.sum())
    resumen["codigos_repetidos_con_contenido_distinto"] = {
        "codigos": int(repetidos["codigo_sinpad"].nunique()),
        "decision": "Se conservan: cada par tiene otra fecha, otro distrito y otro peligro",
    }
    df["codigo_sinpad"] = df["codigo_sinpad"].astype(int)

    # 3. Tipos ---------------------------------------------------------------
    df["ubigeo"] = df["ubigeo"].str.strip().str.zfill(6)
    numericas = VIALES + ["fallecidos", "damnificados", "afectados"]
    for c in numericas:
        df[c] = pd.to_numeric(df[c], errors="raise")
    for c in ["departamento", "provincia", "distrito", "tipo_peligro", "region_natural"]:
        df[c] = df[c].map(normalizar)

    # 4. Peligros: normalizar nombres y agrupar ---------------------------------
    df["peligro"] = df["peligro_original"].map(normalizar).replace(SINONIMOS)
    df["grupo_peligro"] = df["peligro"].map(GRUPOS).fillna("Otros (excluido)")
    df["con_dano_vial"] = (df[VIALES].fillna(0) > 0).any(axis=1)
    catalogo = (df.groupby(["peligro_original", "peligro", "grupo_peligro"])
                  .agg(registros=("codigo_sinpad", "size"), con_dano_vial=("con_dano_vial", "sum"),
                       puentes_destruidos=("puentes_destruidos", "sum"),
                       carretera_destruida_km=("carretera_destruida_km", "sum"))
                  .reset_index().sort_values(["grupo_peligro", "registros"], ascending=[True, False]))
    catalogo.to_csv(PROCESADOS / "catalogo_peligros.csv", index=False, encoding="utf-8")
    resumen["peligros"] = {"nombres_originales": int(df["peligro_original"].nunique()),
                           "nombres_normalizados": int(df["peligro"].nunique())}

    # 5. Temporada y El Niño costero -----------------------------------------
    eventos = leer_eventos_nino()
    eventos.to_csv(PROCESADOS / "eventos_nino_costero.csv", index=False, encoding="utf-8")
    leer_icen().to_csv(PROCESADOS / "icen_mensual.csv", index=False, encoding="utf-8")

    df["temporada"] = df["fecha"].map(temporada_de)
    mes_ini = df["fecha"].dt.to_period("M").dt.to_timestamp()
    df["nino_costero_mes"] = False
    df["nino_magnitud"] = ""
    for ev in eventos.itertuples():
        dentro = (mes_ini >= ev.inicio) & (ev.en_curso | (mes_ini <= ev.fin))
        df.loc[dentro, "nino_costero_mes"] = True
        df.loc[dentro, "nino_magnitud"] = ev.magnitud
    # Una temporada es «con Niño» si al menos uno de sus meses dic-may cae en un evento oficial.
    meses_temporada = pd.period_range(df["fecha"].min(), df["fecha"].max(), freq="M").to_timestamp()
    tabla_temp = pd.DataFrame({"mes": meses_temporada})
    tabla_temp["temporada"] = tabla_temp["mes"].map(temporada_de)
    tabla_temp = tabla_temp.dropna()
    tabla_temp["nino"] = tabla_temp["mes"].map(
        lambda m: any((m >= ev.inicio) and (ev.en_curso or m <= ev.fin) for ev in eventos.itertuples()))
    tabla_temp["magnitud"] = tabla_temp["mes"].map(
        lambda m: next((ev.magnitud for ev in eventos.itertuples()
                        if m >= ev.inicio and (ev.en_curso or m <= ev.fin)), ""))
    temporadas = (tabla_temp.groupby("temporada")
                  .agg(inicio=("mes", "min"), fin=("mes", "max"), meses_en_datos=("mes", "size"),
                       meses_nino=("nino", "sum"),
                       magnitud_nino=("magnitud", lambda s: ", ".join(sorted(set(s) - {""}))))
                  .reset_index())
    temporadas["completa"] = temporadas["meses_en_datos"] == 6
    temporadas["foco"] = temporadas["temporada"].map(TEMPORADAS_FOCO).fillna("")
    for c in ["inicio", "fin"]:
        temporadas[c] = temporadas[c].dt.strftime("%Y-%m")
    temporadas.to_csv(PROCESADOS / "temporadas.csv", index=False, encoding="utf-8")
    temporadas_nino = sorted(tabla_temp.loc[tabla_temp["nino"], "temporada"].unique())
    df["temporada_con_nino"] = df["temporada"].isin(temporadas_nino)
    df["temporada_foco"] = df["temporada"].map(TEMPORADAS_FOCO).fillna("")
    resumen["temporadas_con_nino_costero"] = temporadas_nino
    resumen["temporadas_incompletas"] = temporadas.loc[~temporadas["completa"], "temporada"].tolist()

    # 6. Filtrar: peligros climáticos con daño vial ---------------------------
    viales = df[df["con_dano_vial"] & (df["grupo_peligro"] != "Otros (excluido)")].copy()
    resumen["registros_con_dano_vial"] = {
        "todos_los_peligros": int(df["con_dano_vial"].sum()),
        "peligros_climaticos": len(viales),
        "puentes_destruidos_en_peligros_excluidos": int(
            df.loc[df["grupo_peligro"] == "Otros (excluido)", "puentes_destruidos"].sum()),
    }

    # 7. Valores extremos ----------------------------------------------------
    filas = []
    for c in VIALES:
        positivos = viales.loc[viales[c] > 0, c]
        umbral = positivos.quantile(0.999)
        for r in viales[viales[c] > umbral].itertuples():
            motivo = EXCLUIR.get((r.codigo_sinpad, c))
            filas.append({"codigo_sinpad": r.codigo_sinpad, "fecha": r.fecha.date(), "ubigeo": r.ubigeo,
                          "departamento": r.departamento, "distrito": r.distrito, "peligro": r.peligro,
                          "variable": c, "valor": getattr(r, c), "umbral_p99_9": round(umbral, 2),
                          "decision": "excluir valor" if motivo else "conservar",
                          "motivo": motivo or "Alto pero verosímil para el tamaño del distrito y el evento"})
    revision = pd.DataFrame(filas).sort_values(["variable", "valor"], ascending=[True, False])
    revision.to_csv(PROCESADOS / "revision_extremos.csv", index=False, encoding="utf-8")
    viales["valores_excluidos"] = ""
    for (codigo, c), _ in EXCLUIR.items():
        fila = viales["codigo_sinpad"] == codigo
        viales.loc[fila, c] = np.nan
        viales.loc[fila, "valores_excluidos"] = (viales.loc[fila, "valores_excluidos"] + " " + c).str.strip()
    resumen["valores_extremos"] = {"revisados": len(revision),
                                   "excluidos": int((revision["decision"] == "excluir valor").sum())}

    # 8. Cruce con los límites distritales del IGN ----------------------------
    distritos = gpd.read_file(ORIGINALES / "per_admin_boundaries.gdb.zip", layer="per_admin3",
                              columns=["adm3_name", "adm3_pcode", "adm2_name", "adm1_name"])
    distritos["ubigeo"] = distritos["adm3_pcode"].str[2:]
    en_mapa = set(distritos["ubigeo"])
    df["ubigeo_mapa"] = df["ubigeo"].replace(UBIGEO_MAPA)
    df["ubigeo_mapa"] = df["ubigeo_mapa"].where(df["ubigeo_mapa"].isin(en_mapa), "")
    viales["ubigeo_mapa"] = df.loc[viales.index, "ubigeo_mapa"]
    sin_cruce = (df[df["ubigeo_mapa"] == ""]
                 .groupby(["ubigeo", "departamento", "provincia", "distrito"])
                 .agg(registros=("codigo_sinpad", "size"),
                      registros_viales_climaticos=("codigo_sinpad",
                                                   lambda s: int(s.index.isin(viales.index).sum())),
                      primer_registro=("fecha", "min"))
                 .reset_index())
    sin_cruce["motivo"] = "Distrito creado después del mapa del IGN (válido al 14/07/2020)"
    sin_cruce.to_csv(PROCESADOS / "ubigeos_sin_cruce.csv", index=False, encoding="utf-8")
    resumen["cruce_ubigeo"] = {
        "ubigeos_sinpad": int(df["ubigeo"].nunique()),
        "cruzan_directo": int(df["ubigeo"].drop_duplicates().isin(en_mapa).sum()),
        "cruzan_por_union_mazamari_pangoa": len(UBIGEO_MAPA),
        "sin_cruce": len(sin_cruce),
        "registros_viales_sin_cruce": int((viales["ubigeo_mapa"] == "").sum()),
        "distritos_mapa_ign": len(distritos),
    }

    mapa = distritos.rename(columns={"adm3_name": "distrito", "adm2_name": "provincia",
                                     "adm1_name": "departamento"})[["ubigeo", "distrito", "provincia",
                                                                    "departamento", "geometry"]]
    # Simplificado a ~500 m y 3 decimales (~100 m): 1,5 MB, liviano para el mapa web.
    mapa["geometry"] = mapa.geometry.simplify(0.005, preserve_topology=True)
    mapa.to_file(PROCESADOS / "distritos.geojson", driver="GeoJSON", COORDINATE_PRECISION=3)

    # 9. Guardar -------------------------------------------------------------
    viales["fecha"] = viales["fecha"].dt.date
    columnas = ["codigo_sinpad", "fecha", "anio", "mes", "temporada", "temporada_foco", "temporada_con_nino",
                "nino_costero_mes", "nino_magnitud", "ubigeo", "ubigeo_mapa", "departamento", "provincia",
                "distrito", "region_natural", "peligro", "grupo_peligro", *VIALES,
                "fallecidos", "damnificados", "afectados", "valores_excluidos"]
    viales = viales[columnas].sort_values(["fecha", "codigo_sinpad"])
    viales.to_csv(PROCESADOS / "emergencias_viales.csv", index=False, encoding="utf-8")
    resumen["salida"] = {"archivo": "datos/procesados/emergencias_viales.csv", "registros": len(viales),
                         "desde": str(viales["fecha"].min()), "hasta": str(viales["fecha"].max())}

    with open(PROCESADOS / "resumen_procesamiento.json", "w", encoding="utf-8") as f:
        json.dump(resumen, f, ensure_ascii=False, indent=2, default=str)
    print(json.dumps(resumen, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
