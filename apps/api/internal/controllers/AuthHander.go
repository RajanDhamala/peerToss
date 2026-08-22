package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"

	utils "http-server/internal/utils"
)

type contextKey string

const userContextKey contextKey = "user"

func (c *Controller) InitUser(w http.ResponseWriter, r *http.Request) {
	newUserId := uuid.NewString()

	NewToken, err := utils.CreateUserToken(newUserId)
	if err != nil {
		fmt.Println("error while creating token")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "failed to create token",
		})
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "client_id",
		Value:    NewToken,
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		Expires:  time.Now().Add(24 * 3 * time.Hour),
	})
}

func (c *Controller) GetMe(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value(userContextKey).(*utils.UserJWT)

	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}
	fmt.Println("user id:", user.ID)
	json.NewEncoder(w).Encode(map[string]string{
		"meesge":  "user id found in cookie",
		"uder_id": user.ID,
	})
}
