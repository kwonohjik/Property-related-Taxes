"use client";

/**
 * HeirComposition — 상속인 구성 입력 컴포넌트 (#28)
 * 상속세 계산 마법사에서 Heir[] 입력에 사용
 *
 * 상속인 관계: 배우자, 자녀, 직계존속, 형제자매, 기타
 * 배우자·자녀는 인적공제, 동거주택공제, 세대생략할증 등에 영향
 */

import type {
  Heir,
  HeirRelation,
  ShareholderInfo,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

const SHAREHOLDER_RELATION_LABEL: Record<ShareholderInfo["relation"], string> = {
  heir: "상속인",
  heir_spouse: "상속인의 배우자",
  lineal_descendant_of_heir: "상속인의 직계비속",
  spouse_of_lineal_descendant: "직계비속의 배우자",
};

// ============================================================
// 관계 메타
// ============================================================

const RELATION_LABELS: Record<HeirRelation, string> = {
  spouse: "배우자",
  child: "자녀",
  lineal_ascendant: "직계존속 (부모·조부모)",
  sibling: "형제자매",
  other: "기타",
  legatee: "수유자",
  corporate: "법인",
};

const RELATION_ICONS: Record<HeirRelation, string> = {
  spouse: "💑",
  child: "👶",
  lineal_ascendant: "👴",
  sibling: "🤝",
  other: "👤",
  legatee: "📜",
  corporate: "🏢",
};

const RELATION_HINTS: Record<HeirRelation, string> = {
  spouse: "배우자 공제 최소 5억 ~ 최대 30억 (§19)",
  child: "1인당 5,000만원 인적공제. 미성년자는 추가 공제 (§20)",
  lineal_ascendant: "1인당 5,000만원 인적공제. 만 65세 이상 추가 공제 (§20)",
  sibling: "기타 인적공제 (상속 우선순위 낮음)",
  other: "법정상속인 외 수유자",
  legatee: "유언에 의한 수유자 (법정상속인 외)",
  corporate: "법인 수유자",
};

const HEIR_RELATIONS: HeirRelation[] = [
  "spouse",
  "child",
  "lineal_ascendant",
  "sibling",
  "other",
];

// 영리법인 추가 옵션 — PR 2 PR-2 (부표 5).
const SPECIAL_RELATIONS: HeirRelation[] = ["corporate"];

// ============================================================
// 개별 상속인 편집기
// ============================================================

interface HeirEditorProps {
  heir: Heir;
  index: number;
  onUpdate: (updated: Heir) => void;
  onRemove: () => void;
}

function HeirEditor({ heir, index, onUpdate, onRemove }: HeirEditorProps) {
  const set = (patch: Partial<Heir>) => onUpdate({ ...heir, ...patch });

  const showBirthDate =
    heir.relation === "child" ||
    heir.relation === "lineal_ascendant" ||
    heir.relation === "sibling";
  const showCohabitant = heir.relation === "child";
  const isCorporate = heir.relation === "corporate";

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{RELATION_ICONS[heir.relation]}</span>
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            {RELATION_LABELS[heir.relation]} {index + 1}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          삭제
        </button>
      </div>

      {/* 공제 안내 */}
      <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded px-3 py-2">
        ℹ️ {RELATION_HINTS[heir.relation]}
      </p>

      {/* 이름 (선택) */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          이름 (선택)
        </label>
        <input
          type="text"
          value={heir.name ?? ""}
          onChange={(e) => set({ name: e.target.value || undefined })}
          placeholder="예: 홍길동"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* 생년월일 */}
      {showBirthDate && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            생년월일{" "}
            {heir.relation === "child" && (
              <span className="text-amber-600">(미성년자 여부 판별용)</span>
            )}
            {heir.relation === "lineal_ascendant" && (
              <span className="text-amber-600">(만 65세 이상 연로자 공제 판별용)</span>
            )}
          </label>
          <DateInput
            value={heir.birthDate ?? ""}
            onChange={(v) => set({ birthDate: v || undefined })}
          />
        </div>
      )}

      {/* 장애인 여부 — 자연인 전용 */}
      {!isCorporate && (
        <ToggleCard
          tone="violet"
          title="장애인"
          description="기대여명(년) × 1,000만원 추가 인적공제 (§20②, 2024 생명표 기준)"
          checked={heir.isDisabled ?? false}
          onCheckedChange={(v) => set({ isDisabled: v })}
        />
      )}

      {/* 동거주택 요건 (자녀) */}
      {showCohabitant && (
        <ToggleCard
          tone="violet"
          title="동거주택 상속공제 해당"
          description="피상속인·상속인 10년 이상 동거, 무주택자 요건 등 (§23의2) — 공시가격의 80%, 최대 6억"
          checked={heir.isCohabitant ?? false}
          onCheckedChange={(v) => set({ isCohabitant: v })}
        />
      )}

      {/* 협의분할은 각 자산 카드에서 입력 — 전역 비율 필드(actualShareRatio) 폐지 (2026-05-26).
          미입력 자산은 법정상속분 자동 배분. 안내는 상속인 섹션 상단에 1회 노출. */}

      {/* 영리법인 전용 — 부표 5 ②③ + 주주 명세 */}
      {isCorporate && <CorporateHeirFields heir={heir} set={set} />}
    </div>
  );
}

// ============================================================
// 영리법인 전용 편집기 (부표 5 ②③ + 주주 동적 명세)
// ============================================================

let _nextShareholderId = 1;
function generateShareholderId() {
  return `sh-${Date.now()}-${_nextShareholderId++}`;
}

function CorporateHeirFields({
  heir,
  set,
}: {
  heir: Heir;
  set: (patch: Partial<Heir>) => void;
}) {
  const shareholders = heir.shareholders ?? [];
  const sumRatio = shareholders.reduce((s, sh) => s + (sh.shareRatio || 0), 0);
  const sumOver = sumRatio > 1.0 + 1e-9;

  const updateShareholder = (
    index: number,
    patch: Partial<ShareholderInfo>,
  ) => {
    const next = [...shareholders];
    next[index] = { ...next[index], ...patch };
    set({ shareholders: next });
  };

  const removeShareholder = (index: number) => {
    set({ shareholders: shareholders.filter((_, i) => i !== index) });
  };

  const addShareholder = () => {
    set({
      shareholders: [
        ...shareholders,
        {
          id: generateShareholderId(),
          relation: "heir",
          name: "",
          shareRatio: 0,
        },
      ],
    });
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-900/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
          5
        </span>
        <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
          부표 5 — 영리법인 면제 명세
        </p>
      </div>

      {/* ② 사업자등록번호 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          ② 사업자등록번호
        </label>
        <input
          type="text"
          value={heir.businessRegistrationNumber ?? ""}
          onChange={(e) =>
            set({ businessRegistrationNumber: e.target.value || undefined })
          }
          placeholder="000-00-00000"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* ③ 사업장 소재지 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          ③ 사업장 소재지
        </label>
        <input
          type="text"
          value={heir.businessAddress ?? ""}
          onChange={(e) => set({ businessAddress: e.target.value || undefined })}
          placeholder="법인 본점·지점 소재지"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* 나. 주주 명세 (⑦~⑩) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
            나. 상속인·직계비속 주주 명세 (⑪ = (⑤−⑥) × ⑩)
          </p>
          <span
            className={
              "text-[10px] font-mono " +
              (sumOver ? "text-red-600 font-bold" : "text-gray-500")
            }
          >
            합 {(sumRatio * 100).toFixed(2)}%
          </span>
        </div>
        {sumOver && (
          <p className="text-[10px] text-red-600">
            ⚠ 지분율 합이 100%를 초과합니다 (외부 주주분 제외).
          </p>
        )}

        {shareholders.length > 0 && (
          <div className="space-y-2">
            {shareholders.map((sh, i) => (
              <ShareholderRow
                key={sh.id}
                shareholder={sh}
                onUpdate={(patch) => updateShareholder(i, patch)}
                onRemove={() => removeShareholder(i)}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addShareholder}
          className="w-full flex items-center justify-center gap-1 rounded-md border border-dashed border-violet-300 dark:border-violet-600 py-2 text-xs text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-800/40"
        >
          <span className="text-base">+</span>
          주주 추가
        </button>
      </div>
    </div>
  );
}

function ShareholderRow({
  shareholder,
  onUpdate,
  onRemove,
}: {
  shareholder: ShareholderInfo;
  onUpdate: (patch: Partial<ShareholderInfo>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-violet-200 dark:border-violet-700 bg-white dark:bg-gray-900 p-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* ⑦ 구분 */}
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400">
            ⑦ 구분
          </label>
          <select
            value={shareholder.relation}
            onChange={(e) =>
              onUpdate({
                relation: e.target.value as ShareholderInfo["relation"],
              })
            }
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {(Object.keys(SHAREHOLDER_RELATION_LABEL) as ShareholderInfo["relation"][]).map(
              (r) => (
                <option key={r} value={r}>
                  {SHAREHOLDER_RELATION_LABEL[r]}
                </option>
              ),
            )}
          </select>
        </div>

        {/* ⑩ 지분율 */}
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400">
            ⑩ 지분율 (%)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={
              shareholder.shareRatio != null
                ? String(shareholder.shareRatio * 100)
                : ""
            }
            onChange={(e) => {
              const v = parseFloat(e.target.value || "");
              onUpdate({
                shareRatio: isNaN(v)
                  ? 0
                  : Math.min(100, Math.max(0, v)) / 100,
              });
            }}
            placeholder="예: 60"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* ⑧ 성명 */}
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400">
            ⑧ 성명
          </label>
          <input
            type="text"
            value={shareholder.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="주주 성명"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* ⑨ 주민등록번호 (옵션) */}
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400">
            ⑨ 주민등록번호 (선택)
          </label>
          <input
            type="text"
            value={shareholder.residentNumber ?? ""}
            onChange={(e) =>
              onUpdate({ residentNumber: e.target.value || undefined })
            }
            placeholder="000000-0000000"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="text-[10px] text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 관계 추가 버튼
// ============================================================

interface RelationButtonProps {
  relation: HeirRelation;
  onAdd: (r: HeirRelation) => void;
}

function RelationButton({ relation, onAdd }: RelationButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onAdd(relation)}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-xs"
    >
      <span className="text-xl">{RELATION_ICONS[relation]}</span>
      <span className="text-gray-600 dark:text-gray-300 text-center leading-tight">
        {RELATION_LABELS[relation]}
      </span>
    </button>
  );
}

// ============================================================
// 상속인 구성 요약
// ============================================================

function HeirSummary({ heirs }: { heirs: Heir[] }) {
  if (heirs.length === 0) return null;

  const counts = HEIR_RELATIONS.reduce<Record<string, number>>((acc, r) => {
    const n = heirs.filter((h) => h.relation === r).length;
    if (n > 0) acc[r] = n;
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(counts).map(([r, n]) => (
        <span
          key={r}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
        >
          {RELATION_ICONS[r as HeirRelation]} {RELATION_LABELS[r as HeirRelation]} {n}명
        </span>
      ))}
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export interface HeirCompositionProps {
  heirs: Heir[];
  onChange: (heirs: Heir[]) => void;
}

let _nextHeirId = 1;
function generateHeirId() {
  return `heir-${Date.now()}-${_nextHeirId++}`;
}

import { useState } from "react";

export function HeirComposition({ heirs, onChange }: HeirCompositionProps) {
  const [showAddPanel, setShowAddPanel] = useState(false);

  const handleAdd = (relation: HeirRelation) => {
    onChange([...heirs, { id: generateHeirId(), relation }]);
    setShowAddPanel(false);
  };

  const handleUpdate = (index: number, updated: Heir) => {
    const next = [...heirs];
    next[index] = updated;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(heirs.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            상속인 구성
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            배우자 공제·인적공제 자동 계산에 사용됩니다
          </p>
        </div>
        {heirs.length > 0 && (
          <span className="text-xs text-gray-400">{heirs.length}명</span>
        )}
      </div>

      <HeirSummary heirs={heirs} />

      {heirs.length > 0 && (
        <div className="space-y-3">
          {heirs.map((heir, i) => (
            <HeirEditor
              key={heir.id}
              heir={heir}
              index={i}
              onUpdate={(updated) => handleUpdate(i, updated)}
              onRemove={() => handleRemove(i)}
            />
          ))}
        </div>
      )}

      {showAddPanel ? (
        <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            상속인 관계 선택
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {HEIR_RELATIONS.map((r) => (
              <RelationButton key={r} relation={r} onAdd={handleAdd} />
            ))}
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-[10px] font-medium text-violet-700 dark:text-violet-300 mb-1">
              유증·특별연고자·사전증여 영리법인 (§3의2②, 부표 5)
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {SPECIAL_RELATIONS.map((r) => (
                <RelationButton key={r} relation={r} onAdd={handleAdd} />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddPanel(false)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddPanel(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
        >
          <span className="text-lg">+</span>
          상속인 추가
        </button>
      )}
    </div>
  );
}
