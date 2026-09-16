import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Litoreya",
  description: "Хранилище зашифрованной информации",
  appleWebApp: { capable: true, title: "Litoreya", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  // Приложение ставится на домашний экран: под вырезами телефона содержимое
  // должно доходить до краёв, а не упираться в белые поля
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>
        <ServiceWorker />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
