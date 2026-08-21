# Contributing to PeerToss

Contributions that improve PeerToss while keeping it lightweight, direct, and privacy-focused are welcome.

## Getting Started

1. Fork and clone [the repository](https://github.com/RajanDhamala/peerToss).
2. Create a branch for your change.
3. Run the API and web app locally using the instructions in [README.md](README.md).
4. Keep changes focused and avoid adding persistent storage unless it is discussed first.

## Before Opening a Pull Request

Run the relevant checks:

```bash
cd apps/api
go test ./...
go build ./cmd/api
```

```bash
cd apps/web
pnpm install --frozen-lockfile
pnpm build
```

Then open a pull request with a short description of the change, why it is needed, and how it was tested. Include screenshots for visible UI changes.
