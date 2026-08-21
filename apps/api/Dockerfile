
FROM golang:1.22-alpine AS build
WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /runtime .

FROM alpine:3.20
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build --chown=appuser:appgroup /runtime ./runtime

USER appuser
EXPOSE 3000
CMD ["./runtime"]
