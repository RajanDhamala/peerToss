package controller

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
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

type Client struct {
	ID   string
	Conn *websocket.Conn
}

type Session struct {
	ID        string
	CreatedBy string
	User1     *Client
	User2     *Client
	State     string
	ExpiresAt time.Time
}

var (
	ActiveClients  = make(map[string]*Client)
	ActiveSessions = make(map[string]*Session)
)

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
	NewUUid := uuid.NewString()
	client := Client{
		ID:   NewUUid,
		Conn: conn,
	}
	ActiveClients[NewUUid] = &client

	conn.SetReadLimit(24 * 1024) // 24 kb max palyload size

	// Initial read deadline.
	conn.SetReadDeadline(time.Now().Add(pongWait))

	// Every pong proves the client is still alive.
	conn.SetPongHandler(func(string) error {
		fmt.Println("PONG")
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	msg := WsMessage{}

	// cleanup
	defer func() {
		conn.Close()
		_, ok := ActiveClients[NewUUid]
		if ok != true {
			fmt.Println("session not found to flush")
		}
		delete(ActiveClients, NewUUid)
	}()

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
		case "send-message":
			fmt.Println("got to the message")
		default:
			return
		}

	}
}

const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateCode(length int) (string, error) {
	code := make([]byte, length)

	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			return "", err
		}

		code[i] = chars[n.Int64()]
	}

	return string(code), nil
}

func (c *Controller) CreateSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	fmt.Println("ready to start the ws session btw")

	// assume currenly its user socket/id ok hardcoded for now
	userid := "test123"
	newCode, err := generateCode(6)
	if err != nil {
		fmt.Println("error while genrating code")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "failed to create session",
		})
	}

	data := Session{
		ID:        newCode,
		CreatedBy: userid,
		User1:     ActiveClients[userid],
		State:     "pending",
		ExpiresAt: time.Now().Add(60 * time.Second),
	}
	ActiveSessions[newCode] = &data
	response := map[string]string{
		"message":    "session created succesfully",
		"session_id": newCode,
	}
	json.NewEncoder(w).Encode(&response)
}

type JoinSessionPayload struct {
	Code      string `json:"code"`
	SessionId string `json:"session_id"`
}

func (c *Controller) JoinSession(w http.ResponseWriter, r *http.Request) {
	// data := JoinSessionPayload{}
	sessionId := r.PathValue("id")

	// if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
	// 	fmt.Println("error while reading body")
	// 	json.NewEncoder(w).Encode(map[string]string{
	// 		"error": "failed to parse body",
	// 	})
	// }
	//
	if data, ok := ActiveSessions[sessionId]; ok {
		data.State = "completed"
		json.NewEncoder(w).Encode(map[string]string{
			"message": "session found succesfully",
		})
	} else {
		fmt.Println("session not found")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "invalid or expired session",
		})
	}
}
