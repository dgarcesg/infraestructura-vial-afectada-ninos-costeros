# Infraestructura vial afectada por los Niños Costeros

**Tablero interactivo:** https://dgarcesg.github.io/infraestructura-vial-afectada-ninos-costeros/

Este repositorio contiene solo el dashboard: la página, sus datos y el código que los prepara. Parte de [diplomado_python_intermedio](https://github.com/dgarcesg/diplomado_python_intermedio), donde están la entrega original del curso y el reel.

## 1. Tema y pregunta de investigación

**Pregunta:** ¿Cuánta infraestructura vial destruyeron los Niños Costeros de 2017 y 2023, dónde se concentró el daño y qué distritos la perdieron en ambos eventos?

| | |
|---|---|
| **Cobertura geográfica** | Perú, a nivel distrital (1884 distritos con registros en el SINPAD) |
| **Cobertura temporal** | De enero de 2016 a mayo de 2024. El foco son las temporadas de lluvias **2016-17** y **2022-23** (de diciembre a mayo). El corte en mayo de 2024 cierra la temporada 2023-24, la última con Niño costero cuyos efectos ya están registrados |
| **Variables** | Puentes destruidos y afectados; km de carretera destruidos y afectados; km de camino rural destruidos y afectados |
| **Peligros incluidos** | Lluvias, huaicos y deslizamientos, e inundaciones, que son los peligros climáticos asociados al Niño costero |

## 2. Descripción del proyecto

El producto es un **dashboard interactivo** ([dgarcesg.github.io/infraestructura-vial-afectada-ninos-costeros](https://dgarcesg.github.io/infraestructura-vial-afectada-ninos-costeros/)), una página estática hecha con HTML, JavaScript y Plotly que corre en el navegador, sin servidor. Muestra 4 indicadores clave y un mapa distrital del daño y de la reincidencia. También compara cada temporada con la línea base, sigue el daño mes a mes junto al calentamiento del mar y tiene rankings por departamento y una lista de distritos reincidentes. Se filtra por temporada, indicador, departamento y distrito, y permite descargar los datos filtrados. Fuera del periodo de estudio, la pestaña **Emergencia 2026** lista los distritos declarados en emergencia por el Decreto Supremo Nº 149-2026-PCM y cuenta cuántos tuvieron destrucción vial en cada Niño.

## 3. Fuentes de datos y metodología

El registro completo de cada archivo (procedencia, fecha, licencia, tamaño y SHA-256) está en [`datos/fuentes.csv`](datos/fuentes.csv). Los archivos del SINPAD, el IGP y el IGN se descargaron el **01/11/2026**. El Anexo del decreto de la pestaña Emergencia 2026 se transcribió a Excel el **03/11/2026**, desde El Peruano (Normas Legales, 03/11/2026, págs. 15-25), y no entra en ninguna otra cifra.

| Fuente | Archivos | Licencia |
|---|---|---|
| INDECI, SINPAD: [Emergencias y daños a nivel nacional](https://www.datosabiertos.gob.pe/dataset/emergencias-y-da%C3%B1os-nivel-nacional-por-departamento) (Plataforma Nacional de Datos Abiertos) | `BD_2003-2025_EMERGENCIAS.csv`, diccionario y metadatos | ODC-By |
| IGP y ENFEN: [Índice Costero El Niño (ICEN)](http://met.igp.gob.pe/variabclim/indices.html) y la lista oficial de eventos El Niño costero (ENFEN, 2024) | `ICEN.txt`, `lista_eventos_ICEN.html` | Dato público; se cita la fuente |
| IGN, vía OCHA HDX: [límites administrativos del Perú (COD-AB)](https://data.humdata.org/dataset/cod-ab-per), vigentes al 14/07/2020 | `per_admin_boundaries.gdb.zip` (no se versiona: se baja con el script) | CC BY-IGO |
| El Peruano, Normas Legales (03/11/2026): Decreto Supremo Nº 149-2026-PCM y transcripción de su Anexo | `2571017-4.pdf`, `DS_149-2026-PCM_distritos_emergencia.xlsx` | Norma legal |

**Fechas oficiales de los dos eventos** (lista de eventos del IGP basada en el ICEN, criterio ENFEN 2024):

- **Niño Costero 2017:** enero a abril de 2017, magnitud moderada.
- **Niño Costero 2023:** marzo de 2023 a febrero de 2024, magnitud fuerte.

El ICEN es el índice oficial con el que el ENFEN, la comisión multisectorial del Estado que vigila El Niño, mide el calentamiento del mar frente a la costa peruana. Es el promedio de 3 meses de la anomalía de temperatura del mar en la región Niño 1+2.

**Contexto (no forma parte de los datos analizados).** OSITRÁN reportó en julio de 2026 que más de 80 puentes de carreteras concesionadas siguen en condición crítica. También informó que todavía hay puentes Bailey provisionales, instalados tras El Niño de 2017, que no se han reemplazado ([nota de prensa del 23/07/2026](https://www.gob.pe/institucion/ositran/noticias/1422567-ositran-alerta-que-mas-de-80-puentes-en-situacion-critica-requieren-intervencion-urgente-del-mtc-ante-el-fenomeno-el-nino)). El estado de cada puente se puede consultar en el panel [Puentes en Alerta](https://www.gob.pe/114098-consultar-el-panel-puentes-en-alerta).

### Procesamiento (`scripts/procesar_datos.py`)

1. **Lectura.** El CSV del SINPAD viene en latin-1 y separado por `;`. De sus 49 columnas se usan 20, que se renombran a nombres simples (`ubigeo`, `puentes_destruidos`, etc.).
2. **Fechas.** De 2003 a 2024 usan el formato `dd/mm/aaaa`; 2025 usa `mm/dd/aa`. Se distinguen por el largo del texto. El 100 % de las fechas coincide con las columnas `AÑO` y `MES`.
3. **Periodo.** Se conservan los registros del 01/01/2016 al 31/05/2024: 61 829 de 142 139.
4. **Duplicados.** No hay filas duplicadas. Siete códigos SINPAD se repiten, pero cada par corresponde a eventos distintos (otra fecha, otro distrito y otro peligro), así que se conservan los dos registros de cada par.
5. **UBIGEO.** Se guarda como texto de 6 dígitos y se cruza con el código `adm3_pcode` del IGN.
   - Cruzan directamente 1866 de 1884 distritos.
   - Mazamari y Pangoa se asignan a su polígono conjunto (`120699`).
   - Quedan sin cruce 16 distritos creados después del mapa de 2020: 60 registros viales, todos desde 2022. Se conservan en las tablas, pero no aparecen en el mapa ([`ubigeos_sin_cruce.csv`](datos/procesados/ubigeos_sin_cruce.csv)).
6. **Peligros.** Los nombres se normalizan: mayúsculas, sin tildes y un solo espacio. Se unifican variantes como «LLUVIAS INTENSAS» y «LLUVIA INTENSA»; en el periodo no aparecen, pero sí desde 2025. Luego se agrupan en tres categorías:
   - **Lluvias**
   - **Huaicos y deslizamientos:** incluye derrumbes y aluviones.
   - **Inundaciones:** todas sus variantes.

   El resto queda fuera: sismos, heladas, incendios, aludes, erosión, etc. En el periodo, los peligros excluidos suman 158 puentes destruidos ([`catalogo_peligros.csv`](datos/procesados/catalogo_peligros.csv)).
7. **Valores extremos.** Se revisaron a mano los 22 valores por encima del percentil 99,9 de cada variable ([`revision_extremos.csv`](datos/procesados/revision_extremos.csv)). Solo se anulan dos valores de un mismo registro: Candarave (Tacna), 17/04/2024, con 100 puentes destruidos y 1000 afectados, cuando el máximo del resto del periodo es 40. Los demás son altos pero verosímiles para distritos extensos.
8. **Temporada y El Niño.**
   - `temporada`: de diciembre a mayo; por ejemplo, 2016-17 va de diciembre de 2016 a mayo de 2017.
   - `nino_costero_mes`: el mes cae dentro de un evento oficial.
   - `temporada_con_nino`: al menos un mes de la temporada cae en un evento.

   El detalle por temporada está en [`temporadas.csv`](datos/procesados/temporadas.csv). La temporada 2015-16 queda incompleta porque empieza en enero de 2016.
9. **Salida.** [`emergencias_viales.csv`](datos/procesados/emergencias_viales.csv) reúne los **10 817 registros** de peligros climáticos con algún daño vial. Los conteos de cada paso están en [`resumen_procesamiento.json`](datos/procesados/resumen_procesamiento.json).

### Indicadores (`scripts/analizar_datos.py`)

- **Km de vía** = km de carretera (red nacional y departamental) + km de camino rural (red vecinal).
- **Distrito con destrucción:** tiene al menos un puente destruido o algún km de vía destruido en la temporada.
- **Multiplicador Niño:** el valor de una temporada dividido entre la **mediana de las 4 temporadas normales**, que son las que no tienen ningún mes de El Niño costero: 2017-18, 2019-20, 2020-21 y 2021-22. Se usa la mediana para que una temporada atípica, como la baja 2017-18, no mueva la línea base.
- **Reincidentes:** distritos con destrucción vial tanto en 2016-17 como en 2022-23.
- **Concentración:** porcentaje del total nacional de la temporada que corresponde a los 10 distritos con más daño.
- El 98,2 % de los puentes destruidos del periodo cae entre diciembre y mayo, lo que respalda el corte por temporada.

Las salidas están en `datos/tablas/`: `por_temporada.csv`, `por_temporada_peligro.csv`, `serie_mensual.csv` (nacional y por departamento, con el ICEN), `por_departamento.csv`, `por_distrito.csv`, `reincidentes.csv` y `kpis.json`.

## 4. Hallazgos principales

**1. Un Niño costero destruye entre 3 y 4 veces más puentes que una temporada de lluvias normal.**

| Temporada (diciembre a mayo) | Puentes destruidos | Km de carretera destruidos | Distritos con destrucción vial |
|---|---:|---:|---:|
| Mediana de las 4 temporadas normales | 175,5 | 180 | 192 |
| **2016-17 · Niño Costero 2017** | **498 (2,8×)** | 3308 (18×) | 603 (3,1×) |
| **2022-23 · Niño Costero 2023** | **650 (3,7×)** | 1656 (9×) | 572 (3,0×) |

**2. El daño en carreteras se concentra en la costa norte, pero el daño en puentes no.**
- Tumbes, Piura, Lambayeque y La Libertad suman el **43 % (2017) y el 64 % (2023) de los km de vía destruidos**, pero solo el **28 % y el 31 % de los puentes destruidos**.
- Los departamentos con más puentes destruidos fueron Lima Provincias (134) y Áncash (112) en 2017, y Cajamarca (121) y Piura (118) en 2023.
- El daño está disperso: los 10 distritos más golpeados reúnen apenas el 25 % y el 27 % de los puentes destruidos de cada temporada.

**3. 294 distritos perdieron infraestructura vial en los dos Niños, y concentran el 61 % de los puentes destruidos en ambos eventos (696 de 1148).**
- Los departamentos con más reincidentes son Áncash (49), Piura (41), Lima Provincias (40), Ayacucho (36) y Cajamarca (28).
- Los que más puentes perdieron sumando los dos eventos son Cochamarca (Lima Provincias, 32), San Benito (Cajamarca, 30), Supe (Lima Provincias, 26) y Huarmaca (Piura, 25).
- La lista completa está en [`datos/tablas/reincidentes.csv`](datos/tablas/reincidentes.csv).

**4. Cada Niño golpeó de forma distinta.**
- El de 2017 destruyó tres veces más km de vía que el de 2023: 5608 km frente a 1885.
- El de 2023 destruyó más puentes: 650 frente a 498.
- En ambos, la mayor parte del daño se registró como «lluvia intensa»: 337 de 498 puentes en 2017 (68 %) y 532 de 650 en 2023 (82 %).

## 5. Limitaciones

- **Subregistro.** El SINPAD recoge lo que reportan las autoridades locales en sus evaluaciones de daños (EDAN). Puede haber daños no reportados o reportados con retraso.
- **El SINPAD no marca qué daños se deben a El Niño.** Se aproxima por la temporada de lluvias (diciembre a mayo) y por las fechas oficiales del ENFEN. Parte del daño de una temporada con Niño puede deberse a otras lluvias.
- **Aumento de los registros.** Sumando todos los peligros, el sistema pasó de 4492–5489 registros anuales en 2018-2020 a 7251–7799 en 2021-2022, sin que hubiera un Niño costero fuerte. Parte del aumento refleja más reportes y no necesariamente más daño. Por eso la línea base usa la mediana y los titulares usan puentes.
- **Los puentes se cuentan sin distinguir su tamaño.** Un puente peatonal pesa lo mismo que uno vehicular.
- **Posible mezcla de unidades en caminos rurales.** El diccionario de datos dice «km o metros» para el camino rural. El total de 2017 (2300 km de camino rural destruidos) debe leerse con cautela.
- **No hay valorización del daño en soles.** El dataset solo trae el costo de la ayuda humanitaria.
- **Mapa distrital de 2020.** 16 distritos creados después no tienen polígono (60 registros viales). Además, cuando un distrito se dividió después de 2017, su daño de 2023 queda en el distrito nuevo, lo que puede subestimar la reincidencia.
- **Línea base corta.** Hay solo 4 temporadas normales en el periodo, y la temporada 2015-16 está incompleta.
- **Valores extremos.** Se excluyó un registro inverosímil (Candarave, 2024). Los demás extremos se conservaron tras revisarlos.
- **Periodo cerrado en mayo de 2024.** Los eventos posteriores no están incluidos.

## 6. Enlaces

- Dashboard: https://dgarcesg.github.io/infraestructura-vial-afectada-ninos-costeros/
- Publicación de LinkedIn: https://www.linkedin.com/feed/update/urn:li:activity:7522884339085516800/

## 7. Cómo reproducir

```bash
pip install -r requirements.txt
python scripts/obtener_datos.py      # descarga en datos/originales/ y actualiza datos/fuentes.csv
python scripts/procesar_datos.py     # escribe datos/procesados/
python scripts/analizar_datos.py     # escribe los indicadores en datos/tablas/
```

Si un archivo ya existe, `obtener_datos.py` no lo vuelve a descargar: solo verifica su SHA-256 contra `datos/fuentes.csv`. El CSV del SINPAD se versiona en el repositorio porque el portal lo reemplaza cada semestre.

**Dashboard** (página estática en `docs/`):

```bash
python scripts/cruzar_decreto.py     # solo si cambia el Excel del decreto: da su UBIGEO a cada distrito del Anexo
python scripts/preparar_pagina.py    # copia las tablas de datos/tablas/ a docs/datos/
python -m http.server 8000 --directory docs    # y abre http://localhost:8000
```

## 8. Uso de inteligencia artificial

**Claude Code (Anthropic)** me ayudó a escribir los scripts de obtención, procesamiento y análisis, y el dashboard. Yo tomé las decisiones de alcance: el periodo, la línea base y qué afirmaciones incluir. También revisé las cifras contra los datos.

## Estructura

```text
├── README.md
├── requirements.txt
├── docs/                    # la página publicada: index.html, app.js, estilos.css, Plotly y datos
├── datos/
│   ├── fuentes.csv          # procedencia, licencia, fecha y SHA-256 de cada original
│   ├── originales/          # SINPAD, ICEN, eventos El Niño y decreto; los límites del IGN se descargan con el script
│   ├── procesados/          # emergencias_viales.csv, tablas de control y distritos del decreto
│   └── tablas/              # tablas, kpis.json y distritos.geojson que alimentan la página
└── scripts/
    ├── obtener_datos.py     # descarga y registro de fuentes
    ├── procesar_datos.py    # limpieza y unificación
    ├── analizar_datos.py    # indicadores para el dashboard
    ├── cruzar_decreto.py    # UBIGEO de los distritos del Decreto Supremo 149-2026-PCM
    └── preparar_pagina.py   # datos de la página estática (docs/datos/)
```
