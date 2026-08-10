import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle, CircleNotch, Key, LockKey, Microphone, UserPlus, Waveform } from "@phosphor-icons/react";
import { authClient } from "./lib/auth";

const labels = {
  signin: { eyebrow: "AUTHORIZED ACCESS", title: "登录控制台", button: "登录设备", alternate: "创建新账户" },
  signup: { eyebrow: "NEW OPERATOR", title: "注册账户", button: "注册并进入", alternate: "返回登录" },
  forgot: { eyebrow: "RECOVERY CHANNEL", title: "找回密码", button: "发送重置邮件", alternate: "返回登录" },
  reset: { eyebrow: "SECURE RESET", title: "设置新密码", button: "更新密码", alternate: "返回登录" },
};

export function AuthScreen() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token"), []);
  const [mode, setMode] = useState(token ? "reset" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const copy = labels[mode];

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if ((mode === "signup" || mode === "reset") && password !== confirmPassword) throw new Error("两次输入的密码不一致");
      if (password && password.length < 12) throw new Error("密码至少需要 12 个字符");
      if (mode === "signin") {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(result.error.message || "登录失败");
        window.location.replace(window.location.pathname);
      } else if (mode === "signup") {
        const result = await authClient.signUp.email({ name: name.trim(), email, password });
        if (result.error) throw new Error(result.error.message || "注册失败");
        if (result.data?.user) window.location.replace(window.location.pathname);
        else setMessage("注册完成，请检查邮箱后再登录。");
      } else if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}${window.location.pathname}` });
        if (result.error) throw new Error(result.error.message || "无法发送重置邮件");
        setMessage("如果该邮箱存在，重置邮件已经发出。");
      } else {
        const result = await authClient.resetPassword({ token, newPassword: password });
        if (result.error) throw new Error(result.error.message || "密码更新失败");
        window.history.replaceState({}, "", window.location.pathname);
        switchMode("signin");
        setMessage("密码已更新，请重新登录。");
      }
    } catch (submitError) {
      setError(submitError.message || "操作失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-device" aria-labelledby="auth-title">
        <header className="auth-brand">
          <span className="brand-mark"><Waveform size={24} weight="bold" /></span>
          <div><strong>MiMo <em>Studio</em></strong><small>V2.5 VOICE INSTRUMENT</small></div>
        </header>
        <aside className="auth-hardware" aria-hidden="true">
          <span className="auth-reel"><Microphone size={44} weight="duotone" /></span>
          <div><small>SECURE SIGNAL PATH</small><strong>PRIVATE<br />VOICE<br />INSTRUMENT</strong></div>
          <span className="auth-lamps"><i /><i /><i /></span>
        </aside>
        <form className="auth-console" onSubmit={submit}>
          <div className="auth-heading"><span className="eyebrow">{copy.eyebrow}</span><h1 id="auth-title">{copy.title}</h1><p>账户、API 密钥和音频资料库均按用户隔离。</p></div>
          <div className="auth-display"><LockKey size={18} /><span>ENCRYPTED SESSION</span><strong>{mode === "signup" ? "REGISTER" : mode === "signin" ? "STANDBY" : "RECOVERY"}</strong><i /></div>
          {mode === "signup" && <label><span>显示名称</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="你的名字" /></label>}
          {mode !== "reset" && <label><span>邮箱</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="name@example.com" /></label>}
          {mode !== "forgot" && <label><span>{mode === "reset" ? "新密码" : "密码"}</span><input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} placeholder="至少 12 个字符" /></label>}
          {(mode === "signup" || mode === "reset") && <label><span>确认密码</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} maxLength={128} placeholder="再次输入密码" /></label>}
          {error && <div className="auth-message error" role="alert">{error}</div>}
          {message && <div className="auth-message success" role="status"><CheckCircle size={17} />{message}</div>}
          <button className="auth-submit" disabled={busy}>{busy ? <CircleNotch className="spin" size={20} /> : mode === "signup" ? <UserPlus size={20} /> : <Key size={20} />}<span>{busy ? "处理中" : copy.button}</span><ArrowRight size={17} /></button>
          <div className="auth-links">
            <button type="button" onClick={() => switchMode(mode === "signup" ? "signin" : mode === "signin" ? "signup" : "signin")}>{copy.alternate}</button>
            {mode === "signin" && <button type="button" onClick={() => switchMode("forgot")}>忘记密码</button>}
          </div>
        </form>
        <footer className="auth-footer"><span>STUDIO HYBRID</span><span>AUTH CHANNEL · TLS REQUIRED</span></footer>
      </section>
    </main>
  );
}

