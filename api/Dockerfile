# Debonaire API: the container for the public demo (D18, B15).
#
# Local development does not use this file. It runs on `php -S`, as the
# README's "Install and run" describes.
#
# Build and try it from the repo root:
#   docker build -t debonaire-api api
#   docker run --rm -p 8080:10000 -e DEBONAIRE_ALLOWED_ORIGINS=http://localhost:3000 debonaire-api
# The API is then on http://127.0.0.1:8080.

# An exact PHP release, not a moving tag such as 8.5-apache. Render keeps
# copies of the images it pulls, so a moving tag could quietly build on an
# older PHP. To update PHP, change this one line.
ARG PHP_IMAGE=php:8.5.12-apache

# ---- Stage 1: install the production PHP packages ---------------------------
FROM ${PHP_IMAGE} AS vendor

# Composer needs unzip to unpack packages, and the official image has none.
# Only this stage needs it, so it never reaches the running container.
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip \
 && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY composer.json composer.lock ./
COPY src ./src
# --no-dev leaves out PHPUnit: the live copy does not run tests. Composer
# also stops here if an ext-* requirement in composer.json is missing.
RUN composer install --no-dev --no-interaction --no-progress --prefer-dist --optimize-autoloader

# ---- Stage 2: the container that runs ----------------------------------------
FROM ${PHP_IMAGE}

# Refuse to build on a PHP without the October 2026 "PHP2Shell" fixes
# (CVE-2026-109618, CVE-2026-109619) or without an extension the API needs.
# `composer install` from a lock file checks neither the patch level nor
# the extensions of this stage, so the build checks them itself.
RUN php -r 'exit(version_compare(PHP_VERSION, "8.5.12", ">=") ? 0 : 1);' \
      || { echo "PHP $(php -r 'echo PHP_VERSION;') lacks the PHP2Shell fixes. Use 8.5.12 or later." >&2; exit 1; } \
 && for ext in curl json mbstring openssl pdo pdo_sqlite; do \
      php -m | grep -qix "$ext" || { echo "PHP extension missing: $ext" >&2; exit 1; }; \
    done

# PHP's own production settings, plus a few overrides (errors to the log only).
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
COPY docker/php.ini "$PHP_INI_DIR/conf.d/zz-debonaire.ini"

# Apache: serve api/public, send every path to index.php, listen on $PORT.
# The Listen line lives in apache.conf, so the image's ports.conf is emptied.
COPY docker/apache.conf /etc/apache2/sites-available/000-default.conf
RUN : > /etc/apache2/ports.conf

WORKDIR /var/www/api
COPY --from=vendor /app/vendor ./vendor
COPY composer.json ./
COPY public ./public
COPY src ./src
COPY database ./database

COPY docker/start.sh /usr/local/bin/debonaire-start
RUN chmod 0755 /usr/local/bin/debonaire-start

# Render's default port. Render sets PORT itself, and it can be overridden.
ENV PORT=10000
EXPOSE 10000
CMD ["debonaire-start"]
