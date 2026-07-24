"use client";

import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    api<{ user: unknown }>("/api/auth/me").then(({ user }) => user && router.replace("/"));
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password")
        })
      });
      if (mode === "register") {
        setMode("login");
        setPassword("");
        setSuccess("注册成功，请使用刚才的用户名登录。");
      } else {
        router.replace("/");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="paper auth-card fade-up">
        <span className="eyebrow">Gathering ballot · 聚会选票</span>
        <h1 style={{ fontSize: "clamp(2.7rem, 12vw, 4.8rem)", marginTop: 18 }}>今晚<br />投什么？</h1>
        <p className="muted">别吵了，排个顺序。</p>
        <form className="form-grid" onSubmit={submit}>
          <label>
            <span><UserRound size={15} /> 用户名</span>
            <input name="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入真名，例如：王狗蛋" minLength={2} required />
          </label>
          <label>
            <span><LockKeyhole size={15} /> 密码 <small className="muted">（可不填）</small></span>
            <input name="password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="留空就是无密码账号" minLength={password ? 6 : undefined} />
          </label>
          <div className="notice">无密码账号可以被任何知道你真名的人登录，请不要用它管理敏感活动。</div>
          {error && <p className="error" role="alert">{error}</p>}
          {success && <p className="success" role="status">{success}</p>}
          <button className="button primary" disabled={busy}>
            {busy ? "请稍候…" : mode === "login" ? "登录并入席" : "创建账号"} <ArrowRight size={18} />
          </button>
        </form>
        <button className="button small" style={{ marginTop: 15, width: "100%" }} onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "第一次来？创建账号" : "已有账号？返回登录"}
        </button>
      </section>
    </main>
  );
}
