import type { MetadataRoute } from "next";

/**
 * Манифест PWA. При output: 'export' превращается в статический
 * /manifest.webmanifest — рантайма для него не нужно.
 *
 * force-static обязателен: для Next это route handler, и без явного указания
 * сборка статического экспорта падает с «dynamic not configured on route».
 */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Litoreya",
    short_name: "Litoreya",
    description: "Хранилище зашифрованной информации",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ru",
    // Цвета из globals.css: фон светлой темы и графит, на котором иконка
    background_color: "#ffffff",
    theme_color: "#18181b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // Систему интересует отдельная версия: обычную иконку она обрежет
        // по своей форме и срежет углы рисунка
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
