<div align="center">

# PeerToss

### Toss files, links, and clipboard text directly between devices.

Fast peer-to-peer sharing with a QR code or short pairing code—no accounts, database, uploads, or permanent storage.

[![Build](https://github.com/RajanDhamala/peerToss/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/RajanDhamala/peerToss/actions/workflows/deploy.yml)
![WebRTC](https://img.shields.io/badge/transfer-WebRTC-333333?logo=webrtc&logoColor=white)
![Database Free](https://img.shields.io/badge/database-none-16a34a)

</div>

## What It Does

PeerToss creates a temporary connection between two browsers. One person opens a session and shares its QR code or pairing code; the other joins and can immediately exchange files, links, and clipboard text.

- **Direct transfer** — shared content travels through a WebRTC data channel.
- **Quick pairing** — connect with a short code or a QR scan.
- **Private by design** — the signaling server cannot read or store transferred content.
- **Zero persistence** — no user accounts, database, or permanent file storage.

## Architecture

```mermaid
flowchart LR
    A["Device A<br/>React client"]
    S["Go signaling server<br/>WebSocket"]
    B["Device B<br/>React client"]

    A -->|"1 · Create session"| S
    S -->|"2 · Pairing code"| A
    B -->|"3 · Join with code or QR"| S
    S -.->|"4 · WebRTC negotiation"| A
    S -.->|"4 · WebRTC negotiation"| B
    A ==>|"5 · WebRTC data channel<br/>Files · Links · Clipboard"| B

    classDef peer fill:#eff6ff,stroke:#2563eb,color:#172554,stroke-width:2px;
    classDef server fill:#f8fafc,stroke:#64748b,color:#0f172a,stroke-width:2px;
    class A,B peer;
    class S server;
```

The WebSocket server is only the introduction layer: it pairs the devices and passes the information needed to establish WebRTC. Once connected, the encrypted shared payload moves directly between the peers.

## Tech Stack

<p align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go" />
  <img src="https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white" alt="WebRTC" />
  <img src="https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="WebSocket" />
  <img src="https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm" />
</p>

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web client | React + TypeScript | Pairing UI, QR flow, and sharing experience |
| Signaling | Go + WebSocket | Session coordination and WebRTC negotiation |
| Transfer | WebRTC data channels | Direct peer-to-peer content delivery |

## Run Locally

Start the signaling server:

```bash
cd apps/api
go run ./cmd/api
```

In another terminal, start the web client:

```bash
cd apps/web
pnpm install
pnpm dev
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the setup and pull-request checklist.
