.DEFAULT_GOAL := help
.PHONY: help setup dev prodlike release down clean shell artisan migrate test

DC := docker compose

help: ## Показать список команд
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: ## Первичная настройка окружения
	@test -f .env || (cp .env.example .env && echo "создан .env")
	@test -f backend/.env || (cp backend/.env.example backend/.env && echo "создан backend/.env")
	$(DC) --profile dev run --rm api php artisan key:generate
	$(MAKE) migrate
	@echo "Готово. Дальше: make dev"

dev: ## Dev-режим: Next :3000 + Laravel API :8080
	$(DC) --profile dev up

prodlike: release ## Prod-like: раскладка хостинга под Apache :8081
	$(DC) --profile prodlike up

release: ## Собрать deploy/public_html
	./bin/build-release.sh

down: ## Остановить всё
	$(DC) --profile dev --profile prodlike down

clean: ## Остановить и удалить том БД
	$(DC) --profile dev --profile prodlike down -v

shell: ## Shell внутри контейнера PHP
	$(DC) --profile dev run --rm api bash

artisan: ## Произвольная artisan-команда: make artisan CMD="route:list"
	$(DC) --profile dev run --rm api php artisan $(CMD)

migrate: ## Накатить миграции
	$(DC) --profile dev run --rm api php artisan migrate --force

test: ## Тесты бэкенда
	$(DC) --profile dev run --rm api php artisan test
