import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Litoreya",
  description: "Хранилище зашифрованной информации",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
