from PIL import Image, ImageDraw

"""
Иконки приложения: тёмная плитка, светлый навесной замок.

Отрисовка вчетверо крупнее с последующим уменьшением — PIL не сглаживает
фигуры сам.
"""

BG = (24, 24, 27)
FG = (237, 237, 237)


def draw(size: int, maskable: bool) -> Image.Image:
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        # maskable-иконку система обрежет по своей форме: фон во весь холст,
        # рисунок — внутри safe zone
        d.rectangle([0, 0, s, s], fill=BG)
        w = s * 0.58
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
        w = s * 0.72

    cx = s / 2
    body_w = w
    body_h = w * 0.62
    body_top = s / 2 - body_h * 0.10

    # Толщина округляется один раз и дальше используется везде. Если считать
    # bbox дуги по дробной толщине, а рисовать целой, на стыке с ножкой
    # остаётся ступенька в полпикселя.
    stroke = int(round(w * 0.115))
    half = stroke / 2

    # R — радиус ОСЕВОЙ линии дужки.
    #
    # PIL рисует дугу внутрь ограничивающего прямоугольника: внешний край
    # ложится на границу bbox, а осевая линия проходит по (радиус bbox - half).
    # Поэтому bbox расширяем на полтолщины — тогда осевая дуги совпадает с
    # ножками, поставленными по cx ± R. Раньше ножки стояли по радиусу bbox,
    # то есть на полтолщины наружу от концов дуги: дужка выглядела смещённой
    # и мельче, чем есть.
    R = body_w * 0.30
    arc_cy = body_top - body_h * 0.30

    d.arc(
        [cx - R - half, arc_cy - R - half, cx + R + half, arc_cy + R + half],
        start=180, end=0, fill=FG, width=stroke,
    )

    # Ножки заводим внутрь корпуса — стык перекрывается и не виден
    for x in (cx - R, cx + R):
        d.line([(x, arc_cy), (x, body_top + body_h * 0.2)], fill=FG, width=stroke)

    d.rounded_rectangle(
        [cx - body_w / 2, body_top, cx + body_w / 2, body_top + body_h],
        radius=int(body_h * 0.26), fill=FG,
    )

    # Скважина — вырез цветом фона
    kh_r = body_h * 0.155
    kh_cy = body_top + body_h * 0.40
    d.ellipse([cx - kh_r, kh_cy - kh_r, cx + kh_r, kh_cy + kh_r], fill=BG)
    d.rounded_rectangle(
        [cx - kh_r * 0.52, kh_cy, cx + kh_r * 0.52, kh_cy + body_h * 0.30],
        radius=int(kh_r * 0.52), fill=BG,
    )

    return img.resize((size, size), Image.LANCZOS)


# Запускать из каталога frontend:  python3 scripts/make-icons.py
if __name__ == "__main__":
    for size in (192, 512):
        draw(size, maskable=False).save(f"public/icon-{size}.png")
    draw(512, maskable=True).save("public/icon-maskable-512.png")
    print("иконки готовы")
