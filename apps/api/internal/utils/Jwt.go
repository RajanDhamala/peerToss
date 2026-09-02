package utils

import (
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type UserJWT struct {
	ID string
}

type SessionJWT struct {
	ID     string
	UserId string
	Role   string
}

type tokenClaims struct {
	ID string `json:"id"`
	// Username string `json:"username"`
	jwt.RegisteredClaims
}

type sessionClaims struct {
	ID     string `json:"id"`
	UserId string `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func CreateUserToken(id string) (string, tokenClaims, error) {
	claims := tokenClaims{
		ID: id,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(3 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(os.Getenv("JWT_TOKEN")))
	if err != nil {
		return "", tokenClaims{}, err
	}

	return token, claims, nil
}

func CreateSessionToken(id string, userId string, role string) (string, error) {
	claims := sessionClaims{
		ID:     id,
		UserId: userId,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(60 * time.Second)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
		SignedString([]byte(os.Getenv("SESSION_TOKEN")))
}

func VerifyUserToken(tokenString string) (*UserJWT, error) {
	claims := &tokenClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(os.Getenv("JWT_TOKEN")), nil
	})
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid access token")
	}
	return &UserJWT{ID: claims.ID}, nil
}

func VerifySessionToken(tokenString string) (*SessionJWT, error) {
	claims := &sessionClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(os.Getenv("SESSION_TOKEN")), nil
	})
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid access token")
	}
	return &SessionJWT{ID: claims.ID, UserId: claims.UserId, Role: claims.Role}, nil
}
