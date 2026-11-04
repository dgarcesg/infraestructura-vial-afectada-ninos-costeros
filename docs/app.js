/* Infraestructura vial destruida por los Niños Costeros.

   Página estática: lee docs/datos/ y hace los filtros, las sumas y los gráficos en el navegador, sin servidor. */
"use strict";

const REPO = "https://github.com/dgarcesg/infraestructura-vial-afectada-ninos-costeros";

// --- Colores sobre fondo hueso -----------------------------------------------
const FONDO = "#f2f0eb", SUPERFICIE = "#faf9f6", TINTA = "#1b1a18", TINTA_2 = "#4a4945", TINTA_3 = "#6b6963";
const GRILLA = "#dedbd2", EJE = "#bdb9ae", SIN_DANO = "#dfdcd3";
const COLOR_2017 = "#d48c00", COLOR_2023 = "#6250d6", COLOR_AMBOS = "#c8302e";  // ámbar, violeta y rojo para los reincidentes
const COLOR_MES = "#2a78d6";
const COLOR_PELIGRO = {"Lluvias": "#2a78d6", "Huaicos y deslizamientos": "#a8591f", "Inundaciones": "#0f968c"};
const RAMPA = ["#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];  // azul: más oscuro, más daño
const COSTA_NORTE_COLOR = "#2b2a27";

// Tipo de temporada: [etiqueta en la leyenda, color de la barra]
const TIPOS = {
  "Niño Costero 2017": ["Niño Costero 2017", COLOR_2017],
  "Niño Costero 2023": ["Niño Costero 2023", COLOR_2023],
  "Otra con Niño costero": ["Otra temporada con meses de Niño costero", "#6f6c64"],
  "Normal": ["Temporada normal (línea base)", "#a8a498"],
};

// Indicador: [etiqueta, unidad, decimales]
const INDICADORES = {
  puentes_destruidos: ["Puentes destruidos", "puentes", 0],
  puentes_afectados: ["Puentes afectados", "puentes", 0],
  km_via_destruidos: ["Km de vía destruidos (carretera + camino rural)", "km", 1],
  carretera_destruida_km: ["Km de carretera destruidos", "km", 1],
  camino_rural_destruido_km: ["Km de camino rural destruidos", "km", 1],
  km_via_afectados: ["Km de vía afectados (carretera + camino rural)", "km", 1],
  carretera_afectada_km: ["Km de carretera afectados", "km", 1],
  camino_rural_afectado_km: ["Km de camino rural afectados", "km", 1],
};

const FOCO = ["2016-17", "2022-23"];
const AMBOS = "ambos";
const COSTA_NORTE = ["TUMBES", "PIURA", "LAMBAYEQUE", "LA LIBERTAD"];
const DEPTO_UBIGEO = {
  "01": "AMAZONAS", "02": "ANCASH", "03": "APURIMAC", "04": "AREQUIPA", "05": "AYACUCHO",
  "06": "CAJAMARCA", "07": "CALLAO", "08": "CUSCO", "09": "HUANCAVELICA", "10": "HUANUCO",
  "11": "ICA", "12": "JUNIN", "13": "LA LIBERTAD", "14": "LAMBAYEQUE", "15": "LIMA PROVINCIAS",
  "16": "LORETO", "17": "MADRE DE DIOS", "18": "MOQUEGUA", "19": "PASCO", "20": "PIURA",
  "21": "PUNO", "22": "SAN MARTIN", "23": "TACNA", "24": "TUMBES", "25": "UCAYALI",
};
const NOMBRE_DEPTO = {
  "ANCASH": "Áncash", "APURIMAC": "Apurímac", "HUANUCO": "Huánuco", "JUNIN": "Junín",
  "SAN MARTIN": "San Martín", "MADRE DE DIOS": "Madre de Dios",
};
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);
const FUENTE = "system-ui, -apple-system, 'Segoe UI', sans-serif";
// En pantallas táctiles, arrastrar sobre un gráfico recorre la página: sin zoom por arrastre ni barra de herramientas.
const TACTIL = window.matchMedia("(hover: none)").matches;
const CONFIG_GRAFICO = {displaylogo: false, responsive: true, displayModeBar: TACTIL ? false : "hover",
                        modeBarButtonsToRemove: ["select2d", "lasso2d"]};
// Mapa base sin teselas: un rectángulo del color del fondo bajo los distritos, sobre el estilo "white-bg".
const FONDO_MAPA = {
  sourcetype: "geojson", type: "fill", color: FONDO, below: "traces", source: {
    type: "Feature", properties: {},
    geometry: {type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]]},
  },
};

const $ = (id) => document.getElementById(id);

// --- Formatos ----------------------------------------------------------------

function esc(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Redondea hacia arriba en los empates, sobre el número tal como se escribe (24,5 pasa a 25). */
function redondear(positivo, dec) {
  const texto = positivo < 1e-6 ? "0" : String(positivo);
  const [entero, fraccion = ""] = texto.split(".");
  const digitos = BigInt(entero + fraccion.slice(0, dec).padEnd(dec, "0")) + (fraccion[dec] >= "5" ? 1n : 0n);
  const s = digitos.toString().padStart(dec + 1, "0");
  return dec ? `${s.slice(0, -dec)}.${s.slice(-dec)}` : s;
}

/** Coma decimal y espacio de miles desde 10 000, como en el README. */
function num(x, dec = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const texto = redondear(Math.abs(x), dec);
  const [entero, decimales] = texto.split(".");
  const miles = Number(texto) >= 10000 ? entero.replace(/\B(?=(\d{3})+$)/g, " ") : entero;
  return (x < 0 ? "-" : "") + miles + (decimales ? `,${decimales}` : "");
}

const veces = (x) => (x === null || x === undefined || Number.isNaN(x) ? "—" : `${num(x, 1)}×`);
const depto = (nombre) => NOMBRE_DEPTO[nombre]
  ?? nombre.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

function titulo(texto) {
  return String(texto).toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i && MINUSCULAS.has(p) ? p : p.replace(/\p{L}/u, (c) => c.toUpperCase()))).join(" ");  // «(Kichki)»
}

const deptoDeUbigeo = (ubigeo) => (ubigeo.startsWith("1501") ? "LIMA METROPOLITANA" : DEPTO_UBIGEO[ubigeo.slice(0, 2)]);
const mesTexto = (fecha) => `${MESES[Number(fecha.slice(5, 7)) - 1]} ${fecha.slice(0, 4)}`;
function valor(x, indicador) {
  const [, unidad, dec] = INDICADORES[indicador], cifra = num(x, dec);
  return `${cifra} ${cifra === "1" ? unidad.replace(/s$/, "") : unidad}`;
}
const sinAcentos = (texto) => texto.normalize("NFD").replace(/\p{M}/gu, "");
const ordenar = (a, b) => a.localeCompare(b, "es");

// --- Cálculo -----------------------------------------------------------------

/** Quita el ruido de las sumas con decimales (24,500000001), que cambiaría el redondeo. */
const limpio = (x) => Number(x.toFixed(8));
const suma = (filas, columna) => limpio(filas.reduce((t, f) => t + (f[columna] ?? 0), 0));

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Cuantil con interpolación lineal, sobre valores ya ordenados. */
function cuantil(ordenados, q) {
  const pos = q * (ordenados.length - 1), i = Math.floor(pos);
  return i + 1 < ordenados.length ? ordenados[i] + (ordenados[i + 1] - ordenados[i]) * (pos - i) : ordenados[i];
}

/** Redondeo a par en los empates exactos: mantiene los cortes de color de la versión en Python. */
function redondeoAPar(x, dec) {
  const empate = dec === 0
    ? Number.isInteger(x * 2) && !Number.isInteger(x)
    : Number.isInteger(x * 4) && !Number.isInteger(x * 2);
  if (!empate) return Number(x.toFixed(dec));
  const base = 10 ** dec, abajo = Math.floor(x * base);
  return (abajo % 2 === 0 ? abajo : abajo + 1) / base;
}

/** Hasta 5 clases con cortes en cuantiles de los distritos con daño; 0 = sin daño. */
function clases(valores, dec) {
  const positivos = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (!positivos.length) return {clase: valores.map(() => 0), etiquetas: ["Sin daño registrado"]};
  const maximo = positivos[positivos.length - 1];
  const cortes = [];
  for (const q of [0.5, 0.75, 0.9, 0.97]) {
    const corte = redondeoAPar(cuantil(positivos, q), dec);
    if (corte > (cortes.length ? cortes[cortes.length - 1] : 0) && corte < maximo) cortes.push(corte);
  }
  const limites = [0, ...cortes, maximo];
  const clase = valores.map((v) => {
    if (v <= 0) return 0;
    for (let i = 1; i < limites.length; i++) if (v <= limites[i]) return i;
    return 0;
  });
  const etiquetas = ["Sin daño registrado"];
  for (let i = 0; i < limites.length - 1; i++) {
    const a = limites[i], b = limites[i + 1];
    if (dec === 0) {
      const bajo = Math.trunc(a) + 1;
      etiquetas.push(bajo === b ? num(b) : `${num(bajo)}–${num(b)}`);
    } else {
      etiquetas.push(i === 0 ? `hasta ${num(b, dec)}` : `${num(a, dec)}–${num(b, dec)}`);
    }
  }
  return {clase, etiquetas};
}

function tonos(n) {
  if (n === 1) return [RAMPA[2]];
  return Array.from({length: n}, (_, i) => RAMPA[Math.round(i * (RAMPA.length - 1) / (n - 1))]);
}

function encuadre(extension, ancho, alto) {
  const lonMin = Math.min(...extension.map((f) => f.lon_min)), lonMax = Math.max(...extension.map((f) => f.lon_max));
  const latMin = Math.min(...extension.map((f) => f.lat_min)), latMax = Math.max(...extension.map((f) => f.lat_max));
  const lonSpan = Math.max(lonMax - lonMin, 0.05), latSpan = Math.max(latMax - latMin, 0.05);
  const zoom = Math.log2(Math.min(ancho / lonSpan, alto / latSpan) * 360 / 512);
  return {centro: {lon: (lonMin + lonMax) / 2, lat: (latMin + latMax) / 2}, zoom: Math.min(zoom, 10)};
}

function solo(geo, ubigeos) {
  const conjunto = new Set(ubigeos);
  return {type: "FeatureCollection", features: geo.features.filter((f) => conjunto.has(f.properties.ubigeo))};
}

function totalesPorTemporada(distritos, departamento, indicador) {
  const serie = new Map();
  for (const f of distritos) {
    if (departamento !== null && f.departamento !== departamento) continue;
    serie.set(f.temporada, (serie.get(f.temporada) ?? 0) + (f[indicador] ?? 0));
  }
  return D.temporadas.map((t) => ({temporada: t.temporada, tipo: t.tipo, valor: limpio(serie.get(t.temporada) ?? 0)}));
}

function etiquetaTemporada(f) {
  if (f.foco) return `${f.temporada} · ${f.foco}`;
  if (f.tipo === "Normal") return `${f.temporada} · normal`;
  if (f.temporada === "2023-24") return `${f.temporada} · final del Niño Costero 2023`;
  return `${f.temporada} · Niño costero ${f.magnitud_nino.toLowerCase()}`;
}

// --- Estilo de los gráficos --------------------------------------------------

const angosto = () => window.innerWidth < 640;

function mezclar(base, extra) {
  const salida = {...base};
  for (const [k, v] of Object.entries(extra)) {
    const anidar = v && typeof v === "object" && !Array.isArray(v) && salida[k] && typeof salida[k] === "object";
    salida[k] = anidar ? mezclar(salida[k], v) : v;
  }
  return salida;
}

function estilo(layout, alto, leyenda = true) {
  const ejes = {
    gridcolor: GRILLA, linecolor: EJE, zerolinecolor: EJE, automargin: true,
    tickfont: {color: TINTA_3}, title: {font: {color: TINTA_2}},
  };
  const base = {
    height: alto,
    paper_bgcolor: FONDO, plot_bgcolor: FONDO,
    font: {family: FUENTE, color: TINTA_2, size: 13},
    margin: {l: 8, r: 16, t: leyenda ? (angosto() ? 118 : 64) : 12, b: 8},
    separators: ", ",
    showlegend: leyenda,
    legend: {orientation: "h", x: 0, y: 1.02, yanchor: "bottom", bgcolor: "rgba(0,0,0,0)", traceorder: "normal",
             font: {color: TINTA_2, size: 12}},
    hoverlabel: {bgcolor: SUPERFICIE, bordercolor: EJE, font: {color: TINTA, family: FUENTE}},
    bargap: 0.3, barcornerradius: 4,
  };
  const salida = mezclar(base, layout);
  for (const k of Object.keys(salida)) {
    if (/^[xy]axis/.test(k)) salida[k] = mezclar(ejes, salida[k]);
  }
  return salida;
}

function mostrar(id, data, layout) {
  return Plotly.react(id, data, TACTIL ? {...layout, dragmode: false} : layout, CONFIG_GRAFICO);
}

/** Con el dedo: uno recorre la página, dos mueven el mapa y un toque muestra el dato del distrito. */
function gestosMapa(id) {
  const mapa = TACTIL && $(id)._fullLayout.map?._subplot?.map;
  if (!mapa || mapa.gestosListos) return;
  mapa.gestosListos = true;
  mapa._locale = {...mapa._locale, "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa"};
  mapa.cooperativeGestures.enable();
  // El texto emergente del mapa solo responde al ratón: un toque sin arrastre se le pasa como un movimiento.
  let inicio = null;
  mapa.on("touchstart", (e) => { inicio = e.originalEvent.touches.length === 1 ? e.point : null; });
  mapa.on("touchend", (e) => {
    if (!inicio || e.point.dist(inicio) > 8) return;
    inicio = null;
    mapa.fire("mousemove", {originalEvent: {offsetX: e.point.x, offsetY: e.point.y}, point: e.point, lngLat: e.lngLat});
  });
}

function leyendaHtml(items, tituloLeyenda = "") {
  const partes = tituloLeyenda ? [`<span class="ley-t">${esc(tituloLeyenda)}</span>`] : [];
  for (const [texto, color] of items) {
    partes.push(`<span class="ley-i"><span class="ley-c" style="background:${color}"></span>${esc(texto)}</span>`);
  }
  return partes.join("");
}

function tarjeta(etiqueta, cifra, nota) {
  return `<div class="kpi"><div class="kpi-t">${esc(etiqueta)}</div><div class="kpi-v">${esc(cifra)}</div>`
    + `<div class="kpi-n">${esc(nota)}</div></div>`;
}

// --- Gráficos ----------------------------------------------------------------

function figuraTemporadas(id, t, indicador, med, alto = 380) {
  const [etiqueta, , dec] = INDICADORES[indicador];
  const data = [];
  for (const [tipo, [nombre, color]] of Object.entries(TIPOS)) {
    const sub = t.filter((f) => f.tipo === tipo);
    if (!sub.length) continue;
    data.push({
      type: "bar", x: sub.map((f) => f.temporada), y: sub.map((f) => f.valor), name: nombre, marker: {color},
      customdata: sub.map((f) => valor(f.valor, indicador)),
      hovertemplate: "Temporada %{x}<br>%{customdata}<extra></extra>",
    });
  }
  const shapes = [], annotations = [];
  if (med !== null && med > 0) {
    shapes.push({type: "line", xref: "x domain", x0: 0, x1: 1, yref: "y", y0: med, y1: med,
                 line: {color: TINTA_2, width: 1, dash: "dash"}});
    // Al final de la línea, fuera de las barras. La nota sobre el gráfico explica de qué temporadas es la mediana.
    annotations.push({xref: "x domain", x: 1, xanchor: "left", xshift: 4, yref: "y", y: med, yanchor: "middle", showarrow: false,
                      align: "left", text: `Mediana:<br>${num(med, dec)}`, font: {color: TINTA_2, size: 12}});
  }
  for (const f of t.filter((f) => FOCO.includes(f.temporada))) {
    annotations.push({x: f.temporada, y: f.valor, text: num(f.valor, dec), showarrow: false,
                      yanchor: "bottom", yshift: 4, font: {color: TINTA, size: 13}});
  }
  return mostrar(id, data, estilo({
    barmode: "stack", shapes, annotations, ...(med !== null && med > 0 ? {margin: {r: 68}} : {}),
    xaxis: {type: "category", categoryorder: "array", categoryarray: t.map((f) => f.temporada),
            title: {text: "Temporada de lluvias (diciembre a mayo)"}},
    yaxis: {title: {text: etiqueta}},
  }, alto));
}

function figuraPeligros(id, indicador) {
  const [etiqueta] = INDICADORES[indicador];
  const total = new Map();
  for (const f of D.peligros) total.set(f.temporada, (total.get(f.temporada) ?? 0) + f[indicador]);
  const data = Object.entries(COLOR_PELIGRO).map(([grupo, color]) => {
    const sub = D.peligros.filter((f) => f.grupo_peligro === grupo);
    return {
      type: "bar", x: sub.map((f) => f.temporada), y: sub.map((f) => f[indicador]), name: grupo,
      marker: {color, line: {color: FONDO, width: 1.5}},
      customdata: sub.map((f) => {
        const t = total.get(f.temporada);
        return `${valor(f[indicador], indicador)} (${num(t ? f[indicador] / t * 100 : 0)} % de la temporada)`;
      }),
      hovertemplate: `${grupo} · %{x}<br>%{customdata}<extra></extra>`,
    };
  });
  return mostrar(id, data, estilo({
    barmode: "stack", margin: {t: 64},
    xaxis: {title: {text: "Temporada de lluvias (diciembre a mayo)"}},
    yaxis: {title: {text: etiqueta}},
  }, 380));
}

/** Tramos continuos de meses dentro de un evento oficial de Niño costero. */
function tramosNino(mensual) {
  const meses = mensual.filter((f) => f.nino_costero).map((f) => f.mes).sort();
  const indice = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  const tramos = [];
  for (const mes of meses) {
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && indice(mes) - indice(ultimo[1]) === 1) ultimo[1] = mes;
    else tramos.push([mes, mes]);
  }
  return tramos.map(([inicio, fin]) => {
    if (inicio <= "2017-04" && fin >= "2017-01") return [inicio, fin, "Niño 2017", COLOR_2017];
    if (inicio <= "2024-02" && fin >= "2023-03") return [inicio, fin, "Niño 2023", COLOR_2023];
    return [inicio, fin, "Otro Niño", TINTA_3];
  });
}

function desplazarDias(mes, dias) {
  return new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1 + dias)).toISOString().slice(0, 10);
}

function figuraMensual(id, mensual, indicador) {
  const [etiqueta, unidad] = INDICADORES[indicador];
  const fechas = mensual.map((f) => `${f.mes}-01`);
  // Dos filas con el mismo eje de tiempo: 64 % y 36 % de la altura, con 9 % de separación.
  const dominio1 = [0.4176, 1], dominio2 = [0, 0.3276];
  const tituloFila = (texto, y) => ({text: texto, xref: "paper", yref: "paper", x: 0, y, xanchor: "left", yanchor: "bottom",
                                      showarrow: false, font: {color: TINTA, size: 13}});
  const data = [
    {type: "bar", x: fechas, y: mensual.map((f) => f[indicador]), marker: {color: COLOR_MES}, name: etiqueta,
     customdata: mensual.map((f) => `${mesTexto(f.mes)}: ${valor(f[indicador], indicador)}`),
     hovertemplate: "%{customdata}<extra></extra>", xaxis: "x", yaxis: "y"},
    {type: "scatter", x: fechas, y: mensual.map((f) => f.icen), mode: "lines", line: {color: TINTA_2, width: 2}, name: "ICEN",
     customdata: mensual.map((f) => `${mesTexto(f.mes)}: ICEN ${num(f.icen, 2)} °C`),
     hovertemplate: "%{customdata}<extra></extra>", xaxis: "x2", yaxis: "y2"},
  ];
  const shapes = [{type: "line", xref: "x2 domain", x0: 0, x1: 1, yref: "y2", y0: 0.4, y1: 0.4,
                   line: {color: TINTA_3, width: 1, dash: "dot"}}];
  const annotations = [
    tituloFila(`${etiqueta} por mes`, dominio1[1]),
    tituloFila("ICEN: anomalía de la temperatura del mar en la región Niño 1+2 (°C)", dominio2[1]),
  ];
  for (const [inicio, fin, nombre, color] of tramosNino(mensual)) {
    const x0 = desplazarDias(inicio, -15), x1 = desplazarDias(fin, 16);
    for (const [xref, yref] of [["x", "y domain"], ["x2", "y2 domain"]]) {
      shapes.push({type: "rect", xref, yref, x0, x1, y0: 0, y1: 1, fillcolor: color, opacity: 0.22, line: {width: 0}, layer: "below"});
    }
    // En pantallas angostas la franja gris de los otros Niños va sin rótulo, para que no pise el de 2017.
    if (angosto() && nombre === "Otro Niño") continue;
    annotations.push({x: x0, y: 1, xref: "x", yref: "y domain", text: nombre, showarrow: false,
                      xanchor: "left", yanchor: "top", font: {color: TINTA_2, size: 11}});
  }
  const tiempo = {tickformat: "%Y", dtick: "M12", ticklabelmode: "period"};
  return mostrar(id, data, estilo({
    shapes, annotations,
    xaxis: {...tiempo, anchor: "y", matches: "x2", showticklabels: false},
    xaxis2: {...tiempo, anchor: "y2"},
    yaxis: {anchor: "x", domain: dominio1, title: {text: unidad}},
    yaxis2: {anchor: "x2", domain: dominio2, title: {text: "°C"}},
    margin: {t: 30}, bargap: 0.15,
  }, 520, false));
}

function figuraRanking(id, tabla, indicador, departamentoSel, colorResto, alto = 640) {
  const [etiqueta, , dec] = INDICADORES[indicador];
  const orden = [...tabla].sort((a, b) => a[indicador] - b[indicador]);
  return mostrar(id, [{
    type: "bar", orientation: "h", x: orden.map((f) => f[indicador]),
    y: orden.map((f) => `${f.departamento === departamentoSel ? "▸ " : ""}${depto(f.departamento)}`),
    marker: {color: orden.map((f) => (COSTA_NORTE.includes(f.departamento) ? COSTA_NORTE_COLOR : colorResto))},
    customdata: orden.map((f) => valor(f[indicador], indicador)),
    hovertemplate: "%{y}<br>%{customdata}<extra></extra>",
    text: orden.map((f) => num(f[indicador], dec)), textposition: "outside",
    textfont: {color: TINTA_2, size: 11}, cliponaxis: false,
  }], estilo({
    xaxis: {title: {text: etiqueta}, showgrid: true},
    yaxis: {tickfont: {color: TINTA_2}, dtick: 1},
    bargap: 0.25, margin: {r: 40},
  }, alto, false));
}

function figuraTopReincidentes(id, top, indicador) {
  const [etiqueta, , dec] = INDICADORES[indicador];
  const filas = [...top].reverse();
  const data = [["2016-17", "Niño Costero 2017", COLOR_2017], ["2022-23", "Niño Costero 2023", COLOR_2023]]
    .map(([temporada, nombre, color]) => ({
      type: "bar", orientation: "h", x: filas.map((f) => f[temporada]), y: filas.map((f) => f.etiqueta), name: nombre,
      marker: {color, line: {color: FONDO, width: 1.5}},
      customdata: filas.map((f) => valor(f[temporada], indicador)),
      hovertemplate: `%{y}<br>${nombre}: %{customdata}<extra></extra>`,
    }));
  const annotations = filas.map((f) => ({x: f.total, y: f.etiqueta, text: num(f.total, dec), showarrow: false,
                                         xanchor: "left", xshift: 6, font: {color: TINTA_2, size: 11}}));
  return mostrar(id, data, estilo({
    barmode: "stack", annotations,
    xaxis: {title: {text: `${etiqueta}, sumando los dos eventos`}},
    yaxis: {tickfont: {color: TINTA_2}, dtick: 1},
    margin: {r: 48, t: 64},
  }, 34 * filas.length + 110));
}

function figuraMapa(id, geo, tabla, colores, centro, zoom, distritoMapa, revision) {
  const k = colores.length;
  const escala = colores.flatMap((color, i) => [[i / k, color], [(i + 1) / k, color]]);
  const data = [{
    type: "choroplethmap", geojson: geo, featureidkey: "properties.ubigeo",
    locations: tabla.map((f) => f.ubigeo_mapa), z: tabla.map((f) => f.clase),
    zmin: -0.5, zmax: k - 0.5, colorscale: escala, showscale: false,
    marker: {line: {width: 0.3, color: FONDO}},
    customdata: tabla.map((f) => [f.nombre, f.detalle]),
    hovertemplate: "<b>%{customdata[0]}</b><br>%{customdata[1]}<extra></extra>",
  }];
  if (distritoMapa) {
    data.push({
      type: "choroplethmap", geojson: solo(D.geo, [distritoMapa]), featureidkey: "properties.ubigeo",
      locations: [distritoMapa], z: [0], colorscale: [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0)"]], showscale: false,
      marker: {line: {width: 2.5, color: TINTA}}, hoverinfo: "skip",
    });
  }
  return mostrar(id, data, {
    map: {style: "white-bg", layers: [FONDO_MAPA], center: centro, zoom},
    height: angosto() ? 460 : 620, margin: {l: 0, r: 0, t: 0, b: 0}, paper_bgcolor: FONDO, uirevision: revision,
    hoverlabel: {bgcolor: SUPERFICIE, bordercolor: EJE, font: {color: TINTA, family: FUENTE}},
  }).then(() => {
    gestosMapa(id);
    // Tras un gesto con los dedos, Plotly puede no recentrar el mapa: al cambiar de zona se encuadra aquí.
    const mapa = $(id)._fullLayout.map._subplot.map;
    if (mapa.zonaEncuadrada !== revision) {
      mapa.zonaEncuadrada = revision;
      mapa.jumpTo({center: [centro.lon, centro.lat], zoom});
    }
  });
}

// --- Estado y datos ----------------------------------------------------------

const D = {};
const estado = {eleccion: AMBOS, indicador: "puentes_destruidos", departamento: null, distrito: null,
                modo: "dano", pestana: "mapa", busqueda: "", orden: null,
                grupoDecreto: "todos", busquedaDecreto: "", ordenDecreto: null};
const sucias = new Set();
let C = null;   // lo calculado para los filtros actuales

function filas(columnas) {
  const nombres = Object.keys(columnas);
  return columnas[nombres[0]].map((_, i) => Object.fromEntries(nombres.map((c) => [c, columnas[c][i]])));
}

async function cargar() {
  const leer = async (ruta) => {
    const r = await fetch(ruta);
    if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
    return r.json();
  };
  const [datos, geo] = await Promise.all([leer("datos/datos.json"), leer("datos/distritos.geojson")]);
  for (const t of ["temporadas", "peligros", "mensual", "deptos", "distritos", "reincidentes", "decreto"]) D[t] = filas(datos[t]);
  D.columnasDistritos = Object.keys(datos.distritos);
  D.kpis = datos.kpis;
  D.geo = geo;
  D.opciones = new Map([[AMBOS, "Ambos Niños costeros"], ...D.temporadas.map((t) => [t.temporada, etiquetaTemporada(t)])]);

  // Departamento y extensión de cada polígono
  D.mapa = geo.features.map((f) => {
    const p = f.properties, g = f.geometry;
    const poligonos = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
    for (const pol of poligonos) for (const anillo of pol) for (const [lon, lat] of anillo) {
      lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon);
      latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
    }
    const departamento = deptoDeUbigeo(p.ubigeo);
    return {ubigeo_mapa: p.ubigeo, departamento, nombre: `${p.distrito} · ${p.provincia} (${depto(departamento)})`,
            lon_min: lonMin, lon_max: lonMax, lat_min: latMin, lat_max: latMax};
  });

  // Catálogo del buscador: un distrito por ubigeo
  const vistos = new Map();
  for (const f of D.distritos) {
    if (vistos.has(f.ubigeo)) continue;
    const nombre = `${titulo(f.distrito)} · ${titulo(f.provincia)} (${depto(f.departamento)})`;
    vistos.set(f.ubigeo, {...f, nombre, clave: sinAcentos(nombre).toLowerCase()});
  }
  D.catalogo = [...vistos.values()].sort((a, b) => ordenar(a.nombre, b.nombre));
  D.porUbigeo = vistos;
  D.setReincidentes = new Set(D.reincidentes.map((f) => f.ubigeo));
  cruzarDecreto();
}

function calcular() {
  const {eleccion, indicador, departamento} = estado;
  const temps = eleccion === AMBOS ? FOCO : [eleccion];
  const [etiquetaInd, , decInd] = INDICADORES[indicador];
  const zonaDistritos = departamento === null ? D.distritos : D.distritos.filter((f) => f.departamento === departamento);
  const sel = zonaDistritos.filter((f) => temps.includes(f.temporada));
  const zonaReinc = departamento === null ? D.reincidentes : D.reincidentes.filter((f) => f.departamento === departamento);
  const totales = totalesPorTemporada(D.distritos, departamento, indicador);
  const normales = D.kpis.temporadas_normales;
  const med = mediana(totales.filter((f) => normales.includes(f.temporada)).map((f) => f.valor));
  const elegidas = totales.filter((f) => temps.includes(f.temporada)).map((f) => f.valor);
  const promedio = elegidas.reduce((a, b) => a + b, 0) / elegidas.length;
  return {
    temps, etiquetaInd, decInd, zonaDistritos, sel, zonaReinc, totales, med,
    nombreSeleccion: eleccion === AMBOS ? "los dos Niños costeros" : `la temporada ${eleccion}`,
    zona: departamento === null ? "el Perú" : depto(departamento),
    setReinc: new Set(zonaReinc.map((f) => f.ubigeo)),
    multiplicador: med > 0 ? promedio / med : null,
    conDestruccion: new Set(sel.filter((f) => f.distritos_con_destruccion > 0).map((f) => f.ubigeo)),
  };
}

// --- Indicadores -------------------------------------------------------------

function dibujarKpis() {
  const c = C;
  let notaMult = `${c.etiquetaInd} ${estado.eleccion === AMBOS ? "por temporada " : ""}frente a la mediana de las `
    + `4 temporadas normales (${num(c.med, c.decInd)}).`;
  if (c.med === 0) notaMult = "Sin daño en las temporadas normales de referencia: no se puede comparar.";
  const reinc = [...c.conDestruccion].filter((u) => c.setReinc.has(u)).length;
  $("kpis").innerHTML = [
    tarjeta("Puentes destruidos", num(suma(c.sel, "puentes_destruidos")), `En ${c.nombreSeleccion}, en ${c.zona}.`),
    tarjeta("Veces una temporada normal", veces(c.multiplicador), notaMult),
    tarjeta("Km de carretera destruidos", num(suma(c.sel, "carretera_destruida_km")),
            `Red nacional y departamental. Más ${num(suma(c.sel, "camino_rural_destruido_km"))} km de camino rural.`),
    tarjeta("Distritos con destrucción vial", num(c.conDestruccion.size),
            `De ellos, ${num(reinc)} perdieron puentes o vías en los dos Niños.`),
  ].join("");
}

// --- Pestaña: mapa -----------------------------------------------------------

function tablaDano(c, zonaMapa) {
  const {indicador} = estado;
  const porPoligono = new Map();
  for (const f of c.sel) {
    if (!f.ubigeo_mapa) continue;
    const p = porPoligono.get(f.ubigeo_mapa) ?? {};
    p[f.temporada] = (p[f.temporada] ?? 0) + (f[indicador] ?? 0);
    porPoligono.set(f.ubigeo_mapa, p);
  }
  const tabla = zonaMapa.map((m) => {
    const p = porPoligono.get(m.ubigeo_mapa) ?? {};
    return {...m, partes: p, valor: limpio(c.temps.reduce((t, x) => t + (p[x] ?? 0), 0))};
  });
  const {clase, etiquetas} = clases(tabla.map((f) => f.valor), c.decInd);
  tabla.forEach((f, i) => {
    f.clase = clase[i];
    f.detalle = `${c.etiquetaInd}: ${valor(f.valor, indicador)}`;
    if (c.temps.length > 1) {
      f.detalle += `<br>2017: ${num(limpio(f.partes["2016-17"] ?? 0), c.decInd)} · 2023: ${num(limpio(f.partes["2022-23"] ?? 0), c.decInd)}`;
    }
  });
  const colores = [SIN_DANO, ...tonos(etiquetas.length - 1)];
  const leyenda = leyendaHtml(etiquetas.map((e, i) => [e, colores[i]]), `${c.etiquetaInd} en ${c.nombreSeleccion}:`);
  return {tabla, colores, leyenda};
}

function tablaReincidencia(c, zonaMapa) {
  // Por distrito: ¿hubo destrucción en cada Niño? Luego, por polígono (dos distritos pueden compartir uno).
  const porDistrito = new Map(), resumen = new Map();
  for (const f of c.zonaDistritos) {
    if (!FOCO.includes(f.temporada) || !f.ubigeo_mapa) continue;
    const d = porDistrito.get(f.ubigeo) ?? {ubigeo_mapa: f.ubigeo_mapa};
    d[f.temporada] = Math.max(d[f.temporada] ?? 0, f.distritos_con_destruccion);
    porDistrito.set(f.ubigeo, d);
    const r = resumen.get(f.ubigeo_mapa) ?? {};
    for (const col of ["puentes_destruidos", "km_via_destruidos"]) {
      r[`${col}|${f.temporada}`] = (r[`${col}|${f.temporada}`] ?? 0) + (f[col] ?? 0);
    }
    resumen.set(f.ubigeo_mapa, r);
  }
  const poligono = new Map();
  for (const d of porDistrito.values()) {
    const p = poligono.get(d.ubigeo_mapa) ?? {d17: false, d23: false, ambos: false};
    const d17 = (d["2016-17"] ?? 0) > 0, d23 = (d["2022-23"] ?? 0) > 0;
    p.d17 ||= d17; p.d23 ||= d23; p.ambos ||= d17 && d23;
    poligono.set(d.ubigeo_mapa, p);
  }
  const textos = ["Sin destrucción vial en ninguno de los dos", "Destrucción solo en el Niño 2017",
                  "Destrucción solo en el Niño 2023", "Destrucción en los dos Niños (reincidente)"];
  const tabla = zonaMapa.map((m) => {
    const p = poligono.get(m.ubigeo_mapa) ?? {d17: false, d23: false, ambos: false};
    const clase = p.ambos ? 3 : p.d17 ? 1 : p.d23 ? 2 : 0;
    // Mazamari y Pangoa comparten polígono: uno tuvo destrucción en 2017 y el otro en 2023.
    const mixto = p.d17 && p.d23 && !p.ambos;
    const r = resumen.get(m.ubigeo_mapa) ?? {};
    const dato = (col, t, dec) => num(limpio(r[`${col}|${t}`] ?? 0), dec);
    const detalle = `${mixto ? "Polígono de dos distritos: destrucción en 2017 en uno y en 2023 en el otro" : textos[clase]}`
      + `<br>Puentes destruidos · 2017: ${dato("puentes_destruidos", "2016-17", 0)} · 2023: ${dato("puentes_destruidos", "2022-23", 0)}`
      + `<br>Km de vía destruidos · 2017: ${dato("km_via_destruidos", "2016-17", 1)} · 2023: ${dato("km_via_destruidos", "2022-23", 1)}`;
    return {...m, clase, detalle};
  });
  const colores = [SIN_DANO, COLOR_2017, COLOR_2023, COLOR_AMBOS];
  const conteo = [0, 0, 0, 0];
  for (const f of tabla) conteo[f.clase]++;
  const nombres = ["Ninguno", "Solo Niño 2017", "Solo Niño 2023", "Ambos Niños"];
  const leyenda = leyendaHtml([3, 1, 2, 0].map((i) => [`${nombres[i]} (${num(conteo[i])})`, colores[i]]),
                              "Distritos con puentes o vías destruidos:");
  return {tabla, colores, leyenda};
}

function dibujarMapa() {
  const c = C, {departamento, distrito, modo, indicador} = estado;
  const zonaMapa = departamento === null ? D.mapa : D.mapa.filter((f) => f.departamento === departamento);
  const geoZona = departamento === null ? D.geo : solo(D.geo, zonaMapa.map((f) => f.ubigeo_mapa));
  const info = distrito ? D.porUbigeo.get(distrito) : null;
  const ubigeoMapaSel = info?.ubigeo_mapa ?? null;
  const encuadreSel = ubigeoMapaSel ? zonaMapa.filter((f) => f.ubigeo_mapa === ubigeoMapaSel) : [];
  const zonaEncuadre = encuadreSel.length ? encuadreSel : zonaMapa;
  const caja = $("g-mapa");
  const alto = angosto() ? 440 : 600;
  let {centro, zoom} = encuadre(zonaEncuadre, caja.clientWidth || 780, alto);
  if (encuadreSel.length) zoom = Math.min(zoom - 1.2, 9);

  const {tabla, colores, leyenda} = modo === "dano" ? tablaDano(c, zonaMapa) : tablaReincidencia(c, zonaMapa);
  $("ley-mapa").innerHTML = leyenda;
  $("nota-mapa").textContent = (TACTIL ? "Toca un distrito para ver su dato; con dos dedos mueves y acercas el mapa. " : "")
    + (modo === "dano" ? "Cortes de color en cuantiles de los distritos con daño. "
    : "Este modo siempre compara las temporadas 2016-17 y 2022-23, sin importar la temporada elegida. ")
    + "Mapa distrital del IGN (2020): 16 distritos creados después no tienen polígono y no aparecen.";
  figuraMapa("g-mapa", geoZona, tabla, colores, centro, zoom, ubigeoMapaSel, `${departamento}|${distrito}`);

  const ficha = $("ficha");
  if (document.getElementById("g-ficha")) Plotly.purge("g-ficha");
  if (!info) {
    ficha.innerHTML = "";
    return;
  }
  const reincidente = D.setReincidentes.has(distrito);
  ficha.innerHTML = `<h3>${esc(info.nombre)}</h3>`
    + `<p>Región ${esc(titulo(info.region_natural))} · ${reincidente
      ? "<strong>reincidente</strong>: perdió puentes o vías en los dos Niños" : "no es reincidente"}.</p>`
    + (info.ubigeo_mapa ? "" : `<p class="nota">Este distrito se creó después del mapa de 2020, así que no aparece en el mapa.</p>`)
    + `<div id="g-ficha" class="grafico"></div>`;
  const tDist = totalesPorTemporada(D.distritos.filter((f) => f.ubigeo === distrito), null, indicador);
  figuraTemporadas("g-ficha", tDist, indicador, null, 300);
}

// --- Pestaña: temporadas -----------------------------------------------------

function dibujarTemporadas() {
  const c = C, {departamento, indicador} = estado;
  $("h-temporadas").textContent = `${c.etiquetaInd} por temporada de lluvias en ${c.zona}`;
  figuraTemporadas("g-temporadas", c.totales, indicador, c.med);
  $("h-mensual").textContent = `Mes a mes en ${c.zona}, junto al calentamiento del mar`;
  figuraMensual("g-mensual", D.mensual.filter((f) => f.departamento === (departamento ?? "PERÚ")), indicador);
  $("h-peligros").textContent = `${c.etiquetaInd} por tipo de peligro (todo el Perú)`;
  $("nota-peligros").textContent = "El tipo de peligro es la etiqueta con que la autoridad local registró la emergencia. "
    + "Una lluvia intensa suele desencadenar huaicos, así que la división es aproximada."
    + (departamento ? " Este gráfico es nacional: no cambia con el departamento." : "");
  figuraPeligros("g-peligros", indicador);
}

// --- Pestaña: departamentos --------------------------------------------------

function dibujarDepartamentos() {
  const c = C, {departamento, indicador} = estado;
  $("h-departamentos").textContent = `${c.etiquetaInd} por departamento`;
  // Cada temporada conserva su color de la pestaña Temporadas; costa norte se destaca igual en todas.
  const tipoDe = (t) => TIPOS[D.temporadas.find((x) => x.temporada === t).tipo];
  $("ley-departamentos").innerHTML = leyendaHtml([
    ["Costa norte (Tumbes, Piura, Lambayeque y La Libertad)", COSTA_NORTE_COLOR],
    ...c.temps.map((t) => [c.temps.length > 1 ? `Resto del país en el ${tipoDe(t)[0]}` : "Resto del país", tipoDe(t)[1]]),
  ]);
  const nota = $("nota-departamentos");
  nota.hidden = !departamento;
  nota.textContent = departamento ? `El ranking muestra todos los departamentos; ${c.zona} aparece marcado con ▸.` : "";
  const caja = $("rankings");
  caja.querySelectorAll(".js-plotly-plot").forEach((g) => Plotly.purge(g));
  caja.innerHTML = c.temps.map((t) => `<div>
      <p class="ranking-t">${esc(D.opciones.get(t))}</p>
      <p class="sub" id="resumen-${t}"></p>
      <div id="g-ranking-${t}" class="grafico"></div>
    </div>`).join("");
  for (const temporada of c.temps) {
    const tabla = D.deptos.filter((f) => f.temporada === temporada);
    const total = suma(tabla, indicador);
    const costa = suma(tabla.filter((f) => COSTA_NORTE.includes(f.departamento)), indicador);
    $(`resumen-${temporada}`).textContent = `La costa norte concentra el ${num(total ? costa / total * 100 : 0)} % `
      + `del total nacional (${valor(total, indicador)}).`;
    figuraRanking(`g-ranking-${temporada}`, tabla, indicador, departamento, tipoDe(temporada)[1]);
  }
}

// --- Listas con columnas ordenables ------------------------------------------

/** Una columna puede ordenar por `clave` en vez de por lo que muestra. No toca la lista original. */
function ordenarFilas(lista, columnas, orden) {
  if (!orden) return lista;
  const {i, asc} = orden, leer = columnas[i].clave ?? columnas[i].f;
  return [...lista].sort((a, b) => {
    const x = leer(a), y = leer(b);
    return (asc ? 1 : -1) * (typeof x === "number" ? x - y : ordenar(x, y));
  });
}

function tablaHtml(columnas, lista, ordenActual) {
  const encabezado = columnas.map((c, i) => {
    const activa = ordenActual?.i === i;
    const orden = activa ? (ordenActual.asc ? "ascending" : "descending") : "none";
    const marca = activa ? (ordenActual.asc ? " ▲" : " ▼") : "";
    return `<th scope="col" class="${c.ver ? "n" : ""}" aria-sort="${orden}"${c.ayuda ? ` title="${esc(c.ayuda)}"` : ""}>`
      + `<button type="button" data-columna="${i}">${esc(c.t)}${marca}</button></th>`;
  }).join("");
  const cuerpo = lista.map((x) => `<tr>${columnas.map((c) => {
    const v = c.f(x);
    return `<td${c.ver ? ' class="n"' : ""}>${esc(c.ver ? c.ver(v) : v)}</td>`;
  }).join("")}</tr>`).join("");
  return `<thead><tr>${encabezado}</tr></thead><tbody>${cuerpo}</tbody>`;
}

function activarOrden(idTabla, columnas, claveEstado, redibujar) {
  $(idTabla).addEventListener("click", (e) => {
    const b = e.target.closest("button[data-columna]");
    if (!b) return;
    const i = Number(b.dataset.columna), previo = estado[claveEstado];
    estado[claveEstado] = {i, asc: previo?.i === i ? !previo.asc : !columnas[i].ver};
    redibujar();
    $(idTabla).querySelector(`button[data-columna="${i}"]`).focus();
  });
}

// --- Pestaña: reincidentes ---------------------------------------------------

const COLUMNAS_LISTA = [
  {t: "Distrito", f: (x) => titulo(x.distrito)},
  {t: "Provincia", f: (x) => titulo(x.provincia)},
  {t: "Departamento", f: (x) => depto(x.departamento)},
  {t: "Región", f: (x) => titulo(x.region_natural)},
  {t: "Puentes 2017", f: (x) => x["puentes_destruidos_2016-17"], ver: (v) => num(v), ayuda: "Puentes destruidos en 2016-17"},
  {t: "Puentes 2023", f: (x) => x["puentes_destruidos_2022-23"], ver: (v) => num(v), ayuda: "Puentes destruidos en 2022-23"},
  {t: "Km de vía 2017", f: (x) => x["km_via_destruidos_2016-17"], ver: (v) => num(v, 1), ayuda: "Km de vía destruidos en 2016-17"},
  {t: "Km de vía 2023", f: (x) => x["km_via_destruidos_2022-23"], ver: (v) => num(v, 1), ayuda: "Km de vía destruidos en 2022-23"},
  {t: "Temporadas con destrucción", f: (x) => x.temporadas_con_destruccion, ver: (v) => `${v} de 8`,
   ayuda: "Temporadas completas (2016-17 a 2023-24) con destrucción vial"},
  {t: "UBIGEO", f: (x) => x.ubigeo},
];

function listaReincidentes() {
  const patron = sinAcentos(estado.busqueda.trim()).toUpperCase();
  let lista = C.zonaReinc;
  if (patron) {
    lista = lista.filter((f) => sinAcentos(f.distrito).includes(patron) || sinAcentos(f.provincia).includes(patron));
  }
  return ordenarFilas(lista, COLUMNAS_LISTA, estado.orden);
}

function dibujarTablaReincidentes() {
  const lista = listaReincidentes();
  $("reinc-tabla").innerHTML = tablaHtml(COLUMNAS_LISTA, lista, estado.orden);
  $("reinc-conteo").textContent = `${num(lista.length)} de ${num(C.zonaReinc.length)} distritos`;
}

function dibujarReincidentes() {
  const c = C, {departamento, indicador} = estado, k = D.kpis.reincidentes;
  $("reinc-resumen").innerHTML = departamento === null
    ? `<strong>${num(k.distritos)} distritos</strong> perdieron puentes o vías en los dos Niños costeros. Juntos suman `
      + `<strong>${num(k.puentes_destruidos_en_ambos)} puentes destruidos</strong>, el `
      + `${num(k.pct_de_los_puentes_destruidos_en_ambos_ninos, 1)} % de los destruidos en los dos eventos.`
    : `En ${esc(c.zona)}, <strong>${num(c.zonaReinc.length)} distritos</strong> perdieron puentes o vías en los dos Niños `
      + `costeros. Juntos suman <strong>${num(suma(c.zonaReinc, "puentes_destruidos_ambos"))} puentes destruidos</strong>.`;
  const vacio = !c.zonaReinc.length;
  $("reinc-vacio").hidden = !vacio;
  $("reinc-contenido").hidden = vacio;
  if (vacio) return;

  const valores = new Map();
  for (const f of D.distritos) {
    if (!c.setReinc.has(f.ubigeo) || !FOCO.includes(f.temporada)) continue;
    const v = valores.get(f.ubigeo) ?? {"2016-17": 0, "2022-23": 0};
    v[f.temporada] += f[indicador] ?? 0;
    valores.set(f.ubigeo, v);
  }
  const top = c.zonaReinc.map((f) => {
    const v = valores.get(f.ubigeo) ?? {"2016-17": 0, "2022-23": 0};
    return {...v, ubigeo: f.ubigeo, total: limpio(v["2016-17"] + v["2022-23"]),
            etiqueta: `${titulo(f.distrito)} (${depto(f.departamento)})`};
  }).sort((a, b) => b.total - a.total || ordenar(a.ubigeo, b.ubigeo)).slice(0, 15).filter((f) => f.total > 0);
  $("h-top").textContent = `Los ${top.length} reincidentes con más ${c.etiquetaInd.toLowerCase()}`;
  const grafico = $("g-top");
  grafico.hidden = !top.length;
  if (top.length) figuraTopReincidentes("g-top", top, indicador);
  dibujarTablaReincidentes();
}

// --- Pestaña: emergencia 2026 -------------------------------------------------

const VIAL = {destruccion: "Destrucción", afectacion: "Solo afectación", ninguno: "Sin daño registrado"};
const GRAVEDAD = {[VIAL.destruccion]: 0, [VIAL.afectacion]: 1, [VIAL.ninguno]: 2};
const [T_2017, T_2023] = FOCO;
const destruyo = (f, t) => f[t] === VIAL.destruccion;
const tuvoDano = (f, t) => f[t] !== VIAL.ninguno;

/** Cada grupo de la lista corresponde a una tarjeta, para que las dos cuentas coincidan. */
const GRUPOS_DECRETO = new Map([
  ["todos", {t: "Todos los declarados", f: () => true}],
  ["2017", {t: "Con destrucción vial en el Niño 2017", f: (f) => destruyo(f, T_2017)}],
  ["2023", {t: "Con destrucción vial en el Niño 2023", f: (f) => destruyo(f, T_2023)}],
  ["ambos", {t: "Con destrucción vial en ambos Niños", f: (f) => destruyo(f, T_2017) && destruyo(f, T_2023)}],
  ["ninguno", {t: "Sin destrucción vial en ninguno", f: (f) => !destruyo(f, T_2017) && !destruyo(f, T_2023)}],
]);

const COLUMNAS_DECRETO = [
  {t: "Distrito", f: (x) => titulo(x.distrito)},
  {t: "Provincia", f: (x) => titulo(x.provincia)},
  {t: "Departamento", f: (x) => depto(x.departamento)},
  {t: "Niño 2017", f: (x) => x[T_2017], clave: (x) => GRAVEDAD[x[T_2017]], ayuda: "Daño vial registrado en la temporada 2016-17"},
  {t: "Niño 2023", f: (x) => x[T_2023], clave: (x) => GRAVEDAD[x[T_2023]], ayuda: "Daño vial registrado en la temporada 2022-23"},
  {t: "UBIGEO", f: (x) => x.ubigeo ?? ""},
  {t: "Nº en el Anexo", f: (x) => x.numero_anexo, ver: (v) => String(v)},
];

/** Por UBIGEO y no por polígono: Mazamari y Pangoa comparten uno, pero cada uno tiene sus propios registros. */
function cruzarDecreto() {
  const dano = new Map();
  for (const f of D.distritos) {
    if (!FOCO.includes(f.temporada)) continue;
    dano.set(`${f.ubigeo}|${f.temporada}`, f.distritos_con_destruccion > 0 ? VIAL.destruccion : VIAL.afectacion);
  }
  for (const f of D.decreto) for (const t of FOCO) f[t] = dano.get(`${f.ubigeo}|${t}`) ?? VIAL.ninguno;
}

const zonaDecreto = () => (estado.departamento === null ? D.decreto : D.decreto.filter((f) => f.departamento === estado.departamento));

function listaDecreto() {
  const patron = sinAcentos(estado.busquedaDecreto.trim()).toUpperCase();
  const enGrupo = GRUPOS_DECRETO.get(estado.grupoDecreto).f;
  const lista = zonaDecreto().filter((f) => enGrupo(f)
    && (!patron || [f.distrito, f.provincia, f.departamento].some((t) => sinAcentos(t).includes(patron))));
  return ordenarFilas(lista, COLUMNAS_DECRETO, estado.ordenDecreto);
}

function dibujarTablaDecreto() {
  const lista = listaDecreto();
  $("dec-tabla").innerHTML = tablaHtml(COLUMNAS_DECRETO, lista, estado.ordenDecreto);
  $("dec-conteo").textContent = `${num(lista.length)} de ${num(zonaDecreto().length)} distritos`;
}

function dibujarEmergencia() {
  const zona = zonaDecreto(), {departamento} = estado;
  const cuantos = (prueba) => zona.filter(prueba).length;
  const porc = (n, de) => `${num(de ? 100 * n / de : null)} %`;  // sin corte de línea antes del signo
  const donde = departamento === null ? "" : ` en ${C.zona}`;

  $("dec-resumen").innerHTML = `El <strong>Decreto Supremo Nº 149-2026-PCM</strong> (El Peruano, 3 de noviembre de 2026) `
    + `declaró el Estado de Emergencia por 60 días calendario en <strong>${num(D.decreto.length)} distritos</strong>, `
    + `por peligro inminente ante intensas precipitaciones pluviales «asociadas al Fenómeno El Niño 2026-2027»`
    + (departamento === null ? "." : `; <strong>${num(zona.length)}</strong> de ellos están en ${esc(C.zona)}.`);

  const d17 = cuantos(GRUPOS_DECRETO.get("2017").f), d23 = cuantos(GRUPOS_DECRETO.get("2023").f);
  const dAmbos = cuantos(GRUPOS_DECRETO.get("ambos").f), dNinguno = cuantos(GRUPOS_DECRETO.get("ninguno").f);
  $("dec-kpis").innerHTML = [
    tarjeta("Distritos declarados en emergencia", num(zona.length), ""),
    tarjeta("Con destrucción vial en el Niño 2017", num(d17),
            `El ${porc(d17, zona.length)} de los declarados. Con cualquier daño vial: ${num(cuantos((f) => tuvoDano(f, T_2017)))}.`),
    tarjeta("Con destrucción vial en el Niño 2023", num(d23),
            `El ${porc(d23, zona.length)} de los declarados. Con cualquier daño vial: ${num(cuantos((f) => tuvoDano(f, T_2023)))}.`),
    tarjeta("Con destrucción vial en ambos Niños", num(dAmbos),
            `El ${porc(dAmbos, zona.length)} de los declarados. Con cualquier daño vial en ambos: `
            + `${num(cuantos((f) => tuvoDano(f, T_2017) && tuvoDano(f, T_2023)))}.`),
  ].join("");

  const grupo = (t) => C.zonaDistritos.filter((f) => f.temporada === t && f.distritos_con_destruccion > 0).length;
  const partes = [[d17, grupo(T_2017), "del Niño 2017"], [d23, grupo(T_2023), "del Niño 2023"], [dAmbos, C.zonaReinc.length, "de ambos"]]
    .filter(([, de]) => de > 0)
    .map(([n, de, nombre]) => `el <strong>${porc(n, de)}</strong> de los ${nombre} (${num(n)} de ${num(de)})`);
  const cobertura = partes.length
    ? ` De todos los distritos con destrucción vial${esc(donde)}, el decreto incluye `
      + `${partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0]}.`
    : "";
  $("dec-lectura").innerHTML = `De los declarados${esc(donde)}, tuvieron destrucción vial solo en el Niño 2017: <strong>${num(d17 - dAmbos)}</strong>; `
    + `solo en el Niño 2023: <strong>${num(d23 - dAmbos)}</strong>; en ambos: <strong>${num(dAmbos)}</strong>; `
    + `en ninguno: <strong>${num(dNinguno)}</strong>.${cobertura}`;

  $("dec-grupo").innerHTML = [...GRUPOS_DECRETO].map(([clave, g]) =>
    `<option value="${clave}"${clave === estado.grupoDecreto ? " selected" : ""}>${esc(g.t)} (${num(cuantos(g.f))})</option>`).join("");
  dibujarTablaDecreto();
}

// --- Pestaña: hallazgos (no dependen de los filtros) --------------------------

function dibujarHallazgos() {
  const k = D.kpis, kr = k.reincidentes;
  const f17 = k.temporadas_foco["2016-17"], f23 = k.temporadas_foco["2022-23"], med = k.mediana_normal;
  const segundo = (temporada, columna) => {
    const f = D.deptos.filter((x) => x.temporada === temporada).sort((a, b) => b[columna] - a[columna])[1];
    return `${depto(f.departamento)} (${num(f[columna])})`;
  };
  const lluvias = Object.fromEntries(D.peligros.filter((f) => f.grupo_peligro === "Lluvias").map((f) => [f.temporada, f.puentes_destruidos]));
  const top4 = [...D.reincidentes].sort((a, b) => b.puentes_destruidos_ambos - a.puentes_destruidos_ambos).slice(0, 4);
  const celda = (f, col) => `${num(f[col])} (${veces(f[col] / med[col])})`;
  const totalPuentes = f17.puentes_destruidos + f23.puentes_destruidos;

  $("p-hallazgos").innerHTML = `
    <article class="hallazgo">
      <h3>1. Un Niño costero destruye entre 3 y 4 veces más puentes que una temporada de lluvias normal</h3>
      <div class="tabla-caja" tabindex="0" role="region" aria-label="Comparación con una temporada normal"><table>
        <thead><tr><th>Temporada (diciembre a mayo)</th><th class="n">Puentes destruidos</th>
          <th class="n">Km de carretera destruidos</th><th class="n">Distritos con destrucción vial</th></tr></thead>
        <tbody>
          <tr><td>Mediana de las 4 temporadas normales</td><td class="n">${num(med.puentes_destruidos, 1)}</td>
            <td class="n">${num(med.carretera_destruida_km)}</td><td class="n">${num(med.distritos_con_destruccion)}</td></tr>
          <tr><td>2016-17 · Niño Costero 2017</td><td class="n">${celda(f17, "puentes_destruidos")}</td>
            <td class="n">${celda(f17, "carretera_destruida_km")}</td><td class="n">${celda(f17, "distritos_con_destruccion")}</td></tr>
          <tr><td>2022-23 · Niño Costero 2023</td><td class="n">${celda(f23, "puentes_destruidos")}</td>
            <td class="n">${celda(f23, "carretera_destruida_km")}</td><td class="n">${celda(f23, "distritos_con_destruccion")}</td></tr>
        </tbody>
      </table></div>
    </article>
    <article class="hallazgo">
      <h3>2. El daño en carreteras se concentra en la costa norte; el daño en puentes, no</h3>
      <ul>
        <li>Tumbes, Piura, Lambayeque y La Libertad suman el <strong>${num(f17.pct_costa_norte_km_via_destruidos)} % (2017)
          y el ${num(f23.pct_costa_norte_km_via_destruidos)} % (2023) de los km de vía destruidos</strong>, pero solo el
          <strong>${num(f17.pct_costa_norte_puentes_destruidos)} % y el ${num(f23.pct_costa_norte_puentes_destruidos)} %
          de los puentes destruidos</strong>.</li>
        <li>Más puentes destruidos: ${depto(f17.top_departamento_puentes.departamento)}
          (${num(f17.top_departamento_puentes.puentes_destruidos)}) y ${segundo("2016-17", "puentes_destruidos")}
          en 2017; ${depto(f23.top_departamento_puentes.departamento)}
          (${num(f23.top_departamento_puentes.puentes_destruidos)}) y ${segundo("2022-23", "puentes_destruidos")} en 2023.</li>
        <li>El daño está disperso: los 10 distritos más golpeados reúnen apenas el
          ${num(f17.pct_top10_distritos_puentes_destruidos)} % y el ${num(f23.pct_top10_distritos_puentes_destruidos)} %
          de los puentes destruidos de cada temporada.</li>
      </ul>
    </article>
    <article class="hallazgo">
      <h3>3. ${num(kr.distritos)} distritos perdieron infraestructura vial en los dos Niños</h3>
      <ul>
        <li>Concentran el <strong>${num(kr.pct_de_los_puentes_destruidos_en_ambos_ninos)} % de los puentes destruidos</strong>
          en los dos eventos (${num(kr.puentes_destruidos_en_ambos)} de ${num(totalPuentes)}).</li>
        <li>Más reincidentes: ${Object.entries(kr.por_departamento).map(([d, n]) => `${depto(d)} (${num(n)})`).join(", ")}.</li>
        <li>Más puentes perdidos sumando los dos eventos:
          ${top4.map((f) => `${titulo(f.distrito)} (${depto(f.departamento)}, ${num(f.puentes_destruidos_ambos)})`).join(", ")}.</li>
      </ul>
    </article>
    <article class="hallazgo">
      <h3>4. Cada Niño golpeó de forma distinta</h3>
      <ul>
        <li>El de 2017 destruyó tres veces más km de vía que el de 2023: <strong>${num(f17.km_via_destruidos)} km</strong> frente a
          ${num(f23.km_via_destruidos)}.</li>
        <li>El de 2023 destruyó más puentes: <strong>${num(f23.puentes_destruidos)}</strong> frente a ${num(f17.puentes_destruidos)}.</li>
        <li>En ambos, la mayor parte del daño se registró como «lluvia intensa»: ${num(lluvias["2016-17"])} de
          ${num(f17.puentes_destruidos)} puentes en 2017 (${num(lluvias["2016-17"] / f17.puentes_destruidos * 100)} %) y
          ${num(lluvias["2022-23"])} de ${num(f23.puentes_destruidos)} en 2023
          (${num(lluvias["2022-23"] / f23.puentes_destruidos * 100)} %).</li>
      </ul>
    </article>`;
}

// --- Pestaña: metodología ----------------------------------------------------

function dibujarMetodologia() {
  $("nota-descarga").textContent = `Distritos con daño vial en ${C.nombreSeleccion}, en ${C.zona}: una fila por distrito y temporada.`;
}

// --- Descargas ---------------------------------------------------------------

function descargarCsv(nombre, encabezado, filasCsv) {
  const celda = (v) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = "﻿" + [encabezado, ...filasCsv].map((f) => f.map(celda).join(",")).join("\n") + "\n";
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([texto], {type: "text/csv;charset=utf-8"}));
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

// --- Interacción -------------------------------------------------------------

const DIBUJOS = {mapa: dibujarMapa, temporadas: dibujarTemporadas, departamentos: dibujarDepartamentos,
                 reincidentes: dibujarReincidentes, hallazgos: dibujarHallazgos, emergencia: dibujarEmergencia,
                 metodologia: dibujarMetodologia};

/** Solo se dibuja la pestaña visible: Plotly necesita saber el ancho real del gráfico. */
function dibujarPestana() {
  const p = estado.pestana;
  if (sucias.delete(p)) DIBUJOS[p]();
  else $(`p-${p}`).querySelectorAll(".js-plotly-plot").forEach((g) => Plotly.Plots.resize(g));
}

function actualizar() {
  C = calcular();
  dibujarKpis();
  for (const p of Object.keys(DIBUJOS)) if (p !== "hallazgos" || !$("p-hallazgos").childElementCount) sucias.add(p);
  dibujarPestana();
}

function iniciarPestanas() {
  const pestanas = [...document.querySelectorAll('[role="tab"]')];
  const elegir = (tab, foco) => {
    for (const t of pestanas) {
      const activa = t === tab;
      t.setAttribute("aria-selected", String(activa));
      t.tabIndex = activa ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !activa;
    }
    if (foco) tab.focus();
    estado.pestana = tab.id.slice(2);
    dibujarPestana();
  };
  pestanas.forEach((tab, i) => {
    tab.addEventListener("click", () => elegir(tab, false));
    tab.addEventListener("keydown", (e) => {
      const destino = {ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanas.length - 1}[e.key];
      if (destino === undefined) return;
      e.preventDefault();
      elegir(pestanas[(destino + pestanas.length) % pestanas.length], true);
    });
  });
}

function iniciarBuscador() {
  const entrada = $("f-distrito"), lista = $("f-distrito-lista"), limpiar = $("f-distrito-limpiar");
  let opciones = [], activa = -1;

  const cerrar = () => {
    lista.hidden = true;
    entrada.setAttribute("aria-expanded", "false");
    entrada.removeAttribute("aria-activedescendant");
    activa = -1;
  };
  const marcar = (i) => {
    activa = i;
    [...lista.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    if (i >= 0) {
      entrada.setAttribute("aria-activedescendant", `distrito-${i}`);
      lista.children[i].scrollIntoView({block: "nearest"});
    }
  };
  const elegir = (fila) => {
    estado.distrito = fila ? fila.ubigeo : null;
    entrada.value = fila ? fila.nombre : "";
    limpiar.hidden = !fila;
    cerrar();
    sucias.add("mapa");
    if (estado.pestana === "mapa") dibujarPestana();
    else document.querySelector("#t-mapa").click();
  };
  const abrir = () => {
    const clave = sinAcentos(entrada.value.trim()).toLowerCase();
    const zona = D.catalogo.filter((f) => estado.departamento === null || f.departamento === estado.departamento);
    opciones = zona.filter((f) => f.clave.includes(clave)).slice(0, 60);
    lista.innerHTML = opciones.length
      ? opciones.map((f, i) => `<li id="distrito-${i}" role="option" aria-selected="false">${esc(f.nombre)}</li>`).join("")
      : `<li class="vacio">Sin resultados</li>`;
    lista.hidden = false;
    entrada.setAttribute("aria-expanded", "true");
    activa = -1;
  };

  entrada.addEventListener("focus", () => { entrada.select(); abrir(); });
  entrada.addEventListener("input", abrir);
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return cerrar();
    if (lista.hidden && e.key === "ArrowDown") return abrir();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (opciones.length) marcar((activa + (e.key === "ArrowDown" ? 1 : -1) + opciones.length) % opciones.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const fila = opciones[activa >= 0 ? activa : 0];
      if (fila && !lista.hidden) elegir(fila);
    }
  });
  entrada.addEventListener("blur", () => {
    cerrar();
    if (!entrada.value.trim() && estado.distrito) return elegir(null);
    entrada.value = estado.distrito ? D.porUbigeo.get(estado.distrito).nombre : "";
  });
  // mousedown: ocurre antes de que la caja pierda el foco y se cierre la lista
  lista.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const li = e.target.closest("li[id]");
    if (li) elegir(opciones[Number(li.id.split("-")[1])]);
  });
  limpiar.addEventListener("click", () => elegir(null));
  return {quitar: () => { estado.distrito = null; entrada.value = ""; limpiar.hidden = true; }};
}

/** En pantallas angostas los filtros empiezan plegados, para llegar antes a los datos. */
function iniciarPlegable() {
  const plegable = $("filtros-plegable"), angosta = window.matchMedia("(max-width: 900px)");
  plegable.open = !angosta.matches;
  angosta.addEventListener("change", (e) => { plegable.open = !e.matches; });
  plegable.addEventListener("toggle", () => { if (!angosta.matches) plegable.open = true; });
}

function iniciarFiltros() {
  $("f-temporada").innerHTML = [...D.opciones].map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join("");
  $("f-indicador").innerHTML = Object.entries(INDICADORES).map(([k, v]) => `<option value="${k}">${esc(v[0])}</option>`).join("");
  const deptos = [...new Set(D.distritos.map((f) => f.departamento))].sort((a, b) => ordenar(depto(a), depto(b)));
  $("f-departamento").innerHTML = `<option value="">Todo el Perú</option>`
    + deptos.map((d) => `<option value="${esc(d)}">${esc(depto(d))}</option>`).join("");

  const buscador = iniciarBuscador();
  $("f-temporada").addEventListener("change", (e) => { estado.eleccion = e.target.value; actualizar(); });
  $("f-indicador").addEventListener("change", (e) => { estado.indicador = e.target.value; actualizar(); });
  $("f-departamento").addEventListener("change", (e) => {
    estado.departamento = e.target.value || null;
    const elegido = estado.distrito && D.porUbigeo.get(estado.distrito);
    if (elegido && estado.departamento && elegido.departamento !== estado.departamento) buscador.quitar();
    actualizar();
  });
  document.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener("change", (e) => {
    estado.modo = e.target.value;
    dibujarMapa();
  }));
  $("reinc-busqueda").addEventListener("input", (e) => { estado.busqueda = e.target.value; dibujarTablaReincidentes(); });
  activarOrden("reinc-tabla", COLUMNAS_LISTA, "orden", dibujarTablaReincidentes);
  $("reinc-descargar").addEventListener("click", () => descargarCsv(
    "distritos_reincidentes.csv", COLUMNAS_LISTA.map((c) => c.t), listaReincidentes().map((x) => COLUMNAS_LISTA.map((c) => c.f(x)))));
  $("dec-busqueda").addEventListener("input", (e) => { estado.busquedaDecreto = e.target.value; dibujarTablaDecreto(); });
  $("dec-grupo").addEventListener("change", (e) => { estado.grupoDecreto = e.target.value; dibujarTablaDecreto(); });
  activarOrden("dec-tabla", COLUMNAS_DECRETO, "ordenDecreto", dibujarTablaDecreto);
  $("dec-descargar").addEventListener("click", () => descargarCsv(
    "distritos_emergencia_ds_149_2026.csv", COLUMNAS_DECRETO.map((c) => c.t), listaDecreto().map((x) => COLUMNAS_DECRETO.map((c) => c.f(x)))));
  $("sel-descargar").addEventListener("click", () => descargarCsv(
    "dano_vial_por_distrito.csv", D.columnasDistritos, C.sel.map((f) => D.columnasDistritos.map((c) => f[c]))));
}

async function iniciar() {
  iniciarPlegable();
  $("enlace-repo").href = REPO;
  $("enlace-fuentes").href = `${REPO}/blob/main/datos/fuentes.csv`;
  const codigo = $("enlace-codigo");
  codigo.href = REPO;
  codigo.textContent = REPO.replace("https://", "");
  try {
    await cargar();
    iniciarFiltros();
    iniciarPestanas();
    $("aviso").hidden = true;
    $("tablero").hidden = false;
    actualizar();
  } catch (error) {
    console.error(error);
    $("aviso").textContent = "No se pudieron cargar los datos. Recarga la página para intentarlo de nuevo.";
  }
}

iniciar();
