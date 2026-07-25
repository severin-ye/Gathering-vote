"use client";

import { ArrowLeft, CalendarClock, Check, Crown, Pencil, Plus, TicketCheck, Trash2, UserMinus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { RankingBoard } from "@/components/ranking-board";
import { api, type CurrentUser } from "@/lib/client-api";
import { getDeadlineWarnings, phaseLabels, type ActivityPhase, type DeadlineWarning } from "@/lib/domain/activity";

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
  isParticipant: boolean;
  participants: { userId: string; username: string; hasBallot: boolean }[];
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
  const isParticipant = data.isParticipant ?? true;

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
            {!isParticipant && activity.phase !== "closed" && (
              <button className="button small join-stamp-button" onClick={() => mutate(`/api/activities/${id}/participants`, "POST")}>
                <TicketCheck size={17} /> 参加活动
              </button>
            )}
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
            <h2>{activity.phase === "closed" ? "最终候选" : isParticipant ? "拖拽我的排序" : "候选清单"} <small className="muted">· {candidates.length}</small></h2>
            {activity.phase !== "closed" && isParticipant ? (
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
              <CandidateList candidates={candidates} />
            )}
            {!candidates.length && <div className="empty">还没有候选项，先写下一张。</div>}
            {activity.phase !== "closed" && !isParticipant && (
              <div className="notice">参加这场活动后，才能添加候选并保存自己的排序。</div>
            )}
          </section>

          {canNominate && isParticipant && (
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
          {activity.phase !== "closed" && <CurrentResults data={data} candidates={candidates} />}
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

function CandidateList({ candidates }: { candidates: Candidate[] }) {
  return candidates.map((candidate) => (
    <div className="candidate" key={candidate.id}>
      <span className="rank-number">·</span>
      <div className="candidate-copy">
        <h3>{candidate.name}</h3>
        <small className="muted">{candidate.description || `由 ${candidate.createdByUsername} 添加`}</small>
      </div>
    </div>
  ));
}

function ParticipantRoster({
  participants
}: {
  participants: ActivityDetail["participants"];
}) {
  const sorted = participants.filter((participant) => participant.hasBallot);
  const waiting = participants.filter((participant) => !participant.hasBallot);
  return (
    <div className="participant-roster-inline" role="region" aria-label="参加与排序状态">
      <div className="participant-roster-heading">
        <strong><UsersRound size={18} /> 参加与排序状态</strong>
        <small>{participants.length} 人参加</small>
      </div>
      {!participants.length && <p className="muted">还没有人参加这场活动。</p>}
      {!!sorted.length && (
        <div className="participant-group">
          <strong className="participant-group-title sorted"><Check size={16} /> 已排序 · {sorted.length}</strong>
          <div className="participant-chips">
            {sorted.map((participant) => <span className="participant-chip sorted" key={participant.userId}>{participant.username}<small>已排序</small></span>)}
          </div>
        </div>
      )}
      {!!waiting.length && (
        <div className="participant-group">
          <strong className="participant-group-title waiting">未排序 · {waiting.length}</strong>
          <div className="participant-chips">
            {waiting.map((participant) => <span className="participant-chip waiting" key={participant.userId}>{participant.username}<small>未排序</small></span>)}
          </div>
        </div>
      )}
    </div>
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
  const [warnings, setWarnings] = useState<DeadlineWarning[]>([]);
  const [pending, setPending] = useState<{ nominationEndsAt: string; votingEndsAt: string } | null>(null);
  const [minimumDeadline] = useState(() => toLocalInput(new Date().toISOString()));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nominationLocal = String(form.get("nominationEndsAt"));
    const votingLocal = String(form.get("votingEndsAt"));
    const body = {
      nominationEndsAt: new Date(nominationLocal).toISOString(),
      votingEndsAt: new Date(votingLocal).toISOString()
    };
    const nextWarnings = getDeadlineWarnings(activity.eventDate, nominationLocal, votingLocal);
    if (nextWarnings.length) {
      setWarnings(nextWarnings);
      setPending(body);
      return;
    }
    await onSave(body);
  }

  async function confirmWarnings() {
    if (!pending) return;
    await onSave(pending);
    setWarnings([]);
    setPending(null);
  }

  return (
    <>
      <form className="form-grid" onSubmit={submit}>
        <label>候选截止<input type="datetime-local" name="nominationEndsAt" min={minimumDeadline} defaultValue={toLocalInput(activity.nominationEndsAt)} required /></label>
        <label>排序截止<input type="datetime-local" name="votingEndsAt" min={minimumDeadline} defaultValue={toLocalInput(activity.votingEndsAt)} required /></label>
        <button className="button primary">保存时间</button>
      </form>
      {!!warnings.length && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="deadline-warning-title">
          <div className="paper modal form-grid">
            <span className="eyebrow">时间安排提醒</span>
            <h2 id="deadline-warning-title">这个时间安排有点紧</h2>
            <div className="notice deadline-warning-list">
              {warnings.map((warning, index) => (
                <div className="deadline-warning-item" key={warning.code}>
                  <span className="warning-brush-number" aria-hidden="true">{index + 1}</span>
                  <div>
                    <strong className="warning-title">问题 {index + 1}</strong>
                    <p>{warning.message}</p>
                  </div>
                </div>
              ))}
              <small className="muted">这些是建议，不是强制要求。你仍然可以保存当前设置。</small>
            </div>
            <div className="toolbar">
              <button type="button" className="button stamp" onClick={confirmWarnings}>确定保存</button>
              <button type="button" className="button" onClick={() => { setWarnings([]); setPending(null); }}>再想想</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Results({ data, candidates }: { data: ActivityDetail; candidates: Candidate[] }) {
  return (
    <section className="paper panel fade-up">
      <span className="eyebrow">Final tally · {data.voterCount} 人投票</span>
      <h2>最终排名</h2>
      <ParticipantRoster participants={data.participants ?? []} />
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

function CurrentResults({ data, candidates }: { data: ActivityDetail; candidates: Candidate[] }) {
  const maxScore = Math.max(0, ...(data.results?.map((result) => result.score) ?? []));
  return (
    <section
      className="paper panel live-tally fade-up"
      style={{ "--i": 4 } as React.CSSProperties}
      role="region"
      aria-label="当前大家的排序"
    >
      <span className="eyebrow">Live tally · {data.voterCount} 人已保存</span>
      <h2>当前大家的排序</h2>
      <ParticipantRoster participants={data.participants ?? []} />
      <p className="muted">根据大家已经保存的排序实时计分。</p>
      {!data.voterCount && <div className="empty">还没有人保存排序。</div>}
      {!!data.voterCount && data.results?.map((result, index) => {
        const candidate = candidates.find((item) => item.id === result.candidateId);
        const width = maxScore > 0 ? (result.score / maxScore) * 100 : 0;
        return (
          <div
            className="tally-row"
            key={result.candidateId}
            aria-label={`${candidate?.name ?? "候选项"}，第 ${index + 1} 名，${result.score} 分`}
          >
            <div className="tally-label">
              <span className="tally-rank">{index + 1}</span>
              <strong>{candidate?.name}</strong>
              <span className="tally-score">{result.score} 分</span>
            </div>
            <div className="tally-bar" aria-hidden="true">
              <span className="tally-bar-fill" style={{ width: `${width}%` }} />
            </div>
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
