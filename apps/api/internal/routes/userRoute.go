package routes

import (
	"net/http"

	controller "http-server/internal/controllers"

	middleware "http-server/internal/middlewares"
)

func UserRouter(app *http.ServeMux, ctrl *controller.Controller) {
	app.HandleFunc("GET /ws", ctrl.WsHandler)

	app.HandleFunc("GET /createSession", ctrl.CreateSession)

	app.HandleFunc("GET /JoinSession/{id}", ctrl.JoinSession)

	app.HandleFunc("GET /init", ctrl.InitUser)

	app.HandleFunc("GET /me", middleware.Auth(ctrl.GetMe))
}
