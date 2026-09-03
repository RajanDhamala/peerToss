package middleware

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	utils "http-server/internal/utils"

	"golang.org/x/time/rate"
)

const (
	roomRequestsPerMinuteEnv     = "ROOM_REQUESTS_PER_MINUTE"
	defaultRoomRequestsPerMinute = 12
	limiterEntryTTL              = 2 * time.Hour
	limiterCleanupInterval       = time.Hour
)

type userLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type userLimiterStore struct {
	mu          sync.Mutex
	entries     map[string]*userLimiterEntry
	limit       rate.Limit
	burst       int
	retryAfter  time.Duration
	lastCleanup time.Time
}

func newUserLimiterStore(eventsPerMinute, burst int) *userLimiterStore {
	return &userLimiterStore{
		entries:     make(map[string]*userLimiterEntry),
		limit:       rate.Every(time.Minute / time.Duration(eventsPerMinute)),
		burst:       burst,
		retryAfter:  time.Minute / time.Duration(eventsPerMinute),
		lastCleanup: time.Now(),
	}
}

func (store *userLimiterStore) allow(userID string) (bool, time.Duration) {
	now := time.Now()

	store.mu.Lock()
	if now.Sub(store.lastCleanup) >= limiterCleanupInterval {
		for id, entry := range store.entries {
			if now.Sub(entry.lastSeen) >= limiterEntryTTL {
				delete(store.entries, id)
			}
		}
		store.lastCleanup = now
	}

	entry := store.entries[userID]
	if entry == nil {
		entry = &userLimiterEntry{
			limiter:  rate.NewLimiter(store.limit, store.burst),
			lastSeen: now,
		}
		store.entries[userID] = entry
	} else {
		entry.lastSeen = now
	}
	limiter := entry.limiter
	store.mu.Unlock()

	return limiter.Allow(), store.retryAfter
}

func NewRoomRequestLimiter() func(http.HandlerFunc) http.HandlerFunc {
	requestsPerMinute := defaultRoomRequestsPerMinute
	if configuredLimit, err := strconv.Atoi(os.Getenv(roomRequestsPerMinuteEnv)); err == nil && configuredLimit > 0 {
		requestsPerMinute = configuredLimit
	}

	store := newUserLimiterStore(requestsPerMinute, requestsPerMinute)
	return func(next http.HandlerFunc) http.HandlerFunc {
		return limitAnonymousUser(store, "too many room requests", next)
	}
}

func limitAnonymousUser(store *userLimiterStore, message string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := r.Context().Value(utils.UserKey).(*utils.UserJWT)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		allowed, retryAfter := store.allow(user.ID)
		if !allowed {
			retryAfterSeconds := max(
				1,
				int((retryAfter+time.Second-1)/time.Second),
			)
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":               message,
				"retry_after_seconds": retryAfterSeconds,
			})
			return
		}

		next(w, r)
	}
}
