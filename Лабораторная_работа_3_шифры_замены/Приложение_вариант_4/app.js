/* Интерфейс приложения: поля ввода → Ciphers (ciphers.js) → результат,
   таблица шифра и гистограммы частот букв. */
(function () {
  "use strict";

  const C = window.Ciphers;
  const $ = (id) => document.getElementById(id);

  // Тот же текст, что в primer_de.txt.
  const SAMPLE = `Bei einer Substitution wird jeder Buchstabe des Klartextes durch einen anderen Buchstaben ersetzt. Das bekannteste Beispiel ist die Caesar-Verschlüsselung: Julius Caesar verschob jeden Buchstaben seiner Briefe um drei Stellen im Alphabet. Aus einem A wurde ein D, aus einem B ein E. Weil es nur so viele Schlüssel wie Buchstaben gibt, kann man eine solche Nachricht durch einfaches Ausprobieren aller Verschiebungen knacken.

Sicherer ist die Playfair-Verschlüsselung, die Charles Wheatstone im Jahr 1854 erfand. Sie ersetzt nicht einzelne Buchstaben, sondern Buchstabenpaare. Dazu schreibt man ein Schlüsselwort ohne doppelte Buchstaben in eine Tabelle und füllt sie mit den übrigen Buchstaben des Alphabets auf. Für das deutsche Alphabet mit Ä, Ö, Ü und ß passt eine Tabelle mit fünf Zeilen und sechs Spalten genau.

Trotzdem lassen sich beide Verfahren mit einer Häufigkeitsanalyse angreifen: Bei Caesar zählt man einzelne Buchstaben, bei Playfair die Buchstabenpaare. Im Deutschen ist das E mit Abstand der häufigste Buchstabe.`;

  const ui = {
    alphabet: $("alphabet"),
    source: $("source"), sourceMeta: $("source-meta"), sourceNote: $("source-note"),
    openBtn: $("open-btn"), fileInput: $("file-input"), sampleBtn: $("sample-btn"), clearBtn: $("clear-btn"),
    mCaesar: $("m-caesar"), mPlayfair: $("m-playfair"),
    caesarParams: $("caesar-params"), playfairParams: $("playfair-params"),
    shift: $("shift"), keyword: $("keyword"), keywordInfo: $("keyword-info"),
    methodInfo: $("method-info"), paramError: $("param-error"),
    encryptBtn: $("encrypt-btn"), decryptBtn: $("decrypt-btn"),
    result: $("result"), resultTitle: $("result-title"), resultError: $("result-error"), toast: $("toast"),
    useBtn: $("use-btn"), copyBtn: $("copy-btn"), saveBtn: $("save-btn"),
    stLetters: $("st-letters"), stEnc: $("st-enc"), stDec: $("st-dec"), stCheck: $("st-check"),
    viz: $("viz"), vizFlow: $("viz-flow"),
    freqSummary: $("freq-summary"), charts: $("charts"), chartIn: $("chart-in"), chartOut: $("chart-out"),
    capIn: $("cap-in"), capOut: $("cap-out"), thIn: $("th-in"), thOut: $("th-out"),
    tooltip: $("tooltip"), freqBody: $("freq-body"),
  };

  const nf = new Intl.NumberFormat("ru-RU");
  const pct = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const msFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  const RULES = {
    row: "одна строка — буквы справа",
    col: "один столбец — буквы снизу",
    rect: "прямоугольник — другие углы",
  };
  const SHOWN_PAIRS = 12;
  const FLOW_PAIRS = 40;
  const FLOW_CHARS = 140;

  let state = null;      // результат последней операции
  let sourceName = "";   // имя открытого файла — для имени сохраняемого
  let freq = null;       // данные гистограмм
  let active = null;     // индекс буквы под курсором на гистограмме
  let anchorSvg = null;  // над какой гистограммой показывать подсказку

  const length = (s) => Array.from(s).length;
  const mod = (n) => ((n % C.N) + C.N) % C.N;

  function plural(n, one, few, many) {
    const d = n % 10, h = n % 100;
    if (d === 1 && h !== 11) return one;
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
    return many;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const chip = (kind, text) => el("span", `chip ${kind}`, text);

  // ---------------------------------------------------------------- параметры

  function method() {
    return ui.mPlayfair.checked ? "playfair" : "caesar";
  }

  function cipherParams() {
    if (method() === "playfair") {
      const keyword = ui.keyword.value;
      return { method: "playfair", keyword, table: C.playfairTable(keyword) };
    }
    const raw = ui.shift.value.trim();
    const k = Number(raw);
    if (!raw || !Number.isInteger(k)) throw new Error("Сдвиг k — целое число, например 7");
    return { method: "caesar", k };
  }

  function keyLetters(table) {
    return table.cells.slice(0, table.keyLength).join("");
  }

  function infoLine(p) {
    if (p.method === "playfair") {
      const n = p.table.keyLength;
      return `Таблица 5 × 6: ${n} ${plural(n, "буква", "буквы", "букв")} ключа и ${C.N - n} остальных`;
    }
    const s = mod(p.k);
    if (s === 0) return `k = ${p.k} кратно 30, поэтому текст не изменится`;
    const same = s !== p.k ? ` (то же, что k = ${s})` : "";
    return `k = ${p.k}${same}: A → ${C.LETTERS[s]}, B → ${C.LETTERS[mod(1 + s)]}, …, ß → ${C.LETTERS[mod(29 + s)]}`;
  }

  function updateParams() {
    const playfair = method() === "playfair";
    ui.caesarParams.hidden = playfair;
    ui.playfairParams.hidden = !playfair;

    let p = null, error = "";
    try { p = cipherParams(); } catch (e) { error = e.message; }
    ui.paramError.textContent = error;
    ui.paramError.hidden = !error;
    ui.encryptBtn.disabled = ui.decryptBtn.disabled = Boolean(error);
    ui.keywordInfo.textContent = p && p.method === "playfair" ? `первая строка таблицы: ${keyLetters(p.table)}…` : "";
    ui.methodInfo.hidden = !p;
    if (p) ui.methodInfo.textContent = infoLine(p);
  }

  function updateSource() {
    const text = ui.source.value;
    const n = length(text);
    const { total } = C.letterCounts(text);
    ui.sourceMeta.replaceChildren(
      `${nf.format(n)} ${plural(n, "знак", "знака", "знаков")} · ${nf.format(total)} ` +
      `${plural(total, "буква", "буквы", "букв")} немецкого алфавита`,
      n >= 500 ? chip("ok", "✓ не меньше 500 знаков") : chip("warn", "! нужно не меньше 500 знаков"),
    );
    const foreign = C.foreignLetters(text);
    ui.sourceNote.hidden = !foreign.length;
    if (foreign.length) {
      ui.sourceNote.textContent = `Есть буквы не из немецкого алфавита: ${foreign.slice(0, 8).join(" ")}` +
        `${foreign.length > 8 ? " …" : ""}. Шифр их не меняет (Плейфер — отбрасывает), в частотах они не учитываются.`;
    }
    updateParams();
  }

  // ---------------------------------------------------------------- операции

  let toastTimer = 0;
  function toast(text) {
    ui.toast.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.textContent = ""; }, 5000);
  }

  function showError(text) {
    ui.resultError.textContent = text;
    ui.resultError.hidden = false;
  }

  function clearError() {
    ui.resultError.hidden = true;
    ui.resultError.textContent = "";
  }

  // Среднее время одного запуска: операция повторяется, пока не наберётся ~25 мс.
  function timeIt(fn) {
    let runs = 0, elapsed = 0;
    const start = performance.now();
    do { fn(); runs++; elapsed = performance.now() - start; } while (elapsed < 25 && runs < 5000);
    return { ms: elapsed / runs, runs };
  }

  function formatTime(ms) {
    return ms < 1 ? `${nf.format(Math.max(1, Math.round(ms * 1000)))} мкс` : `${msFormat.format(ms)} мс`;
  }

  const lettersOnly = (text) => C.tableLetters(text).join("");

  function encryptNow() {
    clearError();
    const text = ui.source.value;
    if (!text) return showError("Введите текст или откройте файл .txt");
    let p;
    try { p = cipherParams(); } catch (e) { return showError(e.message); }

    if (p.method === "caesar") {
      const cipher = C.caesarEncrypt(text, p.k);
      return present({
        op: "enc", p, input: text, output: cipher, plain: text,
        enc: timeIt(() => C.caesarEncrypt(text, p.k)),
        dec: timeIt(() => C.caesarDecrypt(cipher, p.k)),
        ok: C.caesarDecrypt(cipher, p.k) === text,
      });
    }
    const cipher = C.playfairEncrypt(text, p.keyword);
    if (!cipher) return showError("В тексте нет букв немецкого алфавита");
    const back = C.playfairDecrypt(cipher, p.keyword);
    present({
      op: "enc", p, input: text, output: cipher, plain: text,
      enc: timeIt(() => C.playfairEncrypt(text, p.keyword)),
      dec: timeIt(() => C.playfairDecrypt(cipher, p.keyword)),
      ok: back.text === lettersOnly(text),
    });
  }

  function decryptNow() {
    clearError();
    const text = ui.source.value;
    if (!text) return showError("Вставьте шифртекст или откройте файл .txt");
    let p;
    try { p = cipherParams(); } catch (e) { return showError(e.message); }

    if (p.method === "caesar") {
      const plain = C.caesarDecrypt(text, p.k);
      return present({
        op: "dec", p, input: text, output: plain, plain,
        enc: timeIt(() => C.caesarEncrypt(plain, p.k)),
        dec: timeIt(() => C.caesarDecrypt(text, p.k)),
        ok: C.caesarEncrypt(plain, p.k) === text,
      });
    }
    let res;
    try { res = C.playfairDecrypt(text, p.keyword); } catch (e) { return showError(e.message); }
    if (!res.raw) return showError("В шифртексте нет букв немецкого алфавита");
    present({
      op: "dec", p, input: text, output: res.text, plain: res.text, raw: res.raw,
      enc: timeIt(() => C.playfairEncrypt(res.text, p.keyword)),
      dec: timeIt(() => C.playfairDecrypt(text, p.keyword)),
      ok: lettersOnly(C.playfairEncrypt(res.text, p.keyword)) === lettersOnly(text),
    });
  }

  function present(r) {
    state = r;
    const enc = r.op === "enc";
    const playfair = r.p.method === "playfair";
    ui.result.value = r.output;
    ui.resultTitle.textContent = enc ? "Шифртекст" : "Расшифрованный текст";

    const a = C.letterCounts(r.input).total;
    const b = C.letterCounts(r.output).total;
    ui.stLetters.textContent = a === b ? nf.format(a) : `${nf.format(a)} → ${nf.format(b)}`;
    ui.stLetters.title = a === b ? "" : enc ? "шифр Плейфера добавил разделители X" : "разделители X убраны";
    ui.stEnc.textContent = formatTime(r.enc.ms);
    ui.stEnc.title = `среднее по ${nf.format(r.enc.runs)} запускам`;
    ui.stDec.textContent = formatTime(r.dec.ms);
    ui.stDec.title = `среднее по ${nf.format(r.dec.runs)} запускам`;
    const okText = enc ? (playfair ? "✓ расшифровка вернула все буквы" : "✓ расшифровка вернула текст") : "✓ повторное шифрование совпало";
    const badText = enc ? "! расшифровка отличается: в тексте есть X, похожий на разделитель" : "! повторное шифрование не совпало";
    ui.stCheck.replaceChildren(r.ok ? chip("ok", okText) : chip("warn", badText));
    if (playfair && !enc) toast("Шифр Плейфера не хранит пробелы и знаки препинания: текст восстановлен заглавными буквами подряд");

    renderViz();
    renderFrequencies();
  }

  // ---------------------------------------------------------- как работает шифр

  const isSoft = (ch) => ch === " " || ch === "\n" || ch === "\t";

  function glyph(ch) {
    if (ch === " ") return "·";
    if (ch === "\n") return "↵";
    if (ch === "\t") return "⇥";
    return ch;
  }

  function th(text, className) {
    return el("th", className, text);
  }

  function figure(caption, content, note) {
    const fig = el("figure", "grid-fig");
    const scroll = el("div", "grid-scroll");
    scroll.append(content);
    fig.append(el("figcaption", "", caption), scroll);
    if (note) fig.append(el("p", "more", note));
    return fig;
  }

  function flowText(label, text) {
    const row = el("div");
    const code = el("code");
    const chars = Array.from(text);
    for (const ch of chars.slice(0, FLOW_CHARS)) code.append(isSoft(ch) ? el("span", "soft", glyph(ch)) : ch);
    if (chars.length > FLOW_CHARS) code.append(el("span", "soft", " …"));
    row.append(el("span", "label", label), code);
    return row;
  }

  function substitutionFigure(k) {
    const s = mod(k);
    const table = el("table", "grid subst");
    const body = table.createTBody();
    const rows = [
      ["x", (i) => th(String(i))],
      ["буква", (i) => el("td", "plain", C.LETTERS[i])],
      ["y", (i) => th(String(mod(i + s)))],
      ["шифр", (i) => el("td", "", C.LETTERS[mod(i + s)])],
    ];
    for (const [label, cell] of rows) {
      const tr = body.insertRow();
      tr.append(th(label, "side"));
      for (let i = 0; i < C.N; i++) tr.append(cell(i));
    }
    return figure(`Таблица замены: y = (x + ${k}) mod 30, x = (y − ${k}) mod 30`, table);
  }

  function matrixFigure(p) {
    const table = el("table", "grid");
    const head = table.createTHead().insertRow();
    head.append(th(""));
    for (let c = 1; c <= C.COLS; c++) head.append(th(String(c)));
    const body = table.createTBody();
    for (let r = 0; r < C.ROWS; r++) {
      const tr = body.insertRow();
      tr.append(th(String(r + 1)));
      for (let c = 0; c < C.COLS; c++) {
        const i = r * C.COLS + c;
        tr.append(el("td", i < p.table.keyLength ? "key-cell" : "", p.table.cells[i]));
      }
    }
    return figure(`Таблица для ключа «${p.keyword.trim()}»: выделены буквы ключа`, table);
  }

  function pairCell(pair, className) {
    const cell = el("td", className);
    cell.append(pair.a);
    cell.append(pair.filler ? el("span", "fill", pair.b) : pair.b);
    return cell;
  }

  function pairsFigure(p, pairs, total) {
    const table = el("table", "pairs");
    const head = table.createTHead().insertRow();
    for (const h of ["Пара", "Правило", "Шифр"]) head.append(th(h));
    const body = table.createTBody();
    for (const pair of pairs.slice(0, SHOWN_PAIRS)) {
      const t = C.transformPair(p.table, pair.a, pair.b, 1);
      const tr = body.insertRow();
      tr.append(pairCell(pair, "pair"), el("td", "rule-name", RULES[t.rule]), el("td", "pair out", t.out));
    }
    const note = total > SHOWN_PAIRS ? `Показаны первые ${SHOWN_PAIRS} пар из ${nf.format(total)}. Красная X — вставленный разделитель.` : "Красная X — вставленный разделитель.";
    return figure("Как шифруются первые пары", table, note);
  }

  function flowPairs(label, pairs, mapOut) {
    const row = el("div");
    const code = el("code");
    pairs.slice(0, FLOW_PAIRS).forEach((pair, i) => {
      if (i) code.append(" ");
      if (mapOut) code.append(mapOut(pair));
      else { code.append(pair.a); code.append(pair.filler ? el("span", "fill", pair.b) : pair.b); }
    });
    if (pairs.length > FLOW_PAIRS) code.append(el("span", "soft", " …"));
    row.append(el("span", "label", label), code);
    return row;
  }

  function renderViz() {
    const r = state;
    const enc = r.op === "enc";
    if (r.p.method === "caesar") {
      ui.viz.replaceChildren(substitutionFigure(r.p.k));
      ui.vizFlow.replaceChildren(
        flowText(enc ? "Начало открытого текста" : "Начало шифртекста", r.input),
        flowText(enc ? "Начало шифртекста" : "Начало расшифровки", r.output),
      );
      return;
    }
    const pairs = C.playfairPairs(r.plain);
    ui.viz.replaceChildren(matrixFigure(r.p), pairsFigure(r.p, pairs, pairs.length));
    ui.vizFlow.replaceChildren(
      flowPairs("Открытый текст парами", pairs),
      flowPairs("Шифртекст парами", pairs, (pair) => C.transformPair(r.p.table, pair.a, pair.b, 1).out),
    );
  }

  // --------------------------------------------------------- гистограммы

  const M = { t: 10, r: 8, b: 24, l: 46 };
  const H = 150;

  function geometry(svg) {
    const W = Math.max(260, Math.floor(svg.parentElement.getBoundingClientRect().width));
    const iw = W - M.l - M.r;
    return { W, ih: H - M.t - M.b, band: iw / C.N };
  }

  function niceTicks(max) {
    const raw = Math.max(1, max) / 4;
    const p = 10 ** Math.floor(Math.log10(raw));
    const step = Math.max(1, [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw));
    const top = Math.max(step, Math.ceil(max / step) * step);
    const ticks = [];
    for (let v = 0; v <= top; v += step) ticks.push(v);
    return ticks;
  }

  // Столбик со скруглёнными верхними углами (4 px) и прямым основанием.
  function barPath(x, top, w, h) {
    const r = Math.min(4, w / 2, h);
    const f = (v) => Math.round(v * 10) / 10;
    return `M${f(x)},${f(top + h)}V${f(top + r)}Q${f(x)},${f(top)} ${f(x + r)},${f(top)}` +
      `H${f(x + w - r)}Q${f(x + w)},${f(top)} ${f(x + w)},${f(top + r)}V${f(top + h)}Z`;
  }

  function drawChart(svg, counts) {
    const { W, ih, band } = geometry(svg);
    const ticks = niceTicks(freq.max);
    const top = ticks[ticks.length - 1];
    const y = (v) => Math.round((M.t + ih - (v / top) * ih) * 10) / 10;
    const bw = Math.max(3, Math.min(24, band - 3));
    const parts = [];
    for (const t of ticks.slice(1)) parts.push(`<line class="gl" x1="${M.l}" x2="${W - M.r}" y1="${y(t)}" y2="${y(t)}"/>`);
    for (const t of ticks) parts.push(`<text class="yl" x="${M.l - 6}" y="${y(t)}" dy="0.32em">${nf.format(t)}</text>`);
    if (active !== null) {
      parts.push(`<rect class="wash" x="${M.l + active * band}" y="${M.t}" width="${band}" height="${ih}" rx="3"/>`);
    }
    counts.forEach((v, i) => {
      const x = M.l + i * band + (band - bw) / 2;
      if (v > 0) parts.push(`<path class="bar" d="${barPath(x, y(v), bw, y(0) - y(v))}"/>`);
      parts.push(`<text class="xl${i === active ? " on" : ""}" x="${M.l + (i + 0.5) * band}" y="${H - 7}">${C.LETTERS[i]}</text>`);
    });
    parts.push(`<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}"/>`);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.innerHTML = parts.join("");
  }

  function drawCharts() {
    if (!freq) return;
    drawChart(ui.chartIn, freq.a.counts);
    drawChart(ui.chartOut, freq.b.counts);
    placeTooltip();
  }

  function tooltipRow(count, total, label) {
    const row = el("div", "row");
    row.append(el("b", "", nf.format(count)), el("span", "", `${pct.format(total ? (count / total) * 100 : 0)} % · ${label}`));
    return row;
  }

  function placeTooltip() {
    const tip = ui.tooltip;
    if (active === null || !freq) { tip.hidden = true; return; }
    tip.replaceChildren(
      el("div", "letter", C.LETTERS[active]),
      tooltipRow(freq.a.counts[active], freq.a.total, freq.labels[0]),
      tooltipRow(freq.b.counts[active], freq.b.total, freq.labels[1]),
    );
    tip.hidden = false;
    const svg = anchorSvg || ui.chartIn;
    const box = ui.charts.getBoundingClientRect();
    const sb = svg.getBoundingClientRect();
    const cx = sb.left - box.left + M.l + (active + 0.5) * geometry(svg).band;
    const w = tip.offsetWidth;
    let left = cx + 14;
    if (left + w > box.width) left = cx - 14 - w;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${sb.top - box.top + 2}px`;
  }

  function setActive(i, svg) {
    if (svg) anchorSvg = svg;
    if (i === active) { placeTooltip(); return; }
    active = i;
    drawCharts();
  }

  function bandAt(svg, clientX) {
    const { band } = geometry(svg);
    const x = clientX - svg.getBoundingClientRect().left - M.l;
    if (x < 0 || x >= band * C.N) return null;
    return Math.floor(x / band);
  }

  for (const svg of [ui.chartIn, ui.chartOut]) {
    svg.addEventListener("pointermove", (e) => setActive(bandAt(svg, e.clientX), svg));
    svg.addEventListener("pointerdown", (e) => setActive(bandAt(svg, e.clientX), svg));
    svg.addEventListener("pointerleave", () => setActive(null));
    svg.addEventListener("focus", () => setActive(active === null ? 0 : active, svg));
    svg.addEventListener("blur", () => setActive(null));
    svg.addEventListener("keydown", (e) => {
      const last = C.N - 1;
      const cur = active === null ? 0 : active;
      const next = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: last }[e.key];
      if (next !== undefined) {
        e.preventDefault();
        setActive(Math.min(last, Math.max(0, next)), svg);
      } else if (e.key === "Escape") {
        setActive(null);
      }
    });
  }

  function topLetter(counts) {
    let best = 0;
    counts.forEach((v, i) => { if (v > counts[best]) best = i; });
    return best;
  }

  function renderFrequencies() {
    const enc = state.op === "enc";
    const a = C.letterCounts(state.input);
    const b = C.letterCounts(state.output);
    const labels = enc ? ["Открытый текст", "Шифртекст"] : ["Шифртекст", "Расшифрованный текст"];
    freq = { a, b, labels, max: Math.max(1, ...a.counts, ...b.counts) };
    ui.capIn.textContent = labels[0];
    ui.capOut.textContent = labels[1];
    ui.thIn.textContent = labels[0];
    ui.thOut.textContent = labels[1];

    const parts = [];
    if (a.total && b.total) {
      const ta = topLetter(a.counts), tb = topLetter(b.counts);
      parts.push(`Самая частая буква: ${C.LETTERS[ta]} (${pct.format((a.counts[ta] / a.total) * 100)} %) → ` +
        `${C.LETTERS[tb]} (${pct.format((b.counts[tb] / b.total) * 100)} %).`);
    }
    if (state.p.method === "caesar") {
      const s = mod(enc ? state.p.k : -state.p.k);
      const shifted = a.counts.every((v, i) => b.counts[mod(i + s)] === v);
      ui.freqSummary.replaceChildren(
        shifted ? chip("ok", `✓ та же гистограмма, сдвинутая на ${mod(state.p.k)}`) : chip("warn", "! гистограммы не совпадают со сдвигом"),
        `${parts.join(" ")} Сдвиг не меняет частоты, а только переносит их на другие буквы, поэтому шифр легко вскрыть частотным анализом.`,
      );
    } else {
      ui.freqSummary.replaceChildren(
        `${parts.join(" ")} Плейфер шифрует пары, поэтому частоты отдельных букв перемешиваются. Для вскрытия считают частоты пар.`,
      );
    }

    ui.freqBody.replaceChildren(...Array.from(C.LETTERS).map((ch, i) => {
      const tr = el("tr");
      for (const text of [ch, nf.format(a.counts[i]), nf.format(b.counts[i])]) tr.append(el("td", "", text));
      return tr;
    }));

    active = null;
    drawCharts();
  }

  let lastWidth = 0, frame = 0;
  new ResizeObserver(() => {
    const w = ui.charts.getBoundingClientRect().width;
    if (Math.abs(w - lastWidth) < 1) return;
    lastWidth = w;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(drawCharts);
  }).observe(ui.charts);

  // ------------------------------------------------------ файлы и буфер

  function readFile(file, encoding) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, encoding);
    });
  }

  ui.openBtn.addEventListener("click", () => ui.fileInput.click());
  ui.fileInput.addEventListener("change", async () => {
    const file = ui.fileInput.files && ui.fileInput.files[0];
    ui.fileInput.value = "";
    if (!file) return;
    try {
      let text = await readFile(file, "utf-8");
      if (text.includes("\uFFFD")) text = await readFile(file, "windows-1252"); // старые файлы Windows
      ui.source.value = text.replace(/\r\n?/g, "\n");
      sourceName = file.name;
      clearError();
      updateSource();
      toast(`Открыт файл «${file.name}»`);
    } catch {
      showError("Не удалось прочитать файл. Нужен обычный текстовый файл .txt");
    }
  });

  ui.sampleBtn.addEventListener("click", () => {
    ui.source.value = SAMPLE;
    sourceName = "primer_de.txt";
    clearError();
    updateSource();
    toast("Загружен пример текста на немецком");
  });

  ui.clearBtn.addEventListener("click", () => {
    ui.source.value = "";
    sourceName = "";
    updateSource();
    ui.source.focus();
  });

  ui.useBtn.addEventListener("click", () => {
    if (!ui.result.value) return;
    const wasEnc = state && state.op === "enc";
    const base = (sourceName || "tekst").replace(/\.txt$/i, "");
    ui.source.value = ui.result.value;
    sourceName = `${base}_${wasEnc ? "shifr" : "rasshifrovka"}.txt`;
    clearError();
    updateSource();
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ui.source.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
    toast(wasEnc ? "Шифртекст перенесён в исходный текст. Нажмите «Расшифровать»" : "Текст перенесён в исходный текст");
  });

  ui.copyBtn.addEventListener("click", () => {
    const text = ui.result.value;
    if (!text) return;
    const fallback = () => {
      ui.result.focus();
      ui.result.select();
      toast("Текст выделен. Скопируйте его сочетанием Ctrl+C");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast("Скопировано в буфер обмена"), fallback);
    } else {
      fallback();
    }
  });

  // Сохранение: в окне Claude — через возможность downloads, в обычном браузере — ссылкой на Blob.
  const inViewer = Boolean(window.claude && typeof window.claude.use === "function");
  let downloads = null;
  if (inViewer) {
    ui.saveBtn.hidden = true;
    window.claude.use("downloads").then((d) => { downloads = d; ui.saveBtn.hidden = !d; }, () => {});
  }

  ui.saveBtn.addEventListener("click", async () => {
    const data = ui.result.value;
    if (!data) return;
    // Латиница в имени: с кириллицей некоторые системы сохраняют файл как «download».
    const base = (sourceName || "tekst").replace(/\.txt$/i, "");
    const filename = `${base}_${state && state.op === "dec" ? "rasshifrovka" : "shifr"}.txt`;
    if (downloads) {
      try {
        await downloads.save({ filename, data });
        toast(`Сохранено: ${filename}`);
      } catch (e) {
        const code = e && e.code;
        if (code === "declined") return;
        toast(code === "rate_limited" ? "Окно сохранения уже открыто" : "Сохранить здесь не получилось. Скопируйте текст кнопкой «Копировать»");
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([data], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`Сохранено: ${filename}`);
  });

  // ------------------------------------------------------------ запуск

  ui.source.addEventListener("input", updateSource);
  for (const input of [ui.shift, ui.keyword]) input.addEventListener("input", updateParams);
  for (const input of [ui.mCaesar, ui.mPlayfair]) input.addEventListener("change", updateParams);
  ui.encryptBtn.addEventListener("click", encryptNow);
  ui.decryptBtn.addEventListener("click", decryptNow);

  ui.alphabet.replaceChildren(
    el("span", "label", "Алфавит, N = 30"),
    ...Array.from(C.LETTERS).map((ch) => el("span", "ÄÖÜß".includes(ch) ? "extra" : "", ch)),
  );

  if (!ui.source.value) {
    ui.source.value = SAMPLE;
    sourceName = "primer_de.txt";
  }
  updateSource();
  if (!ui.encryptBtn.disabled) encryptNow();
})();
