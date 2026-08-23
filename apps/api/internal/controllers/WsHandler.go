package controller

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"time"

	utils "http-server/internal/utils"

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
	SessionId string
	Conn      *websocket.Conn
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
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

func (c *Controller) WsHandler(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value(utils.UserKey).(*utils.UserJWT)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	seesionInfo, ok := r.Context().Value(utils.SessionKey).(*utils.SessionJWT)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if seesionInfo.UserId != user.ID {
		fmt.Println("unauthorized access attempt")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "attempt to unauthorize access found",
		})
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("failed to upgrade connection:", err)
		return
	}
	NewUUid := uuid.NewString()
	client := Client{
		Conn:      conn,
		SessionId: seesionInfo.ID,
	}
	ActiveClients[user.ID] = &client
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
		_, ok := ActiveClients[user.ID]
		if ok != true {
			fmt.Println("session not found to flush")
		}
		fmt.Println("socket instance flushed")
		delete(ActiveClients, user.ID)
	}()

	conn.WriteMessage(websocket.TextMessage, []byte("connected"))
	conn.WriteJSON(map[string]string{
		"SocketId": NewUUid,
	})

	if seesionInfo.Role == "creator" {
		data := Session{
			ID:        seesionInfo.ID,
			CreatedBy: user.ID,
			User1:     ActiveClients[user.ID],
			State:     "waiting",
			ExpiresAt: time.Now().Add(60 * time.Second),
		}
		fmt.Println("creator has joined ws")
		ActiveSessions[seesionInfo.ID] = &data
	} else {
		fmt.Println("particpant has joined")
		data, ok := ActiveSessions[seesionInfo.ID]
		if !ok {
			fmt.Println("session not found")

			conn.WriteControl(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(
					websocket.CloseNormalClosure,
					"session not found or expired",
				),
				time.Now().Add(writeWait),
			)

			return
		}

		data.User2 = &client

		owner, ok := ActiveClients[data.CreatedBy]
		if !ok {
			conn.WriteControl(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(
					websocket.CloseNormalClosure,
					"session owner disconnected",
				),
				time.Now().Add(writeWait),
			)

			return
		}
		fmt.Println("sending the ws repsonse")

		if err := owner.Conn.WriteJSON(WsMessage{
			Event: "user-joined",
		}); err != nil {
			fmt.Println("failed to notify user1:", err)
		}
	}
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

	type WebrtcOffer struct {
		Sdp  string `json:"sdp"`
		Type string `json:"type"`
	}

	for {
		err := conn.ReadJSON(&msg)
		if err != nil {
			fmt.Println("client disconnected:", err)
			break
		}
		fmt.Println("event:", msg.Event)

		switch msg.Event {
		case "test":
			fmt.Println("got to the test event")
		case "demo":
			fmt.Println("got to the demo event")
		case "create-offer":
			fmt.Println("got the ofer event btw")

			resthai, ok := ActiveSessions[seesionInfo.ID]
			payload := map[string]any{
				"event": "recieve-offer",
				"data":  msg.Data,
			}
			fmt.Println("creadby:", resthai.CreatedBy, "init:", user.ID)

			if resthai.CreatedBy != user.ID {
				resthai.User1.Conn.WriteJSON(payload)
				if !ok {
					fmt.Println("error aayoo haai")
					return
				}
			} else {
				resthai.User2.Conn.WriteJSON(payload)
				if !ok {
					fmt.Println("error aayoo haai")
					return
				}
			}

		case "create-answer":
			fmt.Println("got the anser event btw")

			resthai, ok := ActiveSessions[seesionInfo.ID]
			payload := map[string]any{
				"event": "recieve-answer",
				"data":  msg.Data,
			}

			if user.ID != resthai.CreatedBy {
				resthai.User1.Conn.WriteJSON(payload)
				if !ok {
					fmt.Println("error aayoo haai")
					return
				}
			} else {
				resthai.User2.Conn.WriteJSON(payload)
				if !ok {
					fmt.Println("error aayoo haai")
					return
				}
			}

		case "send-ice-candiate":
			fmt.Println("got the ice-candiate event btw")

			resthai, ok := ActiveSessions[seesionInfo.ID]
			payload := map[string]any{
				"event": "ack-ice-candidate",
				"data":  msg.Data,
			}

			if user.ID != resthai.CreatedBy {
				resthai.User1.Conn.WriteJSON(payload)
				if !ok {
					fmt.Println("err while sending ice")
					return
				}
			} else {
				resthai.User2.Conn.WriteJSON(payload)
				if !ok {
					fmt.Println("seems user unavilable")
					return
				}
			}
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
	user, ok := r.Context().Value(utils.UserKey).(*utils.UserJWT)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	fmt.Println("ready to start the ws session btw")

	// assume currenly its user socket/id ok hardcoded for now
	newCode, err := generateCode(6)
	if err != nil {
		fmt.Println("error while genrating code")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "failed to create session",
		})
	}

	response := map[string]string{
		"message":    "session created succesfully",
		"session_id": newCode,
	}
	newToken, err := utils.CreateSessionToken(newCode, user.ID, "creator")
	if err != nil {
		fmt.Println("error while jwt creation")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "internal  server error",
		})
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    newToken,
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		Expires:  time.Now().Add(60 * time.Second),
	})
	json.NewEncoder(w).Encode(&response)
}

type JoinSessionPayload struct {
	Code      string `json:"code"`
	SessionId string `json:"session_id"`
}

func (c *Controller) JoinSession(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := r.Context().Value(utils.UserKey).(*utils.UserJWT)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	sessionID := r.PathValue("id")

	session, ok := ActiveSessions[sessionID]
	if !ok {
		http.Error(w, "invalid or expired session", http.StatusNotFound)
		return
	}

	if time.Now().After(session.ExpiresAt) {
		delete(ActiveSessions, sessionID)
		http.Error(w, "session expired", http.StatusGone)
		return
	}

	newToken, err := utils.CreateSessionToken(sessionID, currentUser.ID, "participant")
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    newToken,
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		Expires:  time.Now().Add(60 * time.Second),
	})

	json.NewEncoder(w).Encode(map[string]string{
		"message": "session found successfully",
	})
}
