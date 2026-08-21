package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"http-server/internal/utils"
)

type contextKey string

const userContextKey contextKey = "user"

func Auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cookie, err := r.Cookie("accessToken"); err == nil {
			claims, err := utils.VerifyAccessToken(cookie.Value)
			if err == nil {
				next(w, r.WithContext(context.WithValue(r.Context(), userContextKey, claims)))
				return
			}
		}

		cookie, err := r.Cookie("refreshToken")
		if err != nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		claims, err := utils.VerifyRefreshToken(cookie.Value)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid refresh token")
			return
		}

		accessToken, err := utils.CreateAccessToken(claims.ID, claims.Username)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "create access token failed")
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "accessToken",
			Value:    accessToken,
			HttpOnly: true,
			Secure:   os.Getenv("COOKIE_SECURE") == "true",
			SameSite: http.SameSiteLaxMode,
			Path:     "/",
			Expires:  time.Now().Add(15 * time.Minute),
		})

		next(w, r.WithContext(context.WithValue(r.Context(), userContextKey, claims)))
	}
}

func UserFromContext(ctx context.Context) (*utils.UserJWT, bool) {
	claims, ok := ctx.Value(userContextKey).(*utils.UserJWT)
	return claims, ok
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
