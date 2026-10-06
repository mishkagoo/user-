// Проверка шифров: node test_ciphers.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("./ciphers.js");

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("змейка 5×5 совпадает с заданием 3 из тетради", () => {
  const { perm } = C.routePermutation(5, 5);
  assert.equal(C.encrypt("ГОРОШКО_МИХАИЛ", perm), "ШК_____ЛООР_И____АМОГИХ__");
});

test("змейка 4×7 совпадает с примером из учебника", () => {
  const { perm } = C.routePermutation(4, 7);
  assert.equal(C.encrypt("ПРИМЕРМАРШРУТНОЙПЕРЕСТАНОВКИ", perm), "МАСТАЕРРЕШРНОЕРМИУПВКЙТРПНОИ");
});

test("множественная с ключами 15243 / 32154 совпадает с заданием 5", () => {
  const { perm } = C.multiplePermutation("15243", "32154");
  assert.equal(C.encrypt("ГОРОШКО_МИХАИЛ", perm), "ХИ_ЛАК_ИМОГРШОО__________");
});

test("множественная с ключами 4132 / 3142 совпадает с примером из учебника", () => {
  const { perm } = C.multiplePermutation("4 1 3 2", "3,1,4,2");
  assert.equal(C.encrypt("ПРИЛЕТАЮВОСЬМОГО", perm), "ТЮАЕООГМРЛИПОЬСВ");
});

test("номера букв ключа по немецкому алфавиту", () => {
  assert.deepEqual(C.keyOrder("MICHAIL"), [7, 4, 2, 3, 1, 5, 6]);
  assert.deepEqual(C.keyOrder("Goroschko"), [2, 5, 8, 6, 9, 1, 3, 4, 7]);
  assert.deepEqual(C.keyOrder("Größe"), [2, 4, 3, 5, 1]); // E G Ö R ß
  assert.deepEqual(C.keyOrder("ÄA"), [2, 1]);
});

test("неверные ключи и шифртекст дают понятную ошибку", () => {
  assert.throws(() => C.keyOrder("Михаил"), /не входит в немецкий алфавит/);
  assert.throws(() => C.keyOrder("1224"), /от 1 до 4/);
  assert.throws(() => C.keyOrder("   "), /пустой/);
  assert.throws(() => C.routePermutation(0, 5), /не меньше 1/);
  const { perm } = C.routePermutation(5, 5);
  assert.throws(() => C.decrypt("ABC", perm), /не делится на размер блока \(25\)/);
});

test("пример на немецком: оба шифра расшифровываются обратно", () => {
  const text = fs.readFileSync(path.join(__dirname, "primer_de.txt"), "utf8");
  assert.ok(Array.from(text).length >= 500, "в примере должно быть не меньше 500 знаков");
  const perms = [
    C.routePermutation(5, 5).perm,
    C.routePermutation(8, 12).perm,
    C.routePermutation(Math.ceil(Array.from(text).length / 10), 10).perm, // одна таблица на весь текст
    C.multiplePermutation("MICHAIL", "GOROSCHKO").perm,
  ];
  for (const perm of perms) {
    const cipher = C.encrypt(text, perm);
    assert.notEqual(cipher, text);
    assert.equal(Array.from(cipher).length % perm.length, 0);
    assert.equal(C.decrypt(cipher, perm), text);
    assert.deepEqual(C.letterCounts(cipher).counts, C.letterCounts(text).counts);
  }
});

test("пример в app.js совпадает с файлом primer_de.txt", () => {
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const sample = app.match(/const SAMPLE = `([^`]*)`;/)[1];
  const file = fs.readFileSync(path.join(__dirname, "primer_de.txt"), "utf8");
  assert.equal(sample, file.replace(/\n$/, ""));
});

test("случайные тексты и размеры: расшифровка всегда возвращает текст", () => {
  let seed = 12345;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
  const pool = Array.from("abcäöüßXYZ \n.,!" + C.ALPHABET);
  for (let i = 0; i < 300; i++) {
    const len = rand(400);
    let text = "";
    for (let k = 0; k < len; k++) text += pool[rand(pool.length)];
    text = text.replace(/_+$/, "") + (len ? "e" : ""); // текст не кончается на заполнитель
    const perm = i % 2
      ? C.routePermutation(1 + rand(9), 1 + rand(9)).perm
      : C.multiplePermutation(String(rand(1e6)).replace(/\d/g, (d) => "ABCDEFGHIJ"[d]) || "A", "ÜBUNG").perm;
    assert.equal(C.decrypt(C.encrypt(text, perm), perm), text);
  }
});

test("частоты считаются без учёта регистра, ß отдельно", () => {
  const { counts, total } = C.letterCounts("Aa ß Ä! Я");
  assert.equal(total, 4);
  assert.equal(counts[C.ALPHABET.indexOf("A")], 2);
  assert.equal(counts[C.ALPHABET.indexOf("ß")], 1);
  assert.equal(counts[C.ALPHABET.indexOf("Ä")], 1);
  assert.deepEqual(C.foreignLetters("Hallo, Мир"), ["М", "и", "р"]);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log("ok  ", name); }
  catch (e) { failed++; console.log("FAIL", name, "\n     ", e.message); }
}
console.log(failed ? `\n${failed} из ${tests.length} не прошли` : `\nВсе ${tests.length} проверок прошли`);
process.exit(failed ? 1 : 0);
