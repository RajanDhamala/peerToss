package middleware

import (
	"context"
	"net/http"

	"http-server/internal/utils"
)

func CheckSession(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "unauthorized session token", http.StatusUnauthorized)
			return
		}

		claims, err := utils.VerifySessionToken(cookie.Value)
		if err != nil {
			http.Error(w, "unauthorized session token", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(
			r.Context(),
			utils.SessionKey,
			claims,
		)

		next(w, r.WithContext(ctx))
	}
}
