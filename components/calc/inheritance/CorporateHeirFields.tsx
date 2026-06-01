"use client";

/**
 * CorporateHeirFields — 영리법인 수유자 전용 편집기 (부표 5 ②③ + 주주 명세)
 * HeirComposition.tsx에서 800줄 분리 (2026-06-01)
 */

import type {
  Heir,
  ShareholderInfo,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const SHAREHOLDER_RELATION_LABEL: Record<ShareholderInfo["relation"], string> = {
  heir: "상속인",
  heir_spouse: "상속인의 배우자",
  lineal_descendant_of_heir: "상속인의 직계비속",
  spouse_of_lineal_descendant: "직계비속의 배우자",
};

let _nextShareholderId = 1;
function generateShareholderId() {
  return `sh-${Date.now()}-${_nextShareholderId++}`;
}

// ============================================================
// 주주 행
// ============================================================

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
// 영리법인 전용 편집기
// ============================================================

export function CorporateHeirFields({
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
