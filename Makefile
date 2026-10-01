.PHONY:build api web 

API_PATH:=apps/api
WEB_PATH:=apps/web

build:
	cd $(API_PATH) && go build -o api ./cmd/api
	cd $(WEB_PATH) && pnpm run build 

api:
	cd $(API_PATH) && go run ./cmd/api

web:
	cd $(WEB_PATH) && pnpm run dev

