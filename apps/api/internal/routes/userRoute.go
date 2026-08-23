package routes

import (
	"net/http"

	controller "http-server/internal/controllers"

	middleware "http-server/internal/middlewares"
)

func UserRouter(app *http.ServeMux, ctrl *controller.Controller) {
	app.HandleFunc("GET /ws", middleware.Auth(middleware.CheckSession(ctrl.WsHandler)))

	app.HandleFunc("GET /createSession", middleware.Auth(ctrl.CreateSession))

	app.HandleFunc("GET /JoinSession/{id}", middleware.Auth(ctrl.JoinSession))

	app.HandleFunc("GET /init", ctrl.InitUser)

	app.HandleFunc("GET /me", middleware.Auth(ctrl.GetMe))
}
