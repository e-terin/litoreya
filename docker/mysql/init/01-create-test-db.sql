-- Отдельная БД под тесты. Прогонять их на SQLite нельзя: посты хранятся
-- бинарными блобами, а поведение типов, strict mode и utf8mb4 у SQLite и MySQL
-- расходится — ровно те различия, которые обязаны вскрываться в тестах.
--
-- Скрипт выполняется только при инициализации пустого тома. Если том уже создан,
-- пересоздать: make clean && make setup
CREATE DATABASE IF NOT EXISTS litoreya_test
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON litoreya_test.* TO 'litoreya'@'%';
FLUSH PRIVILEGES;
