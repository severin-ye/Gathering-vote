"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Save } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { mergeRankingOrder } from "@/lib/domain/voting";

export interface RankingCandidate {
  id: string;
  name: string;
  description: string;
  createdById?: string;
}

export function RankingBoard({
  candidates,
  initialOrder,
  onSave,
  renderActions
}: {
  candidates: RankingCandidate[];
  initialOrder: string[];
  onSave: (candidateIds: string[]) => Promise<void>;
  renderActions?: (candidate: RankingCandidate) => ReactNode;
}) {
  const candidateIds = candidates.map((item) => item.id);
  const defaultIds = mergeRankingOrder(initialOrder, candidateIds);
  const [ids, setIds] = useState(defaultIds);
  const [status, setStatus] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>(
    initialOrder.length === candidateIds.length && candidateIds.length > 0 ? defaultIds : []
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const nextCandidateIds = candidates.map((item) => item.id);
    const nextIds = mergeRankingOrder(initialOrder, nextCandidateIds);
    setIds(nextIds);
    setSavedIds(
      initialOrder.length === nextCandidateIds.length && nextCandidateIds.length > 0
        ? nextIds
        : []
    );
  }, [candidates, initialOrder]);

  const isSaved =
    ids.length > 0 &&
    ids.length === savedIds.length &&
    ids.every((id, index) => id === savedIds[index]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    setIds((current) => arrayMove(current, index, target));
    setStatus("");
  }

  function dragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    setIds((current) => {
      const oldIndex = current.indexOf(String(event.active.id));
      const newIndex = current.indexOf(String(event.over?.id));
      return arrayMove(current, oldIndex, newIndex);
    });
    setStatus("");
  }

  async function save() {
    setStatus("保存中…");
    try {
      await onSave(ids);
      setSavedIds([...ids]);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    }
  }

  return (
    <div>
      <p className="muted">拖动卡片，或用按钮逐项调整。最喜欢的放在最上面。</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id, index) => {
            const candidate = candidates.find((item) => item.id === id);
            if (!candidate) return null;
            return <SortableRow key={id} candidate={candidate} index={index} total={ids.length} onMove={move} actions={renderActions?.(candidate)} />;
          })}
        </SortableContext>
      </DndContext>
      <div className="toolbar" style={{ marginTop: 18 }}>
        <button className="button stamp" onClick={save} disabled={!ids.length}><Save size={18} /> 保存我的排序</button>
        {isSaved && !status && <span className="success" role="status">已保存这份排序 ✓</span>}
        {status && <span className="muted" role="status">{status}</span>}
      </div>
    </div>
  );
}

function SortableRow({
  candidate,
  index,
  total,
  onMove,
  actions
}: {
  candidate: RankingCandidate;
  index: number;
  total: number;
  onMove: (index: number, direction: -1 | 1) => void;
  actions?: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: candidate.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`candidate sortable${isDragging ? " is-dragging" : ""}`}
    >
      <span className="rank-number" aria-label={`第 ${index + 1} 名`}>{index + 1}</span>
      <button type="button" className="button small drag-handle" aria-label={`拖动 ${candidate.name}`} {...attributes} {...listeners}>
        <GripVertical size={19} /> <span>拖动</span>
      </button>
      <div className="candidate-copy"><h3>{candidate.name}</h3>{candidate.description && <small className="muted">{candidate.description}</small>}</div>
      <div className="toolbar sort-controls" style={{ gap: 4 }}>
        <button type="button" className="button small" aria-label={`${candidate.name} 上移`} disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={16} /></button>
        <button type="button" className="button small" aria-label={`${candidate.name} 下移`} disabled={index === total - 1} onClick={() => onMove(index, 1)}><ArrowDown size={16} /></button>
      </div>
      {actions && <div className="candidate-actions">{actions}</div>}
    </div>
  );
}
