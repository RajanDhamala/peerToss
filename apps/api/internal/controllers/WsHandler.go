package controller

import (
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	pongWait   = 65 * time.Second
	pingPeriod = 60 * time.Second
	writeWait  = 10 * time.Second
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" {
			return true
		}
		return false
	},
}

type WsMessage struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

func (c *Controller) WsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("failed to upgrade connection:", err)
		return
	}
	conn.SetReadLimit(24 * 1024) // 24 kb max palyload size

	// Initial read deadline.
	conn.SetReadDeadline(time.Now().Add(pongWait))

	// Every pong proves the client is still alive.
	conn.SetPongHandler(func(string) error {
		fmt.Println("PONG")
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	NewUUid := uuid.NewString()
	msg := WsMessage{}

	defer conn.Close()
	conn.WriteMessage(websocket.TextMessage, []byte("connected"))
	conn.WriteJSON(map[string]string{
		"SocketId": NewUUid,
	})

	done := make(chan struct{})

	go func() {
		ticker := time.NewTicker(pingPeriod)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				conn.SetWriteDeadline(time.Now().Add(writeWait))
				fmt.Println("PING")

				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}()

	defer close(done)

	for {
		err := conn.ReadJSON(&msg)
		if err != nil {
			fmt.Println("client disconnected:", err)
			break
		}
		fmt.Println("event:", msg.Event, "msg:", msg.Data)

		switch msg.Event {
		case "test":
			fmt.Println("got to the test event")
		case "demo":
			fmt.Println("got to the demo event")
		case "base":
			fmt.Println("got to the base event")
		default:
			return
		}

	}
}
