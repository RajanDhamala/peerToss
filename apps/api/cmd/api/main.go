package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/joho/godotenv"
	"http-server/internal/controllers"
	"http-server/internal/routes"
)

func main() {
	app := http.NewServeMux()
	err := godotenv.Load()
	if err != nil {
		fmt.Println("failed to load env")
	}

	port := os.Getenv("PORT")
	host := os.Getenv("HOST")

	ctrl := controller.NewController("test")

	if host == "" || port == "" {
		panic("no host name env found")
	}

	routes.UserRouter(app, ctrl)

	fmt.Println("server running on port", port)

	if err := http.ListenAndServe(":"+port, app); err != nil {
		fmt.Println("server error:", err)
	}
}
