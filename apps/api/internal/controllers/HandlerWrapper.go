package controller

import (
	"github.com/prometheus/client_golang/prometheus"
)

type Controller struct {
	ActiveConnections prometheus.Gauge
	ActiveRooms       prometheus.Gauge
}

func NewController() *Controller {
	activeConnections := prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "ws_active_connections",
			Help: "Current number of active WebSocket connections.",
		},
	)

	activeRooms := prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "ws_active_rooms",
			Help: "Current number of active WebSocket rooms.",
		},
	)

	prometheus.MustRegister(
		activeConnections,
		activeRooms,
	)

	return &Controller{
		ActiveConnections: activeConnections,
		ActiveRooms:       activeRooms,
	}
}
