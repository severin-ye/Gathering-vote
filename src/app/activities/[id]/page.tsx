"use client";

import { ArrowLeft, CalendarClock, Crown, Pencil, Plus, Trash2, UserMinus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { RankingBoard } from "@/components/ranking-board";
import { api, type CurrentUser } from "@/lib/client-api";
import { phaseLabels, type ActivityPhase } from "@/lib/domain/activity";

interface Candidate {
  id: string;
  name: string;
  description: string;
  createdById: string;
  createdByUsername: string;
  createdAt: string;
}
interface ActivityDetail {
  activity: {
    id: string;
    title: string;
    description: string;
    eventDate: string;
    managerUserId: string | null;
    managerUsername: string | null;
    nominationEndsAt: string | null;
    votingEndsAt: string | null;
    phase: ActivityPhase;
    updatedAt: string;
  };
  candidates: Candidate[];
  ownBallot: string[];
  results: { candidateId: string; score: number; rankCounts: number[] }[] | null;
  voterCount: number;
}

export default function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<ActivityDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await api<{ user: CurrentUser | null }>("/api/auth/me");
      if (!me.user) return router.replace("/login");
      setUser(me.user);
      setData(await api<ActivityDetail>(`/api/activities/${id}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);
  if (!data || !user) return <main className="shell"><div className="paper panel">正在铺开选票…</div></main>;

  const { activity, candidates } = data;
  const isManager = activity.managerUserId === user.id;
  const canNominate = activity.phase === "setup" || activity.phase === "nomination";

  async function mutate(path: string, method: string, body?: object) {
    try {
      setError("");
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
      return false;
    }
  }

  async function saveCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await mutate(
      editing ? `/api/activities/${id}/candidates/${editing.id}` : `/api/activities/${id}/candidates`,
      editing ? "PATCH" : "POST",
      { name: form.get("name"), description: form.get("description") }
    );
    if (saved) {
      setEditing(null);
      formElement.reset();
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="button small" href="/"><ArrowLeft size={16} /> 所有活动</Link>
        <span className={`badge ${activity.phase}`}>{phaseLabels[activity.phase]}</span>
      </header>

      <section className="paper hero fade-up">
        <div className="hero-copy">
          <span className="eyebrow">Ranked gathering ballot · {formatEventDate(activity.eventDate)}</span>
          <h1>{activity.title}</h1>
          <p>{activity.description || "这场活动没有额外说明。"}</p>
          <div className="toolbar">
            {activity.managerUsername ? <span className="badge"><Crown size={15} /> 管理员：{activity.managerUsername}</span> : <button className="button stamp" onClick={() => mutate(`/api/activities/${id}/manager`, "POST")}><Crown size={17} /> 申领管理员</button>}
            {isManager && <button className="button danger small" onClick={() => mutate(`/api/activities/${id}/manager`, "DELETE")}><UserMinus size={16} /> 解除管理</button>}
            {isManager && <button className="button danger small" onClick={() => setShowDelete(true)}><Trash2 size={16} /> 删除这个活动</button>}
          </div>
          {!user.hasPassword && isManager && <div className="notice">你的账号没有密码。任何知道“{user.username}”的人都能以管理员身份登录。</div>}
        </div>
      </section>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="split">
        <div>
          <section className="paper panel fade-up" style={{ "--i": 1 } as React.CSSProperties}>
            <h2>{activity.phase === "closed" ? "最终候选" : "拖拽我的排序"} <small className="muted">· {candidates.length}</small></h2>
            {activity.phase !== "closed" ? (
              <RankingBoard
                candidates={candidates}
                initialOrder={data.ownBallot}
                onSave={async (candidateIds) => {
                  const saved = await mutate(`/api/activities/${id}/ballot`, "PUT", { candidateIds });
                  if (!saved) throw new Error("排序保存失败");
                }}
                renderActions={(candidate) =>
                  canNominate && (candidate.createdById === user.id || isManager) ? (
                    <div className="toolbar">
                      <button type="button" className="button small" aria-label={`修改 ${candidate.name}`} onClick={() => setEditing(candidates.find((item) => item.id === candidate.id) ?? null)}><Pencil size={15} /></button>
                      <button type="button" className="button small danger" aria-label={`删除 ${candidate.name}`} onClick={() => mutate(`/api/activities/${id}/candidates/${candidate.id}`, "DELETE")}><Trash2 size={15} /></button>
                    </div>
                  ) : null
                }
              />
            ) : (
              candidates.map((candidate) => (
                <div className="candidate" key={candidate.id}>
                  <span className="rank-number">·</span>
                  <div className="candidate-copy">
                    <h3>{candidate.name}</h3>
                    <small className="muted">{candidate.description || `由 ${candidate.createdByUsername} 添加`}</small>
                  </div>
                </div>
              ))
            )}
            {!candidates.length && <div className="empty">还没有候选项，先写下一张。</div>}
          </section>

          {canNominate && (
            <form className="paper panel form-grid" onSubmit={saveCandidate}>
              <h2>{editing ? `修改“${editing.name}”` : "添加候选项"}</h2>
              <label>候选名称<input key={editing?.id ?? "new-name"} name="name" defaultValue={editing?.name} placeholder="火锅、桌游、看电影…" minLength={2} maxLength={100} required /></label>
              <label>一句说明<textarea key={editing?.id ?? "new-description"} name="description" defaultValue={editing?.description} placeholder="可不填" maxLength={500} /></label>
              <div className="toolbar"><button className="button primary"><Plus size={17} /> {editing ? "保存修改" : "加入清单"}</button>{editing && <button type="button" className="button" onClick={() => setEditing(null)}>取消</button>}</div>
            </form>
          )}
        </div>

        <aside>
          <section className="paper panel fade-up" style={{ "--i": 2 } as React.CSSProperties}>
            <h2><CalendarClock size={22} /> 时间安排</h2>
            <p><strong>候选截止</strong><br /><span className="muted">{formatDate(activity.nominationEndsAt)}</span></p>
            <p><strong>排序截止</strong><br /><span className="muted">{formatDate(activity.votingEndsAt)}</span></p>
            {isManager && <DeadlineForm activity={activity} onSave={async (body) => { await mutate(`/api/activities/${id}/deadlines`, "PUT", body); }} />}
            {!activity.managerUserId && <div className="notice">申领管理员后才能设置两个截止时间。</div>}
          </section>
        </aside>
      </div>

      {activity.phase === "nomination" && <section className="paper panel notice"><strong>候选仍在征集中。</strong>你可以随时保存当前排序；新候选会自动追加到末尾。</section>}
      {activity.phase === "setup" && <section className="paper panel notice"><strong>等待管理员设置时间。</strong>候选和个人排序现在都可以维护。</section>}
      {activity.phase === "closed" && <Results data={data} candidates={candidates} />}
      {showDelete && (
        <DeleteActivityDialog
          title={activity.title}
          onClose={() => setShowDelete(false)}
          onDeleted={() => router.push("/")}
          activityId={id}
        />
      )}
    </main>
  );
}

function DeleteActivityDialog({
  title,
  activityId,
  onClose,
  onDeleted
}: {
  title: string;
  activityId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/activities/${activityId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation: form.get("confirmation") })
      });
      onDeleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    }
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-activity-title">
      <form className="paper modal form-grid" onSubmit={submit}>
        <span className="eyebrow">管理员操作 · 不可撤销</span>
        <h2 id="delete-activity-title">删除“{title}”</h2>
        <div className="notice">只删除这一场活动，以及它的候选和选票。其他活动、用户账号、密码和登录状态都会保留。</div>
        <label>输入“删除这个活动”<input name="confirmation" autoFocus required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="toolbar">
          <button className="button danger">确认删除</button>
          <button type="button" className="button" onClick={onClose}>取消</button>
        </div>
      </form>
    </div>
  );
}

function DeadlineForm({ activity, onSave }: { activity: ActivityDetail["activity"]; onSave: (body: object) => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSave({
      nominationEndsAt: new Date(String(form.get("nominationEndsAt"))).toISOString(),
      votingEndsAt: new Date(String(form.get("votingEndsAt"))).toISOString()
    });
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <label>候选截止<input type="datetime-local" name="nominationEndsAt" defaultValue={toLocalInput(activity.nominationEndsAt)} required /></label>
      <label>排序截止<input type="datetime-local" name="votingEndsAt" defaultValue={toLocalInput(activity.votingEndsAt)} required /></label>
      <button className="button primary">保存时间</button>
    </form>
  );
}

function Results({ data, candidates }: { data: ActivityDetail; candidates: Candidate[] }) {
  return (
    <section className="paper panel fade-up">
      <span className="eyebrow">Final tally · {data.voterCount} 人投票</span>
      <h2>最终排名</h2>
      {!data.voterCount && <div className="empty">投票结束了，但还没有有效选票。</div>}
      {data.results?.map((result, index) => {
        const candidate = candidates.find((item) => item.id === result.candidateId);
        const isWinner = index === 0;
        return (
          <div className={`result-row${isWinner ? " winner" : ""}`} key={result.candidateId}>
            <span className="rank-number">{index + 1}</span>
            <div>
              {isWinner && <span className="winner-crown" aria-label="冠军"><Crown size={17} aria-hidden="true" /> 本场冠军</span>}
              <h3 className={isWinner ? "winner-name" : undefined} style={{ marginBottom: 5 }}>{candidate?.name}</h3>
              <small className="muted">{result.rankCounts.map((count, rank) => `第${rank + 1}名 ${count}票`).join(" · ")}</small>
            </div>
            <span className="score">{result.score} 分</span>
          </div>
        );
      })}
    </section>
  );
}

function formatDate(value: string | null) {
  if (!value) return "尚未设置";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function formatEventDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
