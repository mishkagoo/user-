/* Интерфейс приложения: поля ввода → Ciphers (ciphers.js) → результат,
   таблица текущего блока и гистограммы частот букв. */
(function () {
  "use strict";

  const C = window.Ciphers;
  const $ = (id) => document.getElementById(id);

  // Тот же текст, что в primer_de.txt.
  const SAMPLE = `Die Kryptographie beschäftigt sich mit der Verschlüsselung von Nachrichten. Schon die Spartaner benutzten die Skytale: Man wickelte einen Lederstreifen um einen Holzstab und schrieb den Text in Längsrichtung darauf. Ohne einen Stab mit genau demselben Durchmesser konnte niemand die Nachricht lesen. Das ist ein frühes Beispiel für eine Transposition, denn die Buchstaben bleiben unverändert, nur ihre Reihenfolge ändert sich.

Bei der Routentransposition schreibt man den Klartext in eine Tabelle und liest ihn auf einem anderen Weg wieder aus, zum Beispiel in Schlangenlinien. Die Größe der Tabelle bildet zusammen mit dem Weg den Schlüssel. Bei der mehrfachen Transposition werden erst die Spalten und danach die Zeilen nach zwei Schlüsselwörtern vertauscht.

Weil sich die Häufigkeit der einzelnen Buchstaben dabei nicht verändert, erkennt ein Angreifer sofort, dass es sich um eine Transposition handelt. Große Tabellen und mehrere Vertauschungen hintereinander machen das Entschlüsseln ohne Schlüssel aber deutlich schwieriger.`;

  const ui = {
    alphabet: $("alphabet"),
    source: $("source"), sourceMeta: $("source-meta"), sourceNote: $("source-note"),
    openBtn: $("open-btn"), fileInput: $("file-input"), sampleBtn: $("sample-btn"), clearBtn: $("clear-btn"),
    mRoute: $("m-route"), mMulti: $("m-multi"),
    routeParams: $("route-params"), multiParams: $("multi-params"),
    rows: $("rows"), cols: $("cols"), autoRows: $("auto-rows"),
    keyCols: $("key-cols"), keyRows: $("key-rows"),
    keyColsOrder: $("key-cols-order"), keyRowsOrder: $("key-rows-order"),
    blockSize: $("block-size"), paramError: $("param-error"),
    encryptBtn: $("encrypt-btn"), decryptBtn: $("decrypt-btn"),
    result: $("result"), resultTitle: $("result-title"), resultError: $("result-error"), toast: $("toast"),
    useBtn: $("use-btn"), copyBtn: $("copy-btn"), saveBtn: $("save-btn"),
    stBlocks: $("st-blocks"), stEnc: $("st-enc"), stDec: $("st-dec"), stCheck: $("st-check"),
    grids: $("grids"), blockFlow: $("block-flow"), blockLabel: $("block-label"),
    prevBlock: $("prev-block"), nextBlock: $("next-block"),
    freqSummary: $("freq-summary"), charts: $("charts"), chartIn: $("chart-in"), chartOut: $("chart-out"),
    capIn: $("cap-in"), capOut: $("cap-out"), thIn: $("th-in"), thOut: $("th-out"),
    tooltip: $("tooltip"), freqBody: $("freq-body"),
  };

  const nf = new Intl.NumberFormat("ru-RU");
  const pct = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const msFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  const MAX_SHOWN_ROWS = 40;

  let state = null;      // результат последней операции
  let sourceName = "";   // имя открытого файла — для имени сохраняемого
  let freq = null;       // данные гистограмм
  let active = null;     // индекс буквы под курсором на гистограмме
  let anchorSvg = null;  // над какой гистограммой показывать подсказку

  const length = (s) => Array.from(s).length;

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
    return ui.mMulti.checked ? "multi" : "route";
  }

  // Шифр с текущими параметрами. Для «весь текст в одной таблице»
  // число строк зависит от длины текста.
  function cipherFor(textLength, decrypting) {
    if (method() === "multi") {
      const colKey = ui.keyCols.value, rowKey = ui.keyRows.value;
      return { method: "multi", colKey, rowKey, ...C.multiplePermutation(colKey, rowKey) };
    }
    const cols = Number(ui.cols.value);
    let rows = Number(ui.rows.value);
    if (!Number.isInteger(cols) || cols < 1 || cols > 100) {
      throw new Error("Число столбцов — целое число от 1 до 100");
    }
    if (ui.autoRows.checked) {
      if (!textLength) throw new Error("Введите текст: число строк считается по его длине");
      rows = decrypting ? textLength / cols : Math.ceil(textLength / cols);
      if (!Number.isInteger(rows)) {
        throw new Error(`Длина шифртекста (${nf.format(textLength)}) не делится на число столбцов (${cols})`);
      }
    } else if (!Number.isInteger(rows) || rows < 1 || rows > 100) {
      throw new Error("Число строк — целое число от 1 до 100");
    }
    return { method: "route", ...C.routePermutation(rows, cols) };
  }

  function keyLetters(key) {
    const s = String(key).trim();
    if (/^[\d\s,;]+$/.test(s)) return null; // ключ задан цифрами
    return Array.from(s.replace(/\s+/g, "")).map(C.upper);
  }

  function orderLine(key) {
    try { return "номера: " + C.keyOrder(key).join(" "); } catch { return ""; }
  }

  function sizeLine(c) {
    const n = c.rows * c.cols;
    const text = `Таблица ${c.rows} ${plural(c.rows, "строка", "строки", "строк")} × ${c.cols} ` +
      `${plural(c.cols, "столбец", "столбца", "столбцов")} = ${nf.format(n)} ${plural(n, "символ", "символа", "символов")} в блоке`;
    return c.method === "route" && ui.autoRows.checked ? `${text} (весь текст)` : text;
  }

  function updateParams() {
    const multi = method() === "multi";
    ui.routeParams.hidden = multi;
    ui.multiParams.hidden = !multi;
    ui.rows.disabled = ui.autoRows.checked;
    ui.keyColsOrder.textContent = orderLine(ui.keyCols.value);
    ui.keyRowsOrder.textContent = orderLine(ui.keyRows.value);

    let c = null, error = "";
    try { c = cipherFor(length(ui.source.value), false); } catch (e) { error = e.message; }
    ui.paramError.textContent = error;
    ui.paramError.hidden = !error;
    ui.blockSize.hidden = !c;
    if (c) ui.blockSize.textContent = sizeLine(c);
    ui.encryptBtn.disabled = ui.decryptBtn.disabled = Boolean(error);
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
        `${foreign.length > 8 ? " …" : ""}. Шифр переставит и их, но в частотах они не учитываются.`;
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

  function encryptNow() {
    clearError();
    const text = ui.source.value;
    if (!text) return showError("Введите текст или откройте файл .txt");
    let c;
    try { c = cipherFor(length(text), false); } catch (e) { return showError(e.message); }
    const cipher = C.encrypt(text, c.perm);
    const back = C.decrypt(cipher, c.perm);
    present({
      op: "enc", c, input: text, output: cipher, plain: text, cipher,
      enc: timeIt(() => C.encrypt(text, c.perm)),
      dec: timeIt(() => C.decrypt(cipher, c.perm)),
      ok: back === text,
    });
  }

  function tryDecrypt(text) {
    const c = cipherFor(length(text), true);
    return { c, plain: C.decrypt(text, c.perm) };
  }

  function decryptNow() {
    clearError();
    const original = ui.source.value;
    if (!original) return showError("Вставьте шифртекст или откройте файл .txt");
    let text = original, c, plain;
    try {
      ({ c, plain } = tryDecrypt(text));
    } catch (e) {
      // Частый случай: при копировании в конец добавился перевод строки.
      const trimmed = original.replace(/\n+$/, "");
      try { ({ c, plain } = tryDecrypt(trimmed)); text = trimmed; } catch { return showError(e.message); }
    }
    const again = C.encrypt(plain, c.perm);
    present({
      op: "dec", c, input: text, output: plain, plain, cipher: text,
      enc: timeIt(() => C.encrypt(plain, c.perm)),
      dec: timeIt(() => C.decrypt(text, c.perm)),
      ok: again === text,
    });
    if (text !== original) toast("Перевод строки в конце шифртекста не учитывался");
  }

  function present(r) {
    state = { ...r, block: 0 };
    const enc = r.op === "enc";
    const n = r.c.perm.length;
    ui.result.value = r.output;
    ui.resultTitle.textContent = enc ? "Шифртекст" : "Расшифрованный текст";
    ui.stBlocks.textContent = `${nf.format(length(r.cipher) / n)} по ${nf.format(n)}`;
    ui.stEnc.textContent = formatTime(r.enc.ms);
    ui.stEnc.title = `среднее по ${nf.format(r.enc.runs)} запускам`;
    ui.stDec.textContent = formatTime(r.dec.ms);
    ui.stDec.title = `среднее по ${nf.format(r.dec.runs)} запускам`;
    ui.stCheck.replaceChildren(r.ok
      ? chip("ok", enc ? "✓ расшифровка вернула текст" : "✓ повторное шифрование совпало")
      : chip("warn", enc
        ? "! текст кончается на «_»: при расшифровании этот символ отбросится как заполнитель"
        : "! шифртекст не восстановился"));
    renderBlock();
    renderFrequencies();
  }

  // ------------------------------------------------------- таблица блока

  const isSoft = (ch) => ch === " " || ch === "\n" || ch === "\t" || ch === C.PAD;

  function glyph(ch) {
    if (ch === " ") return "·";
    if (ch === "\n") return "↵";
    if (ch === "\t") return "⇥";
    return ch;
  }

  function th(text, className) {
    return el("th", className, text);
  }

  function td(ch, no) {
    const cell = el("td", isSoft(ch) ? "soft" : "", glyph(ch));
    if (no) {
      cell.append(el("span", "no", String(no)));
      if (no === 1) cell.classList.add("start");
    }
    return cell;
  }

  function figure(caption, table, note) {
    const fig = el("figure", "grid-fig");
    const scroll = el("div", "grid-scroll");
    scroll.append(table);
    fig.append(el("figcaption", "", caption), scroll);
    if (note) fig.append(el("p", "more", note));
    return fig;
  }

  function routeFigures(c, block) {
    const { rows, cols } = c;
    const charAt = new Array(rows * cols);
    const readNo = new Array(rows * cols);
    C.snakeWriteOrder(rows, cols).forEach((cell, t) => { charAt[cell] = block[t]; });
    C.snakeReadOrder(rows, cols).forEach((cell, j) => { readNo[cell] = j + 1; });

    const table = el("table", "grid");
    const head = table.createTHead();
    const numbers = head.insertRow(), arrows = head.insertRow();
    numbers.append(th("")); arrows.append(th(""));
    for (let col = 0; col < cols; col++) {
      numbers.append(th(String(col + 1)));
      arrows.append(th((cols - 1 - col) % 2 === 0 ? "↓" : "↑", "arrow"));
    }
    numbers.append(th("")); arrows.append(th(""));
    const body = table.createTBody();
    const shown = Math.min(rows, MAX_SHOWN_ROWS);
    for (let r = 0; r < shown; r++) {
      const tr = body.insertRow();
      tr.append(th(String(r + 1)));
      for (let col = 0; col < cols; col++) tr.append(td(charAt[r * cols + col], readNo[r * cols + col]));
      tr.append(th(r % 2 === 0 ? "→" : "←", "arrow"));
    }
    return [figure(
      "Вписываем по стрелкам справа, выписываем по стрелкам сверху. Число в углу клетки — место символа в шифртексте",
      table,
      rows > shown ? `Показаны первые ${shown} строк из ${rows}.` : "",
    )];
  }

  function invert(order) {
    const at = new Array(order.length);
    order.forEach((no, i) => { at[no - 1] = i; });
    return at;
  }

  function multiFigures(c, block) {
    const { rows, cols, colOrder, rowOrder } = c;
    const colLetters = keyLetters(c.colKey);
    const rowLetters = keyLetters(c.rowKey);
    const natural = (n) => Array.from({ length: n }, (_, i) => i);
    const colAt = invert(colOrder);
    const rowAt = invert(rowOrder);

    // colIds[k] — какой исходный столбец стоит на k-м месте, rowIds — то же для строк
    function table(colIds, rowIds) {
      const t = el("table", "grid");
      const head = t.createTHead();
      const lead = rowLetters ? 2 : 1;
      if (colLetters) {
        const tr = head.insertRow();
        for (let i = 0; i < lead; i++) tr.append(th(""));
        colIds.forEach((k) => tr.append(th(colLetters[k], "key")));
      }
      const nums = head.insertRow();
      for (let i = 0; i < lead; i++) nums.append(th(""));
      colIds.forEach((k) => nums.append(th(String(colOrder[k]), "num")));
      const body = t.createTBody();
      rowIds.slice(0, MAX_SHOWN_ROWS).forEach((r) => {
        const tr = body.insertRow();
        if (rowLetters) tr.append(th(rowLetters[r], "key"));
        tr.append(th(String(rowOrder[r]), "num"));
        colIds.forEach((k) => tr.append(td(block[r * cols + k])));
      });
      return t;
    }

    return [
      figure("1. Исходная таблица: имя над столбцами, фамилия слева", table(natural(cols), natural(rows))),
      figure("2. Столбцы по возрастанию номеров", table(colAt, natural(rows))),
      figure("3. Строки по возрастанию номеров — читаем по строкам", table(colAt, rowAt)),
    ];
  }

  function flowRow(label, chars) {
    const row = el("div");
    const code = el("code");
    for (const ch of chars) code.append(isSoft(ch) ? el("span", "soft", glyph(ch)) : ch);
    row.append(el("span", "label", label), code);
    return row;
  }

  function renderBlock() {
    if (!state) return;
    const { c } = state;
    const n = c.perm.length;
    const chars = C.pad(state.plain, n);
    if (!chars.length) chars.push(...new Array(n).fill(C.PAD));
    const count = chars.length / n;
    state.block = Math.min(Math.max(state.block, 0), count - 1);
    const b = state.block;
    const block = chars.slice(b * n, (b + 1) * n);
    const out = c.perm.map((p) => block[p]);

    ui.blockLabel.textContent = `Блок ${nf.format(b + 1)} из ${nf.format(count)}`;
    ui.prevBlock.disabled = b === 0;
    ui.nextBlock.disabled = b === count - 1;
    ui.grids.replaceChildren(...(c.method === "route" ? routeFigures(c, block) : multiFigures(c, block)));
    ui.blockFlow.replaceChildren(
      flowRow("Блок открытого текста", block),
      flowRow("Тот же блок в шифртексте", out),
    );
  }

  // --------------------------------------------------------- гистограммы

  const M = { t: 10, r: 8, b: 24, l: 46 };
  const H = 150;

  function geometry(svg) {
    const W = Math.max(260, Math.floor(svg.parentElement.getBoundingClientRect().width));
    const iw = W - M.l - M.r;
    return { W, ih: H - M.t - M.b, band: iw / C.ALPHABET.length };
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
      parts.push(`<text class="xl${i === active ? " on" : ""}" x="${M.l + (i + 0.5) * band}" y="${H - 7}">${C.ALPHABET[i]}</text>`);
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
      el("div", "letter", C.ALPHABET[active]),
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
    if (x < 0 || x >= band * C.ALPHABET.length) return null;
    return Math.floor(x / band);
  }

  for (const svg of [ui.chartIn, ui.chartOut]) {
    svg.addEventListener("pointermove", (e) => setActive(bandAt(svg, e.clientX), svg));
    svg.addEventListener("pointerdown", (e) => setActive(bandAt(svg, e.clientX), svg));
    svg.addEventListener("pointerleave", () => setActive(null));
    svg.addEventListener("focus", () => setActive(active === null ? 0 : active, svg));
    svg.addEventListener("blur", () => setActive(null));
    svg.addEventListener("keydown", (e) => {
      const last = C.ALPHABET.length - 1;
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

    const same = a.counts.every((v, i) => v === b.counts[i]);
    const top = a.counts
      .map((v, i) => [v, i])
      .filter(([v]) => v > 0)
      .sort((x, y) => y[0] - x[0] || x[1] - y[1])
      .slice(0, 5)
      .map(([v, i]) => `${C.ALPHABET[i]} ${pct.format((v / a.total) * 100)} %`)
      .join(", ");
    ui.freqSummary.replaceChildren(
      same ? chip("ok", "✓ частоты совпадают") : chip("warn", "! частоты различаются"),
      `${nf.format(a.total)} ${plural(a.total, "буква", "буквы", "букв")} до и ${nf.format(b.total)} после: ` +
      `перестановка меняет только порядок символов.${top ? ` Чаще всего встречаются ${top}.` : ""}`,
    );

    ui.freqBody.replaceChildren(...C.ALPHABET.split("").map((ch, i) => {
      const tr = el("tr");
      const share = a.total ? `${pct.format((a.counts[i] / a.total) * 100)} %` : "—";
      for (const text of [ch, nf.format(a.counts[i]), nf.format(b.counts[i]), share]) tr.append(el("td", "", text));
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
      if (text.includes("�")) text = await readFile(file, "windows-1252"); // старые файлы Windows
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
  for (const input of [ui.rows, ui.cols, ui.keyCols, ui.keyRows]) input.addEventListener("input", updateParams);
  for (const input of [ui.autoRows, ui.mRoute, ui.mMulti]) input.addEventListener("change", updateParams);
  ui.encryptBtn.addEventListener("click", encryptNow);
  ui.decryptBtn.addEventListener("click", decryptNow);
  ui.prevBlock.addEventListener("click", () => { if (state) { state.block--; renderBlock(); } });
  ui.nextBlock.addEventListener("click", () => { if (state) { state.block++; renderBlock(); } });

  ui.alphabet.replaceChildren(
    el("span", "label", "Алфавит, 30 букв"),
    ...C.ALPHABET.split("").map((ch) => el("span", "ÄÖÜß".includes(ch) ? "extra" : "", ch)),
  );

  if (!ui.source.value) {
    ui.source.value = SAMPLE;
    sourceName = "primer_de.txt";
  }
  updateSource();
  if (!ui.encryptBtn.disabled) encryptNow();
})();
