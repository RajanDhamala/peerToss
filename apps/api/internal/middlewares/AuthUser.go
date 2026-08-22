package middleware

import (
	"context"
	"net/http"

	"http-server/internal/utils"
)

type contextKey string

const userContextKey contextKey = "user"

func Auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cookie, err := r.Cookie("session_id"); err == nil {
			claims, err := utils.VerifyUserToken(cookie.Value)

			if err == nil {
				ctx := context.WithValue(
					r.Context(),
					userContextKey,
					claims,
				)

				next(w, r.WithContext(ctx))
				return
			}
		}

		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}
}
