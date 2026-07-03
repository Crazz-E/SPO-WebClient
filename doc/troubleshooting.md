# Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | `npm install`, Node.js >= 18 |
| Tests fail | `npm run test:verbose` |
| RDO errors | Verify type prefixes (#, %, !, etc.) — [rdo-protocol-architecture.md §2](rdo-protocol-architecture.md) ; error grammar §7.1 |
| WebSocket disconnect | Check game server status |
| Port 8080 in use | `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process` |
