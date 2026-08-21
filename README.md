
# PeerToss

Peer-to-peer file, link, and clipboard sharing over WebRTC — fast, direct, and database-free.

## Features

* Direct peer-to-peer file sharing
* Share links and clipboard text
* WebRTC-based transfers
* WebSocket signaling
* No database required
* No permanent file storage
* Lightweight Go backend

## How It Works

PeerToss uses a WebSocket server for signaling between peers.

Once two peers establish a WebRTC connection, data is transferred directly between their devices.

```text
Peer A
   │
   │ WebSocket signaling
   ▼
PeerToss Server
   │
   │ WebSocket signaling
   ▼
Peer B

After WebRTC connection:

Peer A  ───────── WebRTC ─────────>  Peer B
          direct data transfer
```

The server does not store transferred files or clipboard data.

## Tech Stack

### Frontend

* React
* TypeScript
* WebRTC
* WebSocket
* Tailwind CSS

### Backend

* Go
* Gorilla WebSocket

## Development

Start the backend:

```bash
go run .apps/api/cmd/api/main.go
```

Or build the server:

```bash
go build -o server .apps/api/cmd/api/main.go
./server
```

Start the frontend:

```bash
cd apps/web
npm install
npm run dev
```

## Status

PeerToss is currently under development.

## License

MIT
