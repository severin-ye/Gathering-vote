"use client";

import { ArrowLeft, CalendarClock, Check, Crown, LineChart, Pencil, Plus, TicketCheck, Trash2, UserMinus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { RankingBoard } from "@/components/ranking-board";
import { api, type CurrentUser } from "@/lib/client-api";
import { getDeadlineWarnings, phaseLabels, type ActivityPhase, type DeadlineWarning } from "@/lib/domain/activity";
import {
  buildTimeCurvePoints,
  formatTimeOption,
  type TimeOptionKind,
  type TimeVoteResult,
} from "@/lib/domain/vote-timeline";

interface Candidate {
  id: string;
  name: string;
  description: string;
  createdById: string;
  createdByUsername: string;
  createdByDisplayName?: string;
  createdAt: string;
}
interface TimeOption {
  id: string;
  kind: TimeOptionKind;
  hour: number;
  minute: number;
  createdById: string;
  createdAt?: string;
}
interface ActivityDetail {
  activity: {
    id: string;
    title: string;
    description: string;
    eventDate: string;
    managerUserId: string | null;
    managerUsername: string | null;
    managerDisplayName?: string | null;
    nominationEndsAt: string | null;
    votingEndsAt: string | null;
    phase: ActivityPhase;
    updatedAt: string;
  };
  candidates: Candidate[];
  ownBallot: string[];
  results: { candidateId: string; score: number; rankCounts: number[] }[] | null;
  timeOptions: TimeOption[];
  ownTimeOptionIds: string[];
  timeResults: TimeVoteResult[];
  voterCount: number;
  isParticipant: boolean;
  participants: { userId: string; username: string; displayName?: string; note?: string; hasBallot: boolean }[];
}

export default function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<ActivityDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [noting, setNoting] = useState<ActivityDetail["participants"][number] | null>(null);
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
            {activity.managerUsername ? <span className="badge"><Crown size={15} /> 管理员：{activity.managerDisplayName ?? activity.managerUsername}</span> : <button className="button stamp" onClick={() => mutate(`/api/activities/${id}/manager`, "POST")}><Crown size={17} /> 申领管理员</button>}
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

          <TimePreferencePanel
            options={data.timeOptions ?? []}
            ownOptionIds={data.ownTimeOptionIds ?? []}
            isParticipant={isParticipant}
            canAdd={canNominate}
            canVote={activity.phase !== "closed"}
            onAdd={(body) => mutate(`/api/activities/${id}/time-options`, "POST", body)}
            onVote={(optionIds) => mutate(`/api/activities/${id}/time-vote`, "PUT", { optionIds })}
          />

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
          {activity.phase === "closed" && <TimeVoteTimeline results={data.timeResults ?? []} participantCount={data.participants?.length ?? 0} />}
          {activity.phase !== "closed" && <CurrentResults data={data} candidates={candidates} currentUserId={user.id} onEditNote={setNoting} />}
        </aside>
      </div>

      {activity.phase === "nomination" && <section className="paper panel notice"><strong>候选仍在征集中。</strong>你可以随时保存当前排序；新候选会自动追加到末尾。</section>}
      {activity.phase === "setup" && <section className="paper panel notice"><strong>等待管理员设置时间。</strong>候选和个人排序现在都可以维护。</section>}
      {activity.phase === "closed" && <Results data={data} candidates={candidates} currentUserId={user.id} onEditNote={setNoting} />}
      {showDelete && (
        <DeleteActivityDialog
          title={activity.title}
          onClose={() => setShowDelete(false)}
          onDeleted={() => router.push("/")}
          activityId={id}
        />
      )}
      {noting && (
        <UserNoteDialog
          participant={noting}
          onClose={() => setNoting(null)}
          onSave={async (note) => {
            const saved = await mutate(`/api/users/${noting.userId}/note`, "PUT", { note });
            if (saved) setNoting(null);
          }}
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
        <small className="muted">{candidate.description || `由 ${candidate.createdByDisplayName ?? candidate.createdByUsername} 添加`}</small>
      </div>
    </div>
  ));
}

function ParticipantRoster({
  participants,
  currentUserId,
  onEditNote
}: {
  participants: ActivityDetail["participants"];
  currentUserId: string;
  onEditNote: (participant: ActivityDetail["participants"][number]) => void;
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
            {sorted.map((participant) => <ParticipantChip participant={participant} currentUserId={currentUserId} onEditNote={onEditNote} status="已排序" key={participant.userId} />)}
          </div>
        </div>
      )}
      {!!waiting.length && (
        <div className="participant-group">
          <strong className="participant-group-title waiting">未排序 · {waiting.length}</strong>
          <div className="participant-chips">
            {waiting.map((participant) => <ParticipantChip participant={participant} currentUserId={currentUserId} onEditNote={onEditNote} status="未排序" key={participant.userId} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ParticipantChip({
  participant,
  currentUserId,
  onEditNote,
  status
}: {
  participant: ActivityDetail["participants"][number];
  currentUserId: string;
  onEditNote: (participant: ActivityDetail["participants"][number]) => void;
  status: "已排序" | "未排序";
}) {
  return (
    <span className={`participant-chip ${participant.hasBallot ? "sorted" : "waiting"}`}>
      {participant.displayName ?? participant.username}
      <small>{status}</small>
      {participant.userId !== currentUserId && (
        <button type="button" className="note-edit-button" aria-label={`备注 ${participant.username}`} onClick={() => onEditNote(participant)}>
          <Pencil size={13} />
        </button>
      )}
    </span>
  );
}

function TimePreferencePanel({
  options,
  ownOptionIds,
  isParticipant,
  canAdd,
  canVote,
  onAdd,
  onVote
}: {
  options: TimeOption[];
  ownOptionIds: string[];
  isParticipant: boolean;
  canAdd: boolean;
  canVote: boolean;
  onAdd: (body: { kind: TimeOptionKind; hour: number; minute: number }) => Promise<boolean>;
  onVote: (optionIds: string[]) => Promise<boolean>;
}) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [kind, setKind] = useState<TimeOptionKind | null>(null);
  const [period, setPeriod] = useState<"am" | "pm" | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState("");
  const [selected, setSelected] = useState(() => new Set(ownOptionIds));
  const [saved, setSaved] = useState(() => new Set(ownOptionIds));

  useEffect(() => {
    setSelected(new Set(ownOptionIds));
    setSaved(new Set(ownOptionIds));
  }, [ownOptionIds]);

  const hourFaces = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const isSaved = sameIds(selected, saved);

  function choosePeriod(nextPeriod: "am" | "pm") {
    setPeriod(nextPeriod);
    setHour(null);
  }

  function chooseHour(face: number) {
    if (!period) return;
    setHour(
      period === "am"
        ? face === 12 ? 0 : face
        : face === 12 ? 12 : face + 12
    );
  }

  async function saveNewTime() {
    if (!kind || hour === null) return;
    const savedOption = await onAdd({
      kind,
      hour,
      minute: minute === "" ? 0 : Number(minute)
    });
    if (savedOption) {
      setShowBuilder(false);
      setKind(null);
      setPeriod(null);
      setHour(null);
      setMinute("");
    }
  }

  function toggleOption(optionId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  async function saveVote() {
    const optionIds = [...selected];
    if (await onVote(optionIds)) setSaved(new Set(optionIds));
  }

  return (
    <section className="paper panel time-poll fade-up" style={{ "--i": 2 } as React.CSSProperties}>
      <div className="time-poll-heading">
        <div>
          <span className="eyebrow">Second ballot · 可多选</span>
          <h2><CalendarClock size={22} /> 活动时间投票</h2>
        </div>
        {isParticipant && canAdd && (
          <button type="button" className="button small stamp" onClick={() => setShowBuilder((value) => !value)}>
            <Plus size={16} /> 添加新的时间
          </button>
        )}
      </div>

      {showBuilder && (
        <div className="time-builder">
          <strong>先选时间用途</strong>
          <div className="time-kind-picker">
            <button type="button" className={kind === "arrival" ? "active" : ""} aria-pressed={kind === "arrival"} onClick={() => { setKind("arrival"); setPeriod(null); setHour(null); }}>进场时间</button>
            <button type="button" className={kind === "departure" ? "active" : ""} aria-pressed={kind === "departure"} onClick={() => { setKind("departure"); setPeriod(null); setHour(null); }}>离场时间</button>
          </div>
          {kind && (
            <>
              <strong>再选上下午</strong>
              <div className="period-picker">
                <button type="button" className={period === "am" ? "active" : ""} aria-pressed={period === "am"} onClick={() => choosePeriod("am")}>上午</button>
                <button type="button" className={period === "pm" ? "active" : ""} aria-pressed={period === "pm"} onClick={() => choosePeriod("pm")}>下午</button>
              </div>
            </>
          )}
          {kind && period && (
            <>
              <div className="time-hour-grid" aria-label={`${kind === "arrival" ? "进场" : "离场"}${period === "am" ? "上午" : "下午"}小时`}>
                {hourFaces.map((face) => {
                  const absoluteHour = period === "am"
                    ? face === 12 ? 0 : face
                    : face === 12 ? 12 : face + 12;
                  return (
                    <button
                      type="button"
                      key={face}
                      className={hour === absoluteHour ? "active" : ""}
                      aria-pressed={hour === absoluteHour}
                      onClick={() => chooseHour(face)}
                    >
                      {face}点
                    </button>
                  );
                })}
              </div>
              {hour !== null && (
                <div className="time-minute-row">
                  <label>
                    分钟 <small className="muted">（可不选，默认整点）</small>
                    <input
                      aria-label="分钟（可不选）"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      value={minute}
                      placeholder="00"
                      onChange={(event) => setMinute(event.target.value)}
                    />
                  </label>
                  <div className="time-preview">
                    <small>{kind === "arrival" ? "进场" : "离场"}</small>
                    <strong>{formatTimeOption(hour, minute === "" ? 0 : Number(minute))}</strong>
                  </div>
                </div>
              )}
              <div className="toolbar">
                <button type="button" className="button primary" disabled={!kind || hour === null} onClick={saveNewTime}>保存这个时间</button>
                <button type="button" className="button" onClick={() => setShowBuilder(false)}>取消</button>
              </div>
            </>
          )}
        </div>
      )}

      {!options.length && <div className="empty">还没有时间选项，先添加一个大家方便的时刻。</div>}
      {!!options.length && (
        <div className="time-choice-groups">
          {(["arrival", "departure"] as const).map((optionKind) => (
            <div className="time-choice-group" key={optionKind}>
              <strong>{optionKind === "arrival" ? "进场时间" : "离场时间"}</strong>
              <div className="time-choice-grid">
                {options.filter((option) => option.kind === optionKind).map((option) => {
                  const label = formatTimeOption(option.hour, option.minute);
                  return (
                    <label className={`time-choice${selected.has(option.id) ? " selected" : ""}`} key={option.id}>
                      <input
                        type="checkbox"
                        aria-label={`${optionKind === "arrival" ? "进场" : "离场"} ${label}`}
                        checked={selected.has(option.id)}
                        disabled={!isParticipant || !canVote}
                        onChange={() => toggleOption(option.id)}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
              {!options.some((option) => option.kind === optionKind) && <small className="muted">还没有选项</small>}
            </div>
          ))}
        </div>
      )}

      {!isParticipant && <div className="notice">参加活动后，才能添加时间并参与多选。</div>}
      {isParticipant && canVote && !!options.length && (
        <div className="time-vote-actions">
          <button type="button" className="button primary" onClick={saveVote}>保存我的时间选择</button>
          {isSaved && <span className="success" role="status">已保存时间选择 ✓</span>}
        </div>
      )}
    </section>
  );
}

function UserNoteDialog({
  participant,
  onClose,
  onSave
}: {
  participant: ActivityDetail["participants"][number];
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSave(String(form.get("note") ?? ""));
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="user-note-title">
      <form className="paper modal form-grid" onSubmit={submit}>
        <span className="eyebrow">Private note · 仅自己可见</span>
        <h2 id="user-note-title">备注“{participant.username}”</h2>
        <label>我的备注<input name="note" defaultValue={participant.note ?? ""} placeholder="例如：桌游高手" maxLength={40} autoFocus /></label>
        <small className="muted">显示格式：备注（{participant.username}）。留空保存会删除备注。</small>
        <div className="toolbar"><button className="button primary">保存备注</button><button type="button" className="button" onClick={onClose}>取消</button></div>
      </form>
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

function TimeVoteTimeline({
  results,
  participantCount
}: {
  results: TimeVoteResult[];
  participantCount: number;
}) {
  return (
    <section
      className="paper panel vote-timeline fade-up"
      style={{ "--i": 3 } as React.CSSProperties}
    >
      <div className="vote-timeline-heading">
        <div>
          <span className="eyebrow">Time ballot result</span>
          <h2><LineChart size={22} /> 大家方便的时间</h2>
        </div>
      </div>
      <p className="muted">曲线表示占全部参加者的比例。悬停或点按时间点查看详情。</p>
      <TimeCurve kind="arrival" results={results} participantCount={participantCount} />
      <TimeCurve kind="departure" results={results} participantCount={participantCount} />
    </section>
  );
}

function TimeCurve({
  kind,
  results,
  participantCount
}: {
  kind: TimeOptionKind;
  results: TimeVoteResult[];
  participantCount: number;
}) {
  const points = buildTimeCurvePoints(results, kind, participantCount);
  const title = kind === "arrival" ? "进场时间" : "离场时间";
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? 320 : 48 + index * (544 / (points.length - 1)),
    y: 165 - point.percentage
  }));
  const path = smoothCurvePath(chartPoints);

  return (
    <div className="time-curve" role="region" aria-label={`${title}结果`}>
      <div className="time-curve-title">
        <strong>{title}</strong>
        <small>{participantCount} 人参加</small>
      </div>
      {!points.length ? (
        <div className="empty">还没有人选择{title}。</div>
      ) : (
        <div className="time-curve-scroll">
          <svg className="time-curve-svg" viewBox="0 0 640 220" role="img" aria-label={`${title}选择比例曲线`}>
            <line className="time-curve-axis" x1="40" y1="165" x2="610" y2="165" />
            <line className="time-curve-guide" x1="40" y1="115" x2="610" y2="115" />
            <text className="time-curve-guide-label" x="8" y="119">50%</text>
            <path className={`time-curve-path ${kind}`} d={path} />
            {chartPoints.map((point) => (
              <g
                className={`time-curve-point ${kind}`}
                key={point.optionId}
                transform={`translate(${point.x} ${point.y})`}
                role="img"
                tabIndex={0}
                aria-label={`${point.label}，${point.votes}人，${point.percentage}%`}
              >
                <circle r="7" />
                <g className="time-curve-tooltip" aria-hidden="true">
                  <rect x="-54" y="-50" width="108" height="36" rx="2" />
                  <text x="0" y="-35">{point.label} · {point.percentage}%</text>
                  <text x="0" y="-22">{point.votes} 人选择</text>
                </g>
                <text className="time-curve-time" x="0" y={190 - point.y}>{point.label}</text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

function sameIds(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function smoothCurvePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function Results({
  data,
  candidates,
  currentUserId,
  onEditNote
}: {
  data: ActivityDetail;
  candidates: Candidate[];
  currentUserId: string;
  onEditNote: (participant: ActivityDetail["participants"][number]) => void;
}) {
  return (
    <section className="paper panel fade-up">
      <span className="eyebrow">Final tally · {data.voterCount} 人投票</span>
      <h2>最终排名</h2>
      <ParticipantRoster participants={data.participants ?? []} currentUserId={currentUserId} onEditNote={onEditNote} />
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

function CurrentResults({
  data,
  candidates,
  currentUserId,
  onEditNote
}: {
  data: ActivityDetail;
  candidates: Candidate[];
  currentUserId: string;
  onEditNote: (participant: ActivityDetail["participants"][number]) => void;
}) {
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
      <ParticipantRoster participants={data.participants ?? []} currentUserId={currentUserId} onEditNote={onEditNote} />
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
