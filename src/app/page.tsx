"use client";

import { CalendarPlus, KeyRound, LogOut, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { phaseLabels, getActivityPhase, type ActivityPhase } from "@/lib/domain/activity";
import { api, type CurrentUser } from "@/lib/client-api";

interface ActivitySummary {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  managerUserId: string | null;
  managerUsername: string | null;
  nominationEndsAt: string | null;
  votingEndsAt: string | null;
  candidateCount: number;
}

function formatDate(value: string | null) {
  if (!value) return "等待管理员设置";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createRequestId, setCreateRequestId] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const me = await api<{ user: CurrentUser | null }>("/api/auth/me");
      if (!me.user) return router.replace("/login");
      setUser(me.user);
      const data = await api<{ activities: ActivitySummary[] }>("/api/activities");
      setActivities(data.activities);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCreateBusy(true);
    try {
      const { activity } = await api<{ activity: ActivitySummary }>("/api/activities", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          eventDate: form.get("eventDate"),
          description: form.get("description"),
          clientRequestId: createRequestId
        })
      });
      router.push(`/activities/${activity.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setCreateBusy(false);
    }
  }

  function openCreateDialog() {
    setCreateRequestId(crypto.randomUUID());
    setShowCreate(true);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">票</span>
          <div><strong>今晚投什么？</strong><div className="muted">一人一张排序</div></div>
        </div>
        <div className="toolbar">
          <span className="muted">{user?.username ?? "入席中…"}</span>
          {user && <button className="button small" onClick={() => setShowPassword(true)}><KeyRound size={16} /> {user.hasPassword ? "修改密码" : "设置密码"}</button>}
          <button className="button small" onClick={logout}><LogOut size={16} /> 退出</button>
        </div>
      </header>

      <section className="paper hero fade-up">
        <div className="hero-copy">
          <span className="eyebrow">No shouting, just ranking</span>
          <h1>把喜欢的，<br />排在前面。</h1>
          <p>每个人维护一份顺序。截止之后，答案自然浮上来。</p>
          <div className="toolbar">
            <button className="button stamp" onClick={openCreateDialog}><CalendarPlus size={19} /> 发起一场聚会</button>
          </div>
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="grid">
        {activities.map((activity, index) => {
          const phase = getActivityPhase(
            activity.nominationEndsAt ? new Date(activity.nominationEndsAt) : null,
            activity.votingEndsAt ? new Date(activity.votingEndsAt) : null
          );
          return (
            <Link className="paper card fade-up" style={{ "--i": index + 1 } as React.CSSProperties} href={`/activities/${activity.id}`} key={activity.id}>
              <span className={`badge ${phase}`}>{phaseLabels[phase]}</span>
              <h2 style={{ marginTop: 17, marginBottom: 8 }}>{activity.title}</h2>
              <div className="eyebrow">{formatEventDate(activity.eventDate)}</div>
              <p className="muted">{activity.description || "这张选票还没有备注。"}</p>
              <div className="card-footer">
                <div><UsersRound size={17} /> {activity.candidateCount} 个候选</div>
                <small className="muted">{deadlineLabel(phase, activity)}</small>
              </div>
            </Link>
          );
        })}
      </div>
      {!activities.length && <div className="empty paper"><h2>桌上还没有选票</h2><p className="muted">发起第一场活动，把链接发给朋友。</p></div>}

      {showCreate && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <form className="paper modal form-grid" onSubmit={createActivity}>
            <h2 id="create-title">发起一场聚会</h2>
            <label>聚会日期<input name="eventDate" type="date" defaultValue={todayForInput()} autoFocus required /></label>
            <label>活动名称 <small className="muted">（可不填，默认使用日期）</small><input name="title" placeholder="例如：周六晚上吃什么" maxLength={80} /></label>
            <label>补充说明<textarea name="description" placeholder="地点、预算或其他约定（可不填）" maxLength={500} /></label>
            <div className="toolbar"><button className="button primary" disabled={createBusy}>{createBusy ? "创建中…" : "创建选票"}</button><button type="button" className="button" onClick={() => setShowCreate(false)}>取消</button></div>
          </form>
        </div>
      )}
      {showPassword && user && (
        <PasswordDialog
          hasPassword={user.hasPassword}
          onClose={() => setShowPassword(false)}
          onChanged={() => {
            setUser({ ...user, hasPassword: true });
            setShowPassword(false);
          }}
        />
      )}
    </main>
  );
}

function PasswordDialog({
  hasPassword,
  onClose,
  onChanged
}: {
  hasPassword: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: form.get("currentPassword") ?? "",
          newPassword: form.get("newPassword"),
          confirmPassword: form.get("confirmPassword")
        })
      });
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "密码更新失败");
    }
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="password-title">
      <form className="paper modal form-grid" onSubmit={submit}>
        <span className="eyebrow">Account security</span>
        <h2 id="password-title">{hasPassword ? "修改密码" : "为账号设置密码"}</h2>
        {!hasPassword && <div className="notice">设置后，其他人不能再只凭你的用户名登录。</div>}
        {hasPassword && <label>原密码<input name="currentPassword" type="password" autoComplete="current-password" required /></label>}
        <label>新密码<input name="newPassword" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>
        <label>再次输入新密码<input name="confirmPassword" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="toolbar"><button className="button primary">{hasPassword ? "保存新密码" : "设置密码"}</button><button type="button" className="button" onClick={onClose}>取消</button></div>
      </form>
    </div>
  );
}

function deadlineLabel(phase: ActivityPhase, activity: ActivitySummary) {
  if (phase === "setup") return "待设置时间";
  if (phase === "nomination") return `征集至 ${formatDate(activity.nominationEndsAt)}`;
  if (phase === "voting") return `排序至 ${formatDate(activity.votingEndsAt)}`;
  return `结束于 ${formatDate(activity.votingEndsAt)}`;
}

function todayForInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatEventDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}
