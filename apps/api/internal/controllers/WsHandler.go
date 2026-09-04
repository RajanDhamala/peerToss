package controller

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	utils "http-server/internal/utils"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"
)

const (
	pongWait       = 65 * time.Second
	pingPeriod     = 60 * time.Second
	writeWait      = 10 * time.Second
	wsMessageRate  = rate.Limit(2)
	wsMessageBurst = 40
	wsMessageLimit = 64 * 1024
)

func isAllowedWebSocketOrigin(r *http.Request) bool {
	origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
	trustedOrigin := strings.TrimRight(strings.TrimSpace(os.Getenv("DOMAIN")), "/")

	return origin != "" && trustedOrigin != "" && origin == trustedOrigin
}

var upgrader = websocket.Upgrader{
	CheckOrigin: isAllowedWebSocketOrigin,
}

type Client struct {
	SessionId string
	Conn      *websocket.Conn
	Send      chan any
	Done      chan struct{}
	CloseOnce sync.Once
	Limiter   *rate.Limiter
}

func (client *Client) Close() {
	client.CloseOnce.Do(func() {
		close(client.Done)
		client.Conn.Close()
	})
}

func sendClientMessage(client *Client, message any) bool {
	if client == nil {
		return false
	}

	select {
	case <-client.Done:
		return false
	default:
	}

	select {
	case client.Send <- message:
		return true
	case <-client.Done:
		return false
	}
}

type Session struct {
	ID    string
	User1 *Client
	User2 *Client
}

func getSessionPeer(session *Session, client *Client) *Client {
	if session == nil || client == nil {
		return nil
	}

	if session.User1 == client {
		return session.User2
	}
	if session.User2 == client {
		return session.User1
	}

	return nil
}

var (
	ActiveSessions = make(map[string]*Session)
	SessionsMu     sync.RWMutex
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
		json.NewEncoder(w).Encode(map[string]string{
			"error": "attempt to unauthorize access found",
		})
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	NewUUid := uuid.NewString()
	client := Client{
		Conn:      conn,
		SessionId: seesionInfo.ID,
		Send:      make(chan any, 5),
		Done:      make(chan struct{}),
		Limiter:   rate.NewLimiter(wsMessageRate, wsMessageBurst),
	}

	go func() {
		ticker := time.NewTicker(pingPeriod)
		defer ticker.Stop()

		for {
			select {

			case msg := <-client.Send:
				conn.SetWriteDeadline(time.Now().Add(writeWait))
				err := client.Conn.WriteJSON(msg)
				if err != nil {
					client.Close()
					return
				}

			case <-ticker.C:
				conn.SetWriteDeadline(time.Now().Add(writeWait))
				fmt.Println("PING")
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					client.Close()
					return
				}
			case <-client.Done:
				return
			}
		}
	}()

	conn.SetReadLimit(wsMessageLimit)

	// Initial read deadline.
	conn.SetReadDeadline(time.Now().Add(pongWait))

	// Every pong proves the client is still alive.
	conn.SetPongHandler(func(string) error {
		fmt.Println("PONG")
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	// cleanup
	defer func() {
		client.Close()

		SessionsMu.Lock()
		activeSession := ActiveSessions[seesionInfo.ID]
		if activeSession != nil &&
			(activeSession.User1 == &client || activeSession.User2 == &client) {
			delete(ActiveSessions, seesionInfo.ID)
		}
		SessionsMu.Unlock()
	}()

	conn.WriteMessage(websocket.TextMessage, []byte("connected"))
	sendClientMessage(&client, map[string]string{
		"SocketId": NewUUid,
	})

	if seesionInfo.Role == "creator" {
		data := Session{
			ID:    seesionInfo.ID,
			User1: &client,
		}
		SessionsMu.Lock()
		ActiveSessions[seesionInfo.ID] = &data
		SessionsMu.Unlock()
	} else {
		SessionsMu.Lock()
		data, ok := ActiveSessions[seesionInfo.ID]
		if ok {
			data.User2 = &client
		}
		SessionsMu.Unlock()
		if !ok {

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

		if !sendClientMessage(data.User1, WsMessage{Event: "user-joined"}) {
			return
		}

	}

	type WebrtcOffer struct {
		Sdp  string `json:"sdp"`
		Type string `json:"type"`
	}

	for {
		// Keep each queued payload on its own backing buffer. Reusing one
		// WsMessage lets a later ICE read overwrite data still being written.
		msg := WsMessage{}
		err := conn.ReadJSON(&msg)
		if err != nil {
			fmt.Printf(
				"websocket read ended: session=%s role=%s error=%v\n",
				seesionInfo.ID,
				seesionInfo.Role,
				err,
			)
			break
		}
		if !client.Limiter.Allow() {
			_ = conn.WriteControl(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(
					websocket.ClosePolicyViolation,
					"signaling rate limit exceeded",
				),
				time.Now().Add(writeWait),
			)
			return
		}

		switch msg.Event {
		case "create-offer":
			fmt.Println("offer")

			SessionsMu.RLock()
			resthai, ok := ActiveSessions[seesionInfo.ID]
			if !ok {
				SessionsMu.RUnlock()
				return
			}

			peer := getSessionPeer(resthai, &client)
			SessionsMu.RUnlock()

			payload := map[string]any{
				"event": "recieve-offer",
				"data":  msg.Data,
			}

			if !sendClientMessage(peer, payload) {
				return
			}

		case "create-answer":

			fmt.Println("answer")

			SessionsMu.RLock()
			resthai, ok := ActiveSessions[seesionInfo.ID]
			if !ok {
				SessionsMu.RUnlock()
				// meaning season not found so we will return teh err
				// simple return invokes the orginal defer fxn and flushes all stuff
				return
			}

			peer := getSessionPeer(resthai, &client)
			SessionsMu.RUnlock()

			payload := map[string]any{
				"event": "recieve-answer",
				"data":  msg.Data,
			}

			if !sendClientMessage(peer, payload) {
				return
			}

		case "send-ice-candidate", "send-ice-candiate":

			fmt.Println("ice-candidate")

			SessionsMu.RLock()
			resthai, ok := ActiveSessions[seesionInfo.ID]
			if !ok {
				SessionsMu.RUnlock()
				// meaing session not found so we will drop ws conn as we cannot establish handshake without it
				// simple return invokes the orginal defer fxn and flushes all stuff
				return
			}

			peer := getSessionPeer(resthai, &client)
			SessionsMu.RUnlock()

			payload := map[string]any{
				"event": "ack-ice-candidate",
				"data":  msg.Data,
			}

			if !sendClientMessage(peer, payload) {
				return
			}

		default:
			continue
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

	// assume currenly its user socket/id ok hardcoded for now
	newCode, err := generateCode(6)
	if err != nil {
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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "internal  server error",
		})
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    newToken,
		HttpOnly: true,
		Secure:   os.Getenv("COOKIE_SECURE") == "true",
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

	SessionsMu.RLock()
	_, ok = ActiveSessions[sessionID]
	SessionsMu.RUnlock()
	if !ok {
		http.Error(w, "invalid or expired session", http.StatusNotFound)
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
		Secure:   os.Getenv("COOKIE_SECURE") == "true",
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		Expires:  time.Now().Add(60 * time.Second),
	})

	json.NewEncoder(w).Encode(map[string]string{
		"message": "session found successfully",
	})
}
