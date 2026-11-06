# Offline behavior tests

Run `npm test` (or `node scripts/test-unit.cjs`) after installing the project's
locked dependencies. Tests use Node's built-in `node:test` runner and the existing
TypeScript compiler; there is no additional test framework.

The suite executes the checked-in production functions for theme generation,
music-data migration/cleaning, playlist sorting/search/duplicate review/queue
selection, sync URL parsing/compression/encryption, lyric-font playback lifecycle,
and common list operations.
Assertions cover observable results and failure cases, including reverse sorting,
the 1024-character compression boundary, invalid frames, missing metadata, Unicode,
bulk list operations crossing chunk boundaries, and playlist history/dislike rules.

`request-node16.test.cjs` additionally runs real HTTP requests against a temporary
server bound to `127.0.0.1`. The same seven cases verify redirect budgets, disabled
redirects, query encoding, JSON POST data, and raw response bytes using real Undici
7 and the `undici-legacy` alias of Undici 5. Each version gets its own real Agent;
no HTTP implementation is mocked.
No test contacts a public service, requires credentials, or invokes the upstream
music-provider `api-test` scripts.

`helpers/load-source.cjs` transpiles whole TypeScript/JavaScript modules to CommonJS in memory
and resolves the application's webpack aliases. For playlist and sync-URL tests,
only unrelated filesystem/metadata/network boundaries are replaced by functions
that throw if called. The tested functions and their pure dependencies are loaded
from source; tests do not carry copies of their implementations. This loader does
not replace the project's separate TypeScript check.

These tests establish the existing behavior baseline. Electron UI, audio playback,
IPC, native modules, package installation, and external music-provider availability
need the corresponding build/runtime/smoke verification and are not proved by this
suite.
# 同步管理接口边界

`sync-action.test.cjs` 在 manager 边界使用 stub，验证未就绪 peer 的拒绝、RPC 等待接口完成和 manager 拒绝的传播。它不能证明实际文件系统持久化：现有 manager 返回时节流磁盘写入可能仍未完成。真实落盘/故障恢复由后续同步集成检查点验证。
