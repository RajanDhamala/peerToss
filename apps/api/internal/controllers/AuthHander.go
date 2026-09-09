package controller

import (
	"encoding/json"
	"net/http"

	utils "http-server/internal/utils"
)

func (c *Controller) GetMe(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value(utils.UserKey).(*utils.UserJWT)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"message": "user id found in cookie",
		"user_id": user.ID,
	})
}
