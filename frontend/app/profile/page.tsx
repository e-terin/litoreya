"use client";

import { ProfilePage } from "@/components/ProfilePage";
import { SessionGate } from "@/components/SessionGate";

/**
 * Статический экспорт превращает это в out/profile/index.html. Каталог Apache
 * отдаёт напрямую (правило «существующие файлы и каталоги» в .htaccess), а
 * редирект /profile → /profile/ делает mod_dir — правки конфигов не нужны.
 */
export default function Page() {
  return (
    <SessionGate anonymous="redirect">
      <ProfilePage />
    </SessionGate>
  );
}
