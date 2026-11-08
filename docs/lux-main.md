# Lux main 服务

服务端契约依据只读 `lux-music-server/src/server/api/{auth,sync,me,authGuard,errors}.ts`，以及 `src/server/app.ts` 的 server-info，审计日期 2026-11-07。测试 `tests/fixtures/lux-api.json` 仅含合成数据。

`LuxClient` 保留部署子路径，远程服务器要求 HTTPS（本机 mock 可用 HTTP），拒绝 URL 凭据、query 和 fragment。客户端固定绑定 canonical server；所有认证请求禁止重定向，无自动重试。传输异常及 HTTP 错误仅返回固定类别与状态码，不保留原始异常、URL、响应消息或请求体。

登录/邀请注册必须具有 accessToken、accessTokenExpiresAt、refreshToken、sessionId 及 active managed user。旧 token 被丢弃；不降级到不绑定会话的旧认证。服务端新增字段默认不透传。profile、sync key 留在 main，后续 provider 只能通过绑定身份的会话访问。

M4a 不改 renderer 页面；账号区实际 Electron 脱敏截图在 M4c 接入账号界面时补充，不能将当前基础设施测试冒充界面验收。

`SessionVault` 将版本化、白名单化的 server/user/device/session 结构交给 Electron safeStorage。文件通过同目录临时文件原子替换，权限 0600；不保存密码、旧 token 或同步密钥。Linux `basic_text`/`unknown`、原生加密不可用时只保留内存会话，状态明确返回 `memory/unavailable`。读取失败保留文件并报告 `unreadable`；显式新登录可替换旧文件。内存模式的新登录会先移除旧身份文件，避免重启恢复错账号；清除/写入失败返回固定 storage 错误。单元测试用合成 AES-GCM 边界验证密文和文件行为，不宣称验证 Windows DPAPI 或 macOS Keychain。

`LuxSession` 将客户端固定到登录时的服务器；设备 UUID 在 main 为每次登录生成并随该身份加密保存。恢复后用 me 校验 user.id；离线/429/5xx 保留缓存身份并标记未验证，可显式重试。refresh 同一生命周期合并为一个 promise；迟到的旧 token 401 复用已刷新凭据；单次请求最多执行两次，第二次 401 或 refresh 401 清除撤销身份。不会因临时错误清除会话。

退出先清除本机保存并取消请求，再尽力远端撤销，`remoteRevoked=false` 明确表示远端未确认。切换/停用 provider 调用 `cancelRequests()`；revision 与身份检查阻止已取消的响应持久化或发布到新账号。刷新写盘失败保留新凭据于内存、尝试移除已花费的磁盘 refresh，并报告 memory/write_failed。所有供 provider 使用的 authorize/client/sync key 仅限 main；M4b 仍需实施 socket 和数据空间事务。

Renderer 通过 `@common/luxRenderer.invokeLux` 和 `@common/luxIpc` 的命令/响应映射调用固定 `lux:account` channel。只允许已持有的主窗口主 frame、原应用 document；导航到其他地址或子 frame 被拒绝且不返回账号状态。输入按 action 验证并拒绝未知字段，renderer 无 token、设备 ID、任意 URL+Bearer 或 sync key 操作。登录/恢复/退出 IPC 互斥；状态可随时读取。所有返回值再投影白名单，错误只返回固定 kind/status，未知异常不携带 message/stack/cause；不写日志。

main 注册后自动尝试恢复，失败保持未验证状态，显式 restore IPC 可重试并取得固定错误。凭据文件在 userData/LuxSession 下，与原列表数据和导出分离。该 IPC 来源检查没有改变应用已有 Node-enabled renderer 的整体威胁模型，不能替代未来的 Electron 隔离迁移。M4c 负责接入交互和实际账号区截图。

M4b 使用 main 单例的 `requestSyncKey()`，由当前身份提供已保存的设备 UUID，不能向该方法传入其他 server/device/account。返回的 key 仅供 main socket 适配，不进入快照、IPC 或磁盘。

会话/设备 IPC：`sessions`、`devices`、`revoke_session(handle)`、`revoke_device(handle)`、`revoke_others`。列表只含随机 handle、名称、平台/移动标志、时间与 current；raw session ID、client ID、device ID、同步密钥与服务端附加字段均不透传。句柄在同一生命周期内稳定，账号/服务器切换或退出后全部失效，main registry 上限 4096。撤销只接收已登记且类别相符的句柄，URL ID 在 main 编码；未知/旧句柄不会发请求。

撤销当前 HTTP session 成功后立即清除本机身份；revoke-others 由绑定 sid 的认证保留当前会话；删除同步设备只撤销其同步凭据，保留 HTTP 登录。临时错误保留身份。M4b 负责同步连接状态的相应更新；renderer 不应把同步设备删除误称为所有登录会话退出。

退出的远端确认必须来自成功 logout 响应。仅 accessToken 过期/无效产生的 401 不代表 refresh 会话已撤销：本机清除后，main 在旧服务器上以分离凭据私下刷新（提前过期或首次 401 时），最多重试一次 logout。刷新返回 sid 必须匹配旧会话；第二次 401、refresh 失败或临时错误都返回 remoteRevoked=false。此路径不保存刷新结果，不修改当前身份，新登录或退出不会被迟到响应覆盖。
