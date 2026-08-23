package middleware

import (
	"context"
	"fmt"
	"net/http"

	"http-server/internal/utils"
)

func Auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cookie, err := r.Cookie("client_id"); err == nil {
			claims, err := utils.VerifyUserToken(cookie.Value)

			if err == nil {
				ctx := context.WithValue(
					r.Context(),
					utils.UserKey,
					claims,
				)
				fmt.Println("userid:", claims.ID)

				next(w, r.WithContext(ctx))
				return
			}
		}

		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}
}
