"""Indicadores.

Lee datos/procesados/emergencias_viales.csv y escribe en datos/tablas/ las tablas
que usa el dashboard:

- por_temporada.csv           totales de cada temporada dic-may y su multiplicador
                              frente a la mediana de las temporadas normales
- por_temporada_peligro.csv   lo mismo, separado por grupo de peligro
- serie_mensual.csv           totales por mes, nacionales y por departamento, con el ICEN
- por_departamento.csv        totales por departamento y temporada, con su puesto
- por_distrito.csv            totales por distrito y temporada, con su puesto
- reincidentes.csv            distritos con infraestructura vial destruida en los dos Niños
- kpis.json                   cifras clave para las tarjetas y los hallazgos
- distritos.geojson           copia de los límites distritales para el mapa

Uso:  python scripts/analizar_datos.py
"""

import json
import shutil
import sys
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
PROCESADOS = RAIZ / "datos" / "procesados"
SALIDA = RAIZ / "datos" / "tablas"

VIALES = ["puentes_destruidos", "puentes_afectados",
          "carretera_destruida_km", "carretera_afectada_km",
          "camino_rural_destruido_km", "camino_rural_afectado_km"]
DESTRUIDOS = ["puentes_destruidos", "carretera_destruida_km", "camino_rural_destruido_km"]
INDICADORES = VIALES + ["km_via_destruidos", "km_via_afectados"]

FOCO = ["2016-17", "2022-23"]
COSTA_NORTE = ["TUMBES", "PIURA", "LAMBAYEQUE", "LA LIBERTAD"]


def leer():
    d = pd.read_csv(PROCESADOS / "emergencias_viales.csv", dtype={"ubigeo": str, "ubigeo_mapa": str},
                    parse_dates=["fecha"], keep_default_na=False, na_values=[""])
    for c in VIALES:
        d[c] = d[c].astype(float)
    d["ubigeo_mapa"] = d["ubigeo_mapa"].fillna("")
    # Kilómetros de vía = carretera (red nacional y departamental) + camino rural (red vecinal).
    d["km_via_destruidos"] = d[["carretera_destruida_km", "camino_rural_destruido_km"]].sum(axis=1)
    d["km_via_afectados"] = d[["carretera_afectada_km", "camino_rural_afectado_km"]].sum(axis=1)
    d["con_destruccion"] = (d[DESTRUIDOS].fillna(0) > 0).any(axis=1)
    return d


def totales(d, por):
    """Suma los indicadores y cuenta registros y distritos con daño y con destrucción."""
    g = d.groupby(por)
    t = g[INDICADORES].sum().round(2)
    t["registros"] = g.size()
    t["distritos_con_dano"] = g["ubigeo"].nunique()
    t["distritos_con_destruccion"] = d[d["con_destruccion"]].groupby(por)["ubigeo"].nunique()
    return t.fillna({"distritos_con_destruccion": 0}).astype({"distritos_con_destruccion": int})


def tipo_temporada(fila):
    if not fila["completa"]:
        return "Incompleta"
    if fila["foco"]:
        return fila["foco"]
    return "Otra con Niño costero" if fila["meses_nino"] > 0 else "Normal"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    SALIDA.mkdir(parents=True, exist_ok=True)
    d = leer()
    temporadas = pd.read_csv(PROCESADOS / "temporadas.csv", keep_default_na=False)
    temporadas["tipo"] = temporadas.apply(tipo_temporada, axis=1)
    en_temporada = d[d["temporada"].notna()]

    # 1. Por temporada y multiplicador Niño ------------------------------------
    pt = temporadas.merge(totales(en_temporada, "temporada").reset_index(), on="temporada", how="left")
    normales = pt[pt["tipo"] == "Normal"]
    base = normales[INDICADORES + ["distritos_con_dano", "distritos_con_destruccion"]].median()
    for c in ["puentes_destruidos", "puentes_afectados", "km_via_destruidos", "carretera_destruida_km",
              "distritos_con_dano", "distritos_con_destruccion"]:
        pt[f"multiplicador_{c}"] = (pt[c] / base[c]).round(2)
    pt.to_csv(SALIDA / "por_temporada.csv", index=False, encoding="utf-8")

    ptp = totales(en_temporada, ["temporada", "grupo_peligro"]).reset_index()
    ptp.to_csv(SALIDA / "por_temporada_peligro.csv", index=False, encoding="utf-8")

    # 2. Serie mensual, nacional y por departamento ------------------------------
    d["mes_inicio"] = d["fecha"].dt.to_period("M").dt.to_timestamp()
    meses = pd.period_range(d["fecha"].min(), d["fecha"].max(), freq="M").to_timestamp()
    departamentos = sorted(d["departamento"].unique())
    nacional = totales(d, "mes_inicio").reindex(meses, fill_value=0)
    nacional.insert(0, "departamento", "PERÚ")
    por_dep = (totales(d, ["departamento", "mes_inicio"])
               .reindex(pd.MultiIndex.from_product([departamentos, meses], names=["departamento", "mes_inicio"]),
                        fill_value=0)
               .reset_index("departamento"))
    serie = pd.concat([nacional, por_dep]).rename_axis("mes_inicio").reset_index()
    icen = pd.read_csv(PROCESADOS / "icen_mensual.csv")
    icen["mes_inicio"] = pd.to_datetime(dict(year=icen.anio, month=icen.mes, day=1))
    eventos = pd.read_csv(PROCESADOS / "eventos_nino_costero.csv", parse_dates=["inicio", "fin"])
    serie = serie.merge(icen[["mes_inicio", "icen"]], on="mes_inicio", how="left")
    serie["nino_costero"] = serie["mes_inicio"].map(
        lambda m: any(m >= e.inicio and (e.en_curso or m <= e.fin) for e in eventos.itertuples()))
    serie["mes"] = serie["mes_inicio"].dt.strftime("%Y-%m")
    serie = serie[["mes", "departamento", "icen", "nino_costero", *INDICADORES, "registros",
                   "distritos_con_dano", "distritos_con_destruccion"]]
    serie.to_csv(SALIDA / "serie_mensual.csv", index=False, encoding="utf-8")

    # 3. Rankings por departamento y por distrito ----------------------------------
    pdep = totales(en_temporada, ["departamento", "temporada"]).reset_index()
    for c in ["puentes_destruidos", "km_via_destruidos"]:
        pdep[f"puesto_{c}"] = pdep.groupby("temporada")[c].rank(ascending=False, method="min").astype(int)
    pdep.to_csv(SALIDA / "por_departamento.csv", index=False, encoding="utf-8")

    region = d.groupby("ubigeo")["region_natural"].agg(lambda s: s.mode().iat[0])
    ids = ["ubigeo", "ubigeo_mapa", "departamento", "provincia", "distrito"]
    pdis = totales(en_temporada, ids + ["temporada"]).reset_index()
    pdis.insert(5, "region_natural", pdis["ubigeo"].map(region))
    for c in ["puentes_destruidos", "km_via_destruidos"]:
        pdis[f"puesto_{c}"] = pdis.groupby("temporada")[c].rank(ascending=False, method="min").astype(int)
    pdis.to_csv(SALIDA / "por_distrito.csv", index=False, encoding="utf-8")

    # 4. Reincidencia: destrucción vial en los dos Niños --------------------------
    completas = temporadas.loc[temporadas["completa"], "temporada"]
    destruccion = en_temporada[en_temporada["con_destruccion"]]
    n_temporadas = (destruccion[destruccion["temporada"].isin(completas)]
                    .groupby("ubigeo")["temporada"].nunique())
    foco = (destruccion[destruccion["temporada"].isin(FOCO)]
            .pivot_table(index=ids, columns="temporada", values=["puentes_destruidos", "km_via_destruidos"],
                         aggfunc="sum"))
    foco.columns = [f"{v}_{t}" for v, t in foco.columns]
    foco = foco.reset_index()
    reinc = foco.dropna(subset=[f"km_via_destruidos_{t}" for t in FOCO]).copy()
    reinc.insert(5, "region_natural", reinc["ubigeo"].map(region))
    reinc["puentes_destruidos_ambos"] = reinc[[f"puentes_destruidos_{t}" for t in FOCO]].sum(axis=1)
    reinc["km_via_destruidos_ambos"] = reinc[[f"km_via_destruidos_{t}" for t in FOCO]].sum(axis=1).round(2)
    reinc["temporadas_con_destruccion"] = reinc["ubigeo"].map(n_temporadas).astype(int)
    reinc["temporadas_completas"] = len(completas)
    reinc = reinc.sort_values(["puentes_destruidos_ambos", "km_via_destruidos_ambos"], ascending=False)
    reinc.to_csv(SALIDA / "reincidentes.csv", index=False, encoding="utf-8")

    # 5. KPIs -----------------------------------------------------------------
    def concentracion_top10(temporada, c):
        x = pdis.loc[pdis["temporada"] == temporada, c]
        return round(100 * x.nlargest(10).sum() / x.sum(), 1)

    def fila(t):
        return pt.set_index("temporada").loc[t]

    kpis = {
        "cobertura": {"desde": str(d["fecha"].min().date()), "hasta": str(d["fecha"].max().date()),
                      "registros_con_dano_vial": len(d),
                      "distritos_con_dano_vial": int(d["ubigeo"].nunique())},
        "pct_puentes_destruidos_en_dic_may": round(100 * en_temporada["puentes_destruidos"].sum()
                                                   / d["puentes_destruidos"].sum(), 1),
        "temporadas_normales": normales["temporada"].tolist(),
        "mediana_normal": base.round(2).to_dict(),
        "temporadas_foco": {},
        "reincidentes": {
            "distritos": len(reinc),
            "puentes_destruidos_en_ambos": float(reinc["puentes_destruidos_ambos"].sum()),
            "pct_de_los_puentes_destruidos_en_ambos_ninos": round(
                100 * reinc["puentes_destruidos_ambos"].sum()
                / pt.loc[pt["temporada"].isin(FOCO), "puentes_destruidos"].sum(), 1),
            "por_departamento": reinc["departamento"].value_counts().head(5).to_dict(),
        },
    }
    for t in FOCO:
        f = fila(t)
        dep = pdep[pdep["temporada"] == t]
        costa_norte = dep[dep["departamento"].isin(COSTA_NORTE)]
        kpis["temporadas_foco"][t] = {
            "nombre": f["foco"],
            **{c: float(f[c]) for c in INDICADORES},
            "distritos_con_dano": int(f["distritos_con_dano"]),
            "distritos_con_destruccion": int(f["distritos_con_destruccion"]),
            "multiplicador_puentes_destruidos": float(f["multiplicador_puentes_destruidos"]),
            "multiplicador_km_via_destruidos": float(f["multiplicador_km_via_destruidos"]),
            "multiplicador_distritos_con_destruccion": float(f["multiplicador_distritos_con_destruccion"]),
            "top_departamento_puentes": dep.nlargest(1, "puentes_destruidos")[["departamento",
                                                                               "puentes_destruidos"]]
                                           .iloc[0].to_dict(),
            "top_departamento_km_via": dep.nlargest(1, "km_via_destruidos")[["departamento",
                                                                             "km_via_destruidos"]]
                                          .iloc[0].to_dict(),
            "pct_costa_norte_puentes_destruidos": round(100 * costa_norte["puentes_destruidos"].sum()
                                                        / dep["puentes_destruidos"].sum(), 1),
            "pct_costa_norte_km_via_destruidos": round(100 * costa_norte["km_via_destruidos"].sum()
                                                       / dep["km_via_destruidos"].sum(), 1),
            "pct_top10_distritos_puentes_destruidos": concentracion_top10(t, "puentes_destruidos"),
            "pct_top10_distritos_km_via_destruidos": concentracion_top10(t, "km_via_destruidos"),
        }
    with open(SALIDA / "kpis.json", "w", encoding="utf-8") as f:
        json.dump(kpis, f, ensure_ascii=False, indent=2, default=lambda x: x.item())

    shutil.copy(PROCESADOS / "distritos.geojson", SALIDA / "distritos.geojson")

    # Resumen en pantalla -------------------------------------------------------
    cols = ["temporada", "tipo", "puentes_destruidos", "km_via_destruidos", "distritos_con_destruccion",
            "multiplicador_puentes_destruidos", "multiplicador_km_via_destruidos"]
    print(pt[cols].to_string(index=False))
    for t in FOCO:
        print(f"\nTop 5 departamentos {t}")
        print(pdep[pdep["temporada"] == t].nlargest(5, "puentes_destruidos")
              [["departamento", "puentes_destruidos", "km_via_destruidos", "distritos_con_destruccion"]]
              .to_string(index=False))
    print(f"\nReincidentes: {len(reinc)} distritos")
    print(reinc.head(10)[["distrito", "departamento", "puentes_destruidos_ambos", "km_via_destruidos_ambos",
                          "temporadas_con_destruccion"]].to_string(index=False))
    print("\n" + json.dumps(kpis, ensure_ascii=False, indent=2, default=lambda x: x.item()))


if __name__ == "__main__":
    main()
