# Lux main 服务

服务端契约依据只读 `lux-music-server/src/server/api/{auth,sync,me,authGuard,errors}.ts`，以及 `src/server/app.ts` 的 server-info，审计日期 2026-11-07。测试 `tests/fixtures/lux-api.json` 仅含合成数据。

`LuxClient` 保留部署子路径，远程服务器要求 HTTPS（本机 mock 可用 HTTP），拒绝 URL 凭据、query 和 fragment。客户端固定绑定 canonical server；所有认证请求禁止重定向，无自动重试。传输异常及 HTTP 错误仅返回固定类别与状态码，不保留原始异常、URL、响应消息或请求体。

登录/邀请注册必须具有 accessToken、accessTokenExpiresAt、refreshToken、sessionId 及 active managed user。旧 token 被丢弃；不降级到不绑定会话的旧认证。服务端新增字段默认不透传。profile、sync key 留在 main，后续 provider 只能通过绑定身份的会话访问。

M4a 不改 renderer 页面；账号区实际 Electron 脱敏截图在 M4c 接入账号界面时补充，不能将当前基础设施测试冒充界面验收。

`SessionVault` 将版本化、白名单化的 server/user/device/session 结构交给 Electron safeStorage。文件通过同目录临时文件原子替换，权限 0600；不保存密码、旧 token 或同步密钥。Linux `basic_text`/`unknown`、原生加密不可用时只保留内存会话，状态明确返回 `memory/unavailable`。读取失败保留文件并报告 `unreadable`；显式新登录可替换旧文件。内存模式的新登录会先移除旧身份文件，避免重启恢复错账号；清除/写入失败返回固定 storage 错误。单元测试用合成 AES-GCM 边界验证密文和文件行为，不宣称验证 Windows DPAPI 或 macOS Keychain。

`LuxSession` 将客户端固定到登录时的服务器；设备 UUID 在 main 为每次登录生成并随该身份加密保存。恢复后用 me 校验 user.id；离线/429/5xx 保留缓存身份并标记未验证，可显式重试。refresh 同一生命周期合并为一个 promise；迟到的旧 token 401 复用已刷新凭据；单次请求最多执行两次，第二次 401 或 refresh 401 清除撤销身份。不会因临时错误清除会话。

退出先清除本机保存并取消请求，再尽力远端撤销，`remoteRevoked=false` 明确表示远端未确认。切换/停用 provider 调用 `cancelRequests()`；revision 与身份检查阻止已取消的响应持久化或发布到新账号。刷新写盘失败保留新凭据于内存、尝试移除已花费的磁盘 refresh，并报告 memory/write_failed。所有供 provider 使用的 authorize/client/sync key 仅限 main；M4b 仍需实施 socket 和数据空间事务。
