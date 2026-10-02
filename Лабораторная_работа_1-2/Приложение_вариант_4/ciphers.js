/*
 * Шифры перестановки — лабораторная работа, вариант 4 (немецкий алфавит).
 *
 * 1. Маршрутная перестановка «змейкой»: блок вписывается в таблицу змейкой
 *    по строкам (→ ← → …) и выписывается змейкой по столбцам, начиная
 *    с правого верхнего угла (↓ ↑ ↓ …).
 * 2. Множественная перестановка: над столбцами пишется первое ключевое
 *    слово (имя), слева от строк — второе (фамилия). Столбцы, затем строки
 *    расставляются по алфавитному порядку букв ключа, блок читается
 *    по строкам.
 *
 * Обе перестановки работают поблочно: текст режется на блоки по
 * «строк × столбцов» символов, последний блок дополняется символом PAD.
 *
 * Файл работает и в браузере (window.Ciphers), и в Node (require).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Ciphers = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Немецкий алфавит (30 букв) в словарном порядке DIN 5007:
  // умляут стоит сразу после своей буквы, ß — после S.
  const ALPHABET = "AÄBCDEFGHIJKLMNOÖPQRSßTUÜVWXYZ";
  const PAD = "_"; // заполнитель пустых клеток последнего блока

  // Заглавная буква; ß остаётся ß (toUpperCase превратил бы её в «SS»).
  function upper(ch) {
    return ch === "ß" || ch === "ẞ" ? "ß" : ch.toUpperCase();
  }

  function alphabetIndex(ch) {
    const u = upper(ch);
    return u.length === 1 ? ALPHABET.indexOf(u) : -1;
  }

  // Номера букв ключевого слова по алфавиту: «MICHAIL» → [7,4,2,3,1,5,6].
  // Одинаковые буквы нумеруются слева направо.
  // Ключ можно задать и числами: «15243» или «1 5 2 4 3».
  function keyOrder(key) {
    const s = String(key).trim();
    if (!s) throw new Error("Ключ пустой");

    if (/^[\d\s,;]+$/.test(s)) {
      const parts = /[\s,;]/.test(s) ? s.split(/[\s,;]+/).filter(Boolean) : Array.from(s);
      const nums = parts.map(Number);
      const sorted = [...nums].sort((a, b) => a - b);
      if (sorted.some((v, i) => v !== i + 1)) {
        throw new Error(`Цифровой ключ должен содержать числа от 1 до ${nums.length}, каждое по одному разу`);
      }
      return nums;
    }

    const letters = Array.from(s.replace(/\s+/g, ""));
    const bad = letters.find((ch) => alphabetIndex(ch) < 0);
    if (bad) throw new Error(`Буква «${bad}» не входит в немецкий алфавит`);

    const positions = letters.map((_, i) => i);
    positions.sort((a, b) => alphabetIndex(letters[a]) - alphabetIndex(letters[b]) || a - b);
    const order = new Array(letters.length);
    positions.forEach((pos, rank) => { order[pos] = rank + 1; });
    return order;
  }

  // ------------------------------------------------ маршрут «змейка»

  // Клетки (r * cols + c) в порядке записи: 1-я строка →, 2-я ←, 3-я → …
  function snakeWriteOrder(rows, cols) {
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) cells.push(r * cols + (r % 2 === 0 ? k : cols - 1 - k));
    }
    return cells;
  }

  // Клетки в порядке считывания: последний столбец ↓, предпоследний ↑ …
  function snakeReadOrder(rows, cols) {
    const cells = [];
    for (let i = 0; i < cols; i++) {
      const c = cols - 1 - i;
      for (let k = 0; k < rows; k++) cells.push((i % 2 === 0 ? k : rows - 1 - k) * cols + c);
    }
    return cells;
  }

  function checkSize(rows, cols) {
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
      throw new Error("Число строк и столбцов должно быть целым и не меньше 1");
    }
  }

  // Перестановка блока задаётся массивом perm: шифр[j] = блок[perm[j]].
  function routePermutation(rows, cols) {
    checkSize(rows, cols);
    const textIndexAt = new Array(rows * cols);
    snakeWriteOrder(rows, cols).forEach((cell, t) => { textIndexAt[cell] = t; });
    const perm = snakeReadOrder(rows, cols).map((cell) => textIndexAt[cell]);
    return { perm, rows, cols };
  }

  // ------------------------------------------ множественная перестановка

  function multiplePermutation(colKey, rowKey) {
    const colOrder = keyOrder(colKey); // номера над столбцами (имя)
    const rowOrder = keyOrder(rowKey); // номера слева от строк (фамилия)
    const cols = colOrder.length;
    const rows = rowOrder.length;
    const perm = new Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // клетка (r, c) после сортировки встаёт в строку rowOrder[r] и столбец colOrder[c]
        perm[(rowOrder[r] - 1) * cols + (colOrder[c] - 1)] = r * cols + c;
      }
    }
    return { perm, rows, cols, colOrder, rowOrder };
  }

  // ------------------------------------------------ шифрование блоками

  function pad(text, blockSize) {
    const chars = Array.from(text);
    while (chars.length % blockSize) chars.push(PAD);
    return chars;
  }

  function encrypt(text, perm) {
    const n = perm.length;
    const src = pad(text, n);
    const out = new Array(src.length);
    for (let b = 0; b < src.length; b += n) {
      for (let j = 0; j < n; j++) out[b + j] = src[b + perm[j]];
    }
    return out.join("");
  }

  // Обратная операция. Заполнители в конце последнего блока отбрасываются.
  function decrypt(cipher, perm) {
    const n = perm.length;
    const src = Array.from(cipher);
    if (src.length % n) {
      throw new Error(`Длина шифртекста (${src.length}) не делится на размер блока (${n})`);
    }
    const out = new Array(src.length);
    for (let b = 0; b < src.length; b += n) {
      for (let j = 0; j < n; j++) out[b + perm[j]] = src[b + j];
    }
    let end = out.length;
    while (end > 0 && out[end - 1] === PAD) end--;
    return out.slice(0, end).join("");
  }

  // Сколько раз встречается каждая буква немецкого алфавита (без учёта регистра).
  function letterCounts(text) {
    const counts = new Array(ALPHABET.length).fill(0);
    let total = 0;
    for (const ch of text) {
      const i = alphabetIndex(ch);
      if (i >= 0) { counts[i]++; total++; }
    }
    return { counts, total };
  }

  // Буквы, которых нет в немецком алфавите (например, кириллица).
  function foreignLetters(text) {
    const seen = new Set();
    for (const ch of text) {
      if (/\p{L}/u.test(ch) && alphabetIndex(ch) < 0) seen.add(ch);
    }
    return [...seen];
  }

  return {
    ALPHABET, PAD, upper, keyOrder,
    snakeWriteOrder, snakeReadOrder, routePermutation, multiplePermutation,
    pad, encrypt, decrypt, letterCounts, foreignLetters,
  };
});
