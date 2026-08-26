"use client";

import { useEffect, useState } from "react";
import { getHealth, type Health } from "@/lib/api";
import styles from "./page.module.css";

/*
 * Заглушка фазы 0: проверяет, что цепочка браузер → Apache → Laravel → MySQL
 * собрана целиком. В фазе 1 это место занимает экран логина/регистрации.
 *
 * Запрос обязан идти с клиента: при статическом экспорте серверного рендеринга
 * в рантайме нет, а на этапе сборки API недоступен.
 */
export default function Page() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Litoreya</h1>
      <p className={styles.subtitle}>Хранилище зашифрованной информации</p>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Состояние стека</h2>

        {error && <p className={styles.down}>API недоступен: {error}</p>}

        {!error && !health && <p className={styles.muted}>Проверка…</p>}

        {health && (
          <dl className={styles.grid}>
            <dt>Статус</dt>
            <dd className={health.status === "ok" ? styles.up : styles.down}>
              {health.status}
            </dd>

            <dt>PHP</dt>
            <dd>{health.php}</dd>

            <dt>Laravel</dt>
            <dd>{health.laravel}</dd>

            <dt>MySQL</dt>
            <dd className={health.database === "up" ? styles.up : styles.down}>
              {health.database}
            </dd>
          </dl>
        )}
      </section>
    </main>
  );
}
