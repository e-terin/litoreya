import type { NextConfig } from "next";

/*
 * Два режима, различающиеся принципиально.
 *
 * production — `output: 'export'`: статический экспорт в out/, потому что на shared
 * хостинге нет Node. SSR, Server Actions, Route Handlers и rewrites недоступны.
 *
 * development — обычный dev-сервер + rewrite /api/* на Apache. Это даёт браузеру
 * тот же single-origin, что и в проде: cookie-сессия Sanctum ведёт себя одинаково,
 * CORS не нужен ни там, ни там.
 *
 * Разводить обязательно: при output:'export' Next 16 роняет с ошибкой и `next dev`,
 * если в конфиге присутствуют rewrites.
 */

const isDev = process.env.NODE_ENV === "development";

// Внутри compose-сети Apache доступен по имени сервиса.
const apiOrigin = process.env.API_ORIGIN ?? "http://api";

const nextConfig: NextConfig = {
  // Каталоги вместо .html-файлов — так Apache отдаёт /dashboard/ через DirectoryIndex
  // без дополнительных правил в .htaccess.
  trailingSlash: true,

  // Оптимизатор картинок требует Node в рантайме, которого на хостинге нет.
  images: { unoptimized: true },

  ...(isDev
    ? {
        rewrites: async () => [
          {
            source: "/api/:path*",
            destination: `${apiOrigin}/api/:path*`,
          },
        ],

        // trailingSlash заставляет dev-сервер отвечать 308 и на /api/*, чего
        // в проде не происходит: там статику отдаёт Apache, а Laravel получает
        // путь как есть. Без этого флага каждый вызов API в dev — лишний редирект
        // и расхождение сред. Редирект для страниц в проде делает mod_dir.
        skipTrailingSlashRedirect: true,
      }
    : { output: "export" as const }),
};

export default nextConfig;
