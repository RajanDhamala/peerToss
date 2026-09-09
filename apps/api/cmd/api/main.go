package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"

	"http-server/internal/controllers"
	"http-server/internal/routes"

	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	app := http.NewServeMux()
	err := godotenv.Load()
	if err != nil {
		fmt.Println("failed to load env")
	}

	port := os.Getenv("PORT")
	host := os.Getenv("HOST")
	domain := strings.TrimSpace(os.Getenv("DOMAIN"))

	ctrl := controller.NewController()

	if host == "" || port == "" || domain == "" {
		panic("HOST, PORT, and DOMAIN are required")
	}

	routes.UserRouter(app, ctrl)
	app.HandleFunc("GET /metrics", func(w http.ResponseWriter, r *http.Request) {
		promhttp.Handler().ServeHTTP(w, r)
	})

	address := net.JoinHostPort(host, port)
	fmt.Println("server running on", address)

	if err := http.ListenAndServe(address, app); err != nil {
		fmt.Println("server error:", err)
	}
}
