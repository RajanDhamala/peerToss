package routes

import (
	"net/http"

	controller "http-server/internal/controllers"

	middleware "http-server/internal/middlewares"
)

func UserRouter(app *http.ServeMux, ctrl *controller.Controller) {
	limitRoomRequests := middleware.NewRoomRequestLimiter()

	app.HandleFunc("GET /ws", middleware.Auth(limitRoomRequests(middleware.CheckSession(ctrl.WsHandler))))

	app.HandleFunc("GET /createSession", middleware.Auth(limitRoomRequests(ctrl.CreateSession)))

	app.HandleFunc("GET /JoinSession/{id}", middleware.Auth(limitRoomRequests(ctrl.JoinSession)))

	app.HandleFunc("GET /me", middleware.Auth(ctrl.GetMe))
}
