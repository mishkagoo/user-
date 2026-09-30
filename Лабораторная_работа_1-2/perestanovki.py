#!/usr/bin/env python3
"""Лабораторная работа №1-2. Шифры перестановки.

Считает все пять заданий для «Горошко Михаил» (латиницей и кириллицей),
расшифровывает полученные шифры обратно и печатает таблицы для тетради.

Запуск:  python3 perestanovki.py
"""

PAD = "_"  # пробел между словами и пустые клетки таблицы
RU_ALPHABET = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
EN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def pad(text, n):
    """Дописывает _ в конец, пока длина не станет кратна n."""
    return text + PAD * (-len(text) % n)


def chunks(s, n):
    return [s[i:i + n] for i in range(0, len(s), n)]


def grid_rows(grid, col_labels=None, row_labels=None):
    lines = []
    if col_labels:
        lines.append("    " + " ".join(str(x) for x in col_labels))
    for i, row in enumerate(grid):
        head = f"{row_labels[i]:>2}  " if row_labels else "    "
        lines.append(head + " ".join(row))
    return lines


def show(grid, col_labels=None, row_labels=None):
    print("\n".join(grid_rows(grid, col_labels, row_labels)))


# ---------------------------------------------------------------- Задание 1
# Простая перестановка: вписываем по строкам, выписываем по столбцам.
# Таблица rows x cols; если текст длиннее — берём несколько таблиц.

def simple_encrypt(text, rows, cols):
    out = []
    for block in chunks(pad(text, rows * cols), rows * cols):
        grid = chunks(block, cols)
        out.append("".join(grid[r][c] for c in range(cols) for r in range(rows)))
    return "".join(out)


def simple_decrypt(cipher, rows, cols):
    out = []
    for block in chunks(cipher, rows * cols):
        columns = chunks(block, rows)
        out.append("".join(columns[c][r] for r in range(rows) for c in range(cols)))
    return "".join(out)


# ---------------------------------------------------------------- Задание 2
# Блочная перестановка: в каждом блоке буквы выписываются в порядке ключа
# (ключ 1342 -> 1-я, 3-я, 4-я, 2-я буква блока), как в примере с К=45123.

def block_encrypt(text, key):
    n = len(key)
    return "".join("".join(b[k - 1] for k in key) for b in chunks(pad(text, n), n))


def block_decrypt(cipher, key):
    n = len(key)
    out = []
    for b in chunks(cipher, n):
        plain = [""] * n
        for i, k in enumerate(key):
            plain[k - 1] = b[i]
        out.append("".join(plain))
    return "".join(out)


# ---------------------------------------------------------------- Задание 3
# Маршрутная перестановка «змейка»:
#   вписываем горизонтальной змейкой из левого верхнего угла (→, ←, →, ...),
#   выписываем вертикальной змейкой из правого верхнего угла (↓, ↑, ↓, ...).

def snake_write_route(rows, cols):
    route = []
    for r in range(rows):
        cs = range(cols) if r % 2 == 0 else range(cols - 1, -1, -1)
        route += [(r, c) for c in cs]
    return route


def snake_read_route(rows, cols):
    route = []
    for i, c in enumerate(range(cols - 1, -1, -1)):
        rs = range(rows) if i % 2 == 0 else range(rows - 1, -1, -1)
        route += [(r, c) for r in rs]
    return route


def fill(text, route, rows, cols):
    grid = [[PAD] * cols for _ in range(rows)]
    for ch, (r, c) in zip(text, route):
        grid[r][c] = ch
    return grid


def route_table(text, rows, cols):
    return fill(pad(text, rows * cols), snake_write_route(rows, cols), rows, cols)


def route_encrypt(text, rows, cols):
    grid = route_table(text, rows, cols)
    return "".join(grid[r][c] for r, c in snake_read_route(rows, cols))


def route_decrypt(cipher, rows, cols):
    grid = fill(cipher, snake_read_route(rows, cols), rows, cols)
    return "".join(grid[r][c] for r, c in snake_write_route(rows, cols))


# ---------------------------------------------------------------- Задание 4
# Вертикальная перестановка: буквы ключевого слова нумеруются по алфавиту,
# текст вписывается по строкам, столбцы выписываются сверху вниз
# в порядке номеров.

def keyword_numbers(word, alphabet):
    order = sorted(range(len(word)), key=lambda i: (alphabet.index(word[i]), i))
    nums = [0] * len(word)
    for n, i in enumerate(order, 1):
        nums[i] = n
    return nums


def vertical_encrypt(text, nums, rows):
    cols = len(nums)
    grid = chunks(pad(text, rows * cols), cols)
    order = sorted(range(cols), key=lambda c: nums[c])
    return "".join(grid[r][c] for c in order for r in range(rows))


def vertical_decrypt(cipher, nums, rows):
    cols = len(nums)
    order = sorted(range(cols), key=lambda c: nums[c])
    grid = [[PAD] * cols for _ in range(rows)]
    for part, c in zip(chunks(cipher, rows), order):
        for r in range(rows):
            grid[r][c] = part[r]
    return "".join("".join(row) for row in grid)


# ---------------------------------------------------------------- Задание 5
# Двойная перестановка (как в учебнике: «ПРИЛЕТАЮ ВОСЬМОГО», ключи 4132/3142):
# над столбцами пишем k1, слева от строк — k2; сначала расставляем столбцы
# по возрастанию номеров, потом строки; читаем по строкам.

def double_steps(text, k1, k2):
    rows, cols = len(k2), len(k1)
    src = [list(r) for r in chunks(pad(text, rows * cols), cols)]
    by_cols = [[""] * cols for _ in range(rows)]
    for r in range(rows):
        for j in range(cols):
            by_cols[r][k1[j] - 1] = src[r][j]
    by_rows = [None] * rows
    for i in range(rows):
        by_rows[k2[i] - 1] = by_cols[i]
    return src, by_cols, by_rows


def double_encrypt(text, k1, k2):
    return "".join("".join(r) for r in double_steps(text, k1, k2)[2])


def double_decrypt(cipher, k1, k2):
    rows, cols = len(k2), len(k1)
    grid = chunks(cipher, cols)
    by_cols = [grid[k2[i] - 1] for i in range(rows)]
    return "".join("".join(row[k1[j] - 1] for j in range(cols)) for row in by_cols)


# ------------------------------------------------------------------- вывод

def solve(title, text, keyword, alphabet):
    print("=" * 60)
    print(f"{title}: {text}  ({len(text)} симв.)")
    print("=" * 60)

    # 1
    print("\nЗадание 1. Простая перестановка 3x3, выписка по столбцам")
    padded = pad(text, 9)
    for n, block in enumerate(chunks(padded, 9), 1):
        grid = chunks(block, 3)
        print(f"Блок {n}:")
        show(grid, [1, 2, 3], [1, 2, 3])
        print("  после перестановки (столбцы -> строки):")
        show([[grid[r][c] for r in range(3)] for c in range(3)], [1, 2, 3], [1, 2, 3])
    c1 = simple_encrypt(text, 3, 3)
    print("Шифр:", " ".join(chunks(c1, 9)), "=", c1)

    # 2
    key2 = [1, 3, 4, 2]
    print("\nЗадание 2. Блочная перестановка 4x4, ключ 1342")
    src = [list(b) for b in chunks(pad(text, 4), 4)]
    left = grid_rows(src, [1, 2, 3, 4])
    right = grid_rows([[b[k - 1] for k in key2] for b in src], key2)
    for a, b in zip(left, right):
        print(f"{a}    {b}")
    c2 = block_encrypt(text, key2)
    print("Шифр:", " ".join(chunks(c2, 4)), "=", c2)

    # 3
    print("\nЗадание 3. Маршрутная перестановка 5x5, змейка")
    grid = route_table(text, 5, 5)
    arrows = ["→", "←", "→", "←", "→"]
    for line, arrow in zip(grid_rows(grid, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),
                           [""] + arrows):
        print(line, arrow)
    c3 = route_encrypt(text, 5, 5)
    print("Шифр:", " ".join(chunks(c3, 5)), "=", c3)

    # 4
    nums = keyword_numbers(keyword, alphabet)
    print(f"\nЗадание 4. Вертикальная перестановка 5x5, ключ {keyword} -> "
          + "".join(map(str, nums)))
    grid = chunks(pad(text, 25), 5)
    print("    " + " ".join(keyword))
    show(grid, nums)
    order = sorted(range(5), key=lambda c: nums[c])
    print("  столбцы по порядку номеров:")
    print("    " + " ".join(keyword[c] for c in order))
    show([[row[c] for c in order] for row in grid], [1, 2, 3, 4, 5])
    c4 = vertical_encrypt(text, nums, 5)
    print("Шифр:", " ".join(chunks(c4, 5)), "=", c4)

    # 5
    k1 = [1, 4, 6, 5, 3, 2]
    k2 = [3, 5, 6, 4, 1, 2]
    print("\nЗадание 5. Двойная перестановка 6x6, k1=146532, k2=356412")
    src, by_cols, by_rows = double_steps(text, k1, k2)
    print("  исходная:")
    show(src, k1, k2)
    print("  переставили столбцы:")
    show(by_cols, [1, 2, 3, 4, 5, 6], k2)
    print("  переставили строки:")
    show(by_rows, [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6])
    c5 = double_encrypt(text, k1, k2)
    print("Шифр:", " ".join(chunks(c5, 6)), "=", c5)

    # проверка расшифрования
    checks = [
        ("1", simple_decrypt(c1, 3, 3)),
        ("2", block_decrypt(c2, key2)),
        ("3", route_decrypt(c3, 5, 5)),
        ("4", vertical_decrypt(c4, nums, 5)),
        ("5", double_decrypt(c5, k1, k2)),
    ]
    print("\nРасшифровка:")
    for n, plain in checks:
        ok = plain.rstrip(PAD) == text
        print(f"  задание {n}: {plain} -> {plain.rstrip(PAD).replace(PAD, ' ')}"
              f"  {'OK' if ok else 'ОШИБКА'}")
        assert ok


if __name__ == "__main__":
    solve("№1 латиницей", "GOROSHKO_MIKHAIL", "VENIK", EN_ALPHABET)
    print()
    solve("№2 кириллицей", "ГОРОШКО_МИХАИЛ", "ВЕНИК", RU_ALPHABET)
