/*
 * Шифры замены — лабораторная работа №3, вариант 4 (немецкий алфавит).
 *
 * Алфавит: 26 латинских букв и Ä, Ö, Ü, ß — всего N = 30.
 *
 * 1. Шифр сдвига (Цезаря): y = (x + k) mod N, x = (y − k) mod N,
 *    где x и y — номера букв (A = 0, B = 1, …, ß = 29). Регистр сохраняется,
 *    пробелы, цифры и знаки препинания не меняются.
 * 2. Шифр Плейфера: ключевое слово без повторов вписывается в таблицу 5 × 6,
 *    за ним — остальные буквы алфавита. Текст шифруется парами букв.
 *
 * Файл работает и в браузере (window.Ciphers), и в Node (require).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Ciphers = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LOWER = "abcdefghijklmnopqrstuvwxyzäöüß";
  const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ";
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜß"; // как буквы пишутся в таблицах
  const N = LETTERS.length; // 30
  const ROWS = 5;
  const COLS = 6;
  const FILLER = "X";        // разделяет одинаковые буквы в паре и дополняет нечётный хвост
  const FILLER_FOR_X = "Q";  // если сама буква — X

  // Номер буквы (0…29) без учёта регистра или −1, если это не буква алфавита.
  function letterIndex(ch) {
    const i = LOWER.indexOf(ch);
    return i >= 0 ? i : UPPER.indexOf(ch);
  }

  // ------------------------------------------------------ шифр сдвига

  function shiftText(text, k) {
    const s = ((k % N) + N) % N;
    let out = "";
    for (const ch of text) {
      const lo = LOWER.indexOf(ch);
      if (lo >= 0) { out += LOWER[(lo + s) % N]; continue; }
      const up = UPPER.indexOf(ch);
      out += up >= 0 ? UPPER[(up + s) % N] : ch;
    }
    return out;
  }

  const caesarEncrypt = (text, k) => shiftText(text, k);  // y = (x + k) mod N
  const caesarDecrypt = (text, k) => shiftText(text, -k); // x = (y − k) mod N

  // ------------------------------------------------------ шифр Плейфера

  // Буквы текста в виде символов таблицы (заглавные, ß как ß); остальное отбрасывается.
  function tableLetters(text) {
    const out = [];
    for (const ch of text) {
      const i = letterIndex(ch);
      if (i >= 0) out.push(LETTERS[i]);
    }
    return out;
  }

  function playfairTable(keyword) {
    const word = String(keyword).replace(/\s+/g, "");
    if (!word) throw new Error("Введите ключевое слово");
    const bad = Array.from(word).find((ch) => letterIndex(ch) < 0);
    if (bad) throw new Error(`Символ «${bad}» не входит в немецкий алфавит`);

    const cells = [];
    for (const s of tableLetters(word).concat(Array.from(LETTERS))) {
      if (!cells.includes(s)) cells.push(s);
    }
    const keyLength = new Set(tableLetters(word)).size;
    const pos = new Map(cells.map((s, i) => [s, [Math.floor(i / COLS), i % COLS]]));
    return { cells, pos, keyLength };
  }

  // Пары букв открытого текста: одинаковые буквы в паре разделяются X,
  // к нечётному хвосту добавляется X (для самой X — Q).
  function playfairPairs(text) {
    const letters = tableLetters(text);
    const pairs = [];
    let i = 0;
    while (i < letters.length) {
      const a = letters[i];
      const b = letters[i + 1];
      if (b === undefined || b === a) {
        pairs.push({ a, b: a === FILLER ? FILLER_FOR_X : FILLER, filler: true });
        i += 1;
      } else {
        pairs.push({ a, b, filler: false });
        i += 2;
      }
    }
    return pairs;
  }

  // dir = +1 — зашифрование, −1 — расшифрование.
  function transformPair(table, a, b, dir) {
    const [ra, ca] = table.pos.get(a);
    const [rb, cb] = table.pos.get(b);
    const at = (r, c) => table.cells[((r + ROWS) % ROWS) * COLS + ((c + COLS) % COLS)];
    if (ra === rb) return { out: at(ra, ca + dir) + at(rb, cb + dir), rule: "row" };
    if (ca === cb) return { out: at(ra + dir, ca) + at(rb + dir, cb), rule: "col" };
    return { out: at(ra, cb) + at(rb, ca), rule: "rect" };
  }

  // Шифртекст — пары букв через пробел.
  function playfairEncrypt(text, keyword) {
    const table = playfairTable(keyword);
    return playfairPairs(text).map((p) => transformPair(table, p.a, p.b, 1).out).join(" ");
  }

  // Убирает X, вставленные между одинаковыми буквами и в конец.
  function removeFillers(raw) {
    const s = Array.from(raw);
    const out = [];
    for (let i = 0; i < s.length; i += 2) {
      const a = s[i], b = s[i + 1], next = s[i + 2];
      out.push(a);
      const filler = b === FILLER || (b === FILLER_FOR_X && a === FILLER);
      if (filler && (next === a || next === undefined)) continue;
      out.push(b);
    }
    return out.join("");
  }

  // raw — расшифровка с заполнителями, text — без них.
  function playfairDecrypt(cipher, keyword) {
    const table = playfairTable(keyword);
    const letters = tableLetters(cipher);
    if (letters.length % 2) {
      throw new Error(`В шифртексте ${letters.length} букв, а для шифра Плейфера нужно чётное число`);
    }
    let raw = "";
    for (let i = 0; i < letters.length; i += 2) raw += transformPair(table, letters[i], letters[i + 1], -1).out;
    return { raw, text: removeFillers(raw) };
  }

  // ------------------------------------------------------ частоты

  function letterCounts(text) {
    const counts = new Array(N).fill(0);
    let total = 0;
    for (const ch of text) {
      const i = letterIndex(ch);
      if (i >= 0) { counts[i]++; total++; }
    }
    return { counts, total };
  }

  // Буквы, которых нет в немецком алфавите (например, кириллица).
  function foreignLetters(text) {
    const seen = new Set();
    for (const ch of text) {
      if (/\p{L}/u.test(ch) && letterIndex(ch) < 0) seen.add(ch);
    }
    return [...seen];
  }

  return {
    LOWER, UPPER, LETTERS, N, ROWS, COLS, FILLER, FILLER_FOR_X,
    letterIndex, caesarEncrypt, caesarDecrypt,
    tableLetters, playfairTable, playfairPairs, transformPair,
    playfairEncrypt, playfairDecrypt, removeFillers,
    letterCounts, foreignLetters,
  };
});
