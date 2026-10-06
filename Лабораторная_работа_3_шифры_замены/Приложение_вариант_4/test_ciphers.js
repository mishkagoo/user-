// Проверка шифров: node test_ciphers.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("./ciphers.js");

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const sample = fs.readFileSync(path.join(__dirname, "primer_de.txt"), "utf8");

test("алфавит: 30 букв, A = 0, ß = 29", () => {
  assert.equal(C.N, 30);
  assert.equal(C.letterIndex("A"), 0);
  assert.equal(C.letterIndex("a"), 0);
  assert.equal(C.letterIndex("ß"), 29);
  assert.equal(C.letterIndex("ẞ"), 29);
  assert.equal(C.letterIndex("Я"), -1);
});

test("сдвиг на 3 совпадает с примером из методички (буквы a–w)", () => {
  assert.equal(C.caesarEncrypt("meet me after the toga", 3), "phhw ph diwhu wkh wrjd");
});

test("сдвиг на 7: формула y = (x + 7) mod 30", () => {
  assert.equal(C.caesarEncrypt("ABC", 7), "HIJ");
  assert.equal(C.caesarEncrypt("x", 7), "a");       // 23 + 7 = 30 → 0
  assert.equal(C.caesarEncrypt("z", 7), "c");       // 25 + 7 = 32 → 2
  assert.equal(C.caesarEncrypt("W", 7), "ẞ");       // 22 + 7 = 29
  assert.equal(C.caesarEncrypt("Größe", 7), "Nyegl"); // ö 27 → 4 (e), ß 29 → 6 (g)
  assert.equal(C.caesarEncrypt("Hallo, Welt! 2024", 7), "Ohssv, ẞlsä! 2024"); // t 19 → 26 (ä)
});

test("сдвиг: расшифровка возвращает текст при любом k", () => {
  for (const k of [7, 1, 29, 30, 31, -5, 100]) {
    assert.equal(C.caesarDecrypt(C.caesarEncrypt(sample, k), k), sample);
  }
});

test("Плейфер: таблица 5 × 6 по ключу SCHLÜSSEL", () => {
  const t = C.playfairTable("Schlüssel");
  assert.equal(t.keyLength, 6);
  const rows = [];
  for (let r = 0; r < 5; r++) rows.push(t.cells.slice(r * 6, r * 6 + 6).join(""));
  assert.deepEqual(rows, ["SCHLÜE", "ABDFGI", "JKMNOP", "QRTUVW", "XYZÄÖß"]);
});

test("Плейфер: три правила для пар", () => {
  const t = C.playfairTable("SCHLÜSSEL");
  assert.deepEqual(C.transformPair(t, "S", "C", 1), { out: "CH", rule: "row" });  // одна строка → справа
  assert.deepEqual(C.transformPair(t, "E", "L", 1), { out: "SÜ", rule: "row" });  // по кругу
  assert.deepEqual(C.transformPair(t, "S", "A", 1), { out: "AJ", rule: "col" });  // один столбец → снизу
  assert.deepEqual(C.transformPair(t, "X", "S", 1), { out: "SA", rule: "col" });  // по кругу
  assert.deepEqual(C.transformPair(t, "H", "I", 1), { out: "ED", rule: "rect" }); // углы прямоугольника
  assert.deepEqual(C.transformPair(t, "E", "D", -1), { out: "HI", rule: "rect" });
});

test("Плейфер: HALLO с удвоенной L", () => {
  const pairs = C.playfairPairs("Hallo").map((p) => p.a + p.b);
  assert.deepEqual(pairs, ["HA", "LX", "LO"]);
  const cipher = C.playfairEncrypt("Hallo", "SCHLÜSSEL");
  assert.equal(cipher, "SD SÄ ÜN");
  assert.deepEqual(C.playfairDecrypt(cipher, "SCHLÜSSEL"), { raw: "HALXLO", text: "HALLO" });
});

test("Плейфер: XX и нечётный хвост", () => {
  assert.deepEqual(C.playfairPairs("xxa").map((p) => p.a + p.b), ["XQ", "XA"]);
  assert.deepEqual(C.playfairPairs("abc").map((p) => p.a + p.b), ["AB", "CX"]);
  for (const word of ["xxa", "abc", "Straße", "Kaffee", "Öl"]) {
    const back = C.playfairDecrypt(C.playfairEncrypt(word, "Geheim"), "Geheim").text;
    assert.equal(back, C.tableLetters(word).join(""), word);
  }
});

test("Плейфер: пример на немецком расшифровывается обратно", () => {
  assert.ok(Array.from(sample).length >= 500);
  for (const key of ["SCHLÜSSEL", "Michail", "Größe"]) {
    const cipher = C.playfairEncrypt(sample, key);
    assert.equal(C.playfairDecrypt(cipher, key).text, C.tableLetters(sample).join(""), key);
  }
});

test("Плейфер: понятные ошибки", () => {
  assert.throws(() => C.playfairTable(""), /Введите ключевое слово/);
  assert.throws(() => C.playfairTable("Ключ"), /не входит в немецкий алфавит/);
  assert.throws(() => C.playfairDecrypt("ABC", "Geheim"), /чётное число/);
});

test("частоты без учёта регистра", () => {
  const { counts, total } = C.letterCounts("Aa ß ẞ Я!");
  assert.equal(total, 4);
  assert.equal(counts[0], 2);
  assert.equal(counts[29], 2);
  assert.deepEqual(C.foreignLetters("Hallo, Мир"), ["М", "и", "р"]);
});

test("пример в app.js совпадает с файлом primer_de.txt", () => {
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const embedded = app.match(/const SAMPLE = `([^`]*)`;/)[1];
  assert.equal(embedded, sample.replace(/\n$/, ""));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log("ok  ", name); }
  catch (e) { failed++; console.log("FAIL", name, "\n     ", e.message); }
}
console.log(failed ? `\n${failed} из ${tests.length} не прошли` : `\nВсе ${tests.length} проверок прошли`);
process.exit(failed ? 1 : 0);
