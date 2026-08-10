import { useCallback, useEffect, useState } from "react";
import { Check, CircleNotch, Database, HardDrives, LinkSimple, ShieldCheck, UserGear, Users, X } from "@phosphor-icons/react";
import { adminApi } from "./lib/api";

const formatDate = (value) => value ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—";

function Meter({ icon: Icon, label, value, detail }) {
  return (
    <div className="admin-meter">
      <Icon size={22} />
      <span><small>{label}</small><strong>{value}</strong></span>
      <em>{detail}</em>
    </div>
  );
}

export function AdminPanel({ open, onClose, currentUser }) {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy("load"); setError("");
    try {
      const [system, people, channels] = await Promise.all([adminApi.overview(), adminApi.users(), adminApi.endpoints()]);
      setOverview(system); setUsers(people.items || []); setEndpoints(channels.items || []);
    } catch (loadError) { setError(loadError.message); }
    finally { setBusy(""); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const handler = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const setRole = async (user, role) => {
    setBusy(`role-${user.id}`); setError("");
    try {
      await adminApi.setRole(user.id, role);
      setUsers((items) => items.map((item) => item.id === user.id ? { ...item, role } : item));
    } catch (roleError) { setError(roleError.message); }
    finally { setBusy(""); }
  };

  const addEndpoint = async (event) => {
    event.preventDefault();
    setBusy("endpoint-add"); setError("");
    try {
      await adminApi.addEndpoint({ name, baseUrl });
      setName(""); setBaseUrl(""); await load();
    } catch (endpointError) { setError(endpointError.message); setBusy(""); }
  };

  const toggleEndpoint = async (endpoint) => {
    setBusy(`endpoint-${endpoint.id}`); setError("");
    try {
      const next = await adminApi.updateEndpoint(endpoint.id, { enabled: !endpoint.enabled });
      setEndpoints((items) => items.map((item) => item.id === endpoint.id ? next : item));
    } catch (endpointError) { setError(endpointError.message); }
    finally { setBusy(""); }
  };

  if (!open) return null;
  return (
    <div className="admin-shell" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <header className="admin-header">
        <div className="admin-brand"><ShieldCheck size={28} weight="duotone" /><span><small>MiMo Studio · Restricted Console</small><strong id="admin-title">SYSTEM ADMINISTRATION</strong></span></div>
        <div className="admin-operator"><span><small>ACTIVE OPERATOR</small><strong>{currentUser?.name || currentUser?.email}</strong></span><button onClick={onClose} aria-label="关闭管理员页面"><X size={22} /></button></div>
      </header>

      <main className="admin-deck">
        <section className="admin-overview" aria-label="系统概览">
          <div className="admin-section-heading"><span>01</span><div><small>SYSTEM TELEMETRY</small><h2>运行概览</h2></div>{busy === "load" && <CircleNotch className="spin" size={18} />}</div>
          <div className="admin-meter-bank">
            <Meter icon={Users} label="REGISTERED USERS" value={overview?.counts?.users ?? "—"} detail="账户" />
            <Meter icon={HardDrives} label="AUDIO ASSETS" value={overview?.counts?.audio ?? "—"} detail="文件" />
            <Meter icon={Database} label="GENERATION JOBS" value={overview?.counts?.jobs ?? "—"} detail={`${overview?.counts?.failed ?? "—"} failed`} />
            <Meter icon={LinkSimple} label="ACTIVE CHANNELS" value={overview?.counts?.endpoints ?? "—"} detail="API" />
          </div>
          <div className="health-strip">
            <span data-state={overview?.health?.database === "ready" ? "ready" : "error"}><i />DATABASE {overview?.health?.database?.toUpperCase() || "CHECKING"}</span>
            <span data-state={overview?.health?.storage === "ready" ? "ready" : "warn"}><i />R2 STORAGE {overview?.health?.storage?.toUpperCase() || "CHECKING"}</span>
          </div>
        </section>

        <section className="admin-module admin-users">
          <div className="admin-section-heading"><span>02</span><div><small>IDENTITY & ACCESS</small><h2>用户与权限</h2></div></div>
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>用户</th><th>注册日期</th><th>验证</th><th>角色</th></tr></thead>
              <tbody>{users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.name || "未命名用户"}</strong><small>{user.email}</small>{user.id === currentUser?.id && <em>CURRENT</em>}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td><span className={`admin-badge ${user.emailVerified ? "ok" : "idle"}`}>{user.emailVerified ? "VERIFIED" : "PENDING"}</span></td>
                  <td><select aria-label={`设置 ${user.email} 的角色`} value={user.role || "user"} disabled={Boolean(busy)} onChange={(event) => setRole(user, event.target.value)}><option value="user">USER</option><option value="admin">ADMIN</option></select></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className="admin-module admin-endpoints">
          <div className="admin-section-heading"><span>03</span><div><small>UPSTREAM ALLOWLIST</small><h2>API 通道白名单</h2></div></div>
          <div className="endpoint-rack">
            {endpoints.map((endpoint) => (
              <div className="endpoint-unit" key={endpoint.id} data-enabled={endpoint.enabled ? "true" : "false"}>
                <i /><span><strong>{endpoint.name}</strong><small>{endpoint.baseUrl}</small></span>
                {endpoint.isSystem && <em>SYSTEM</em>}
                <button disabled={Boolean(busy)} onClick={() => toggleEndpoint(endpoint)}>{busy === `endpoint-${endpoint.id}` ? <CircleNotch className="spin" /> : endpoint.enabled ? "停用" : "启用"}</button>
              </div>
            ))}
          </div>
          <form className="endpoint-form" onSubmit={addEndpoint}>
            <label><span>通道名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Enterprise Gateway" required minLength={2} /></label>
            <label><span>HTTPS Base URL</span><input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://gateway.example.com/v1" required /></label>
            <button disabled={Boolean(busy)}>{busy === "endpoint-add" ? <CircleNotch className="spin" /> : <Check weight="bold" />}加入白名单</button>
          </form>
          <p className="endpoint-note">只有启用的 HTTPS 通道可以接收用户密钥；本地、内网、带认证信息或查询参数的地址会被拒绝。</p>
        </section>
        {error && <button className="admin-error" onClick={() => setError("")}><span>{error}</span><X /></button>}
      </main>
    </div>
  );
}
