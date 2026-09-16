# PHP 8.2 + Apache + mod_php — та же связка, что на shared хостинге.
# Версия зафиксирована намеренно: паритет сред теряет смысл при расхождении версий.
FROM php:8.2-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
        libicu-dev \
        libzip-dev \
        libonig-dev \
        unzip \
        git \
    && docker-php-ext-configure intl \
    && docker-php-ext-install -j"$(nproc)" pdo_mysql bcmath intl zip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# rewrite — для .htaccess, headers — для CSP и security-заголовков.
#
# expires включён не потому, что он нам нужен, а потому что он включён на
# хостинге: его ExpiresByType переспоривает Cache-Control из mod_headers.
# Без этого модуля локально расхождение не воспроизводится — оно всплыло
# только на проде, где sw.js приехал с max-age=86400 вместо no-store.
RUN a2enmod rewrite headers expires

# Opcache включаем явно: базовый образ его не активирует, а на хостинге он есть.
# Без него локально не воспроизводится единственный класс багов, специфичный для
# деплоя через симлинки — кеширование разрешённого пути current → releases/<ts>.
RUN docker-php-ext-enable opcache

# Код монтируется с хоста, и Apache должен писать в storage/ и bootstrap/cache.
# Подставить числовой uid через APACHE_RUN_USER нельзя: без записи в /etc/passwd
# Apache падает с "getpwuid: couldn't determine user name" и остаётся под root.
# Поэтому сдвигаем uid самого www-data к пользователю хоста.
ARG UID=1000
ARG GID=1000
RUN groupmod -o -g "${GID}" www-data \
    && usermod  -o -u "${UID}" -g "${GID}" www-data

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
ENV COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_HOME=/tmp/composer

COPY php.ini /usr/local/etc/php/conf.d/99-litoreya.ini

WORKDIR /var/www/laravel
