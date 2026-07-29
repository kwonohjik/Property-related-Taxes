"use client";

/**
 * CorporateHeirFields — 영리법인 수유자 전용 편집기 (부표 5 ②③ + 주주 명세)
 * HeirComposition.tsx에서 800줄 분리 (2026-06-01)
 *
 * 2026-06-05: ⑦ 구분 드롭다운 2그룹 optgroup + 상속인 자동채움 연동
 *   계획서: docs/00-pm/inheritance-corporate-shareholder-heir-dropdown.plan.md
 */

import type {
  Heir,
  ShareholderInfo,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  HEIR_RELATION_LABELS,
  HEIR_RELATIONS,
} from "@/components/calc/inheritance/heir-relation-meta";
import { isRealHeir } from "@/lib/tax-engine/inheritance-legal-share";

const SHAREHOLDER_RELATION_LABEL: Record<ShareholderInfo["relation"], string> = {
  heir: "상속인",
  heir_spouse: "상속인의 배우자",
  lineal_descendant_of_heir: "상속인의 직계비속",
  spouse_of_lineal_descendant: "직계비속의 배우자",
};

/** §3의2② 기타 관계 3종 (상속인이 아닌 친족) */
const GROUP2_RELATIONS: Array<
  Exclude<ShareholderInfo["relation"], "heir">
> = [
  "heir_spouse",
  "lineal_descendant_of_heir",
  "spouse_of_lineal_descendant",
];

let _nextShareholderId = 1;
function generateShareholderId() {
  return `sh-${Date.now()}-${_nextShareholderId++}`;
}

/**
 * 자연인 상속인 필터 — §3의2② 그룹1 대상.
 * HEIR_RELATIONS(5종) = corporate·legatee 이미 제외.
 * isRealHeir 위임 — 대습상속인(substituteGroupId)은 isHeir:false 잔재와 무관하게 편입(C-1).
 */
function filterNaturalHeirs(heirs: Heir[]): Heir[] {
  return heirs.filter(
    (h) =>
      HEIR_RELATIONS.includes(h.relation as Parameters<typeof HEIR_RELATIONS.includes>[0]) &&
      isRealHeir(h),
  );
}

// ============================================================
// 주주 행
// ============================================================

function ShareholderRow({
  shareholder,
  onUpdate,
  onRemove,
  allHeirs,
}: {
  shareholder: ShareholderInfo;
  onUpdate: (patch: Partial<ShareholderInfo>) => void;
  onRemove: () => void;
  allHeirs: Heir[];
}) {
  const naturalHeirs = filterNaturalHeirs(allHeirs);

  // 연결된 상속인 live-derive (heirRef 설정 시 현재 상속인 정보 추적)
  const linked = shareholder.heirRef
    ? allHeirs.find((h) => h.id === shareholder.heirRef)
    : undefined;

  // ⑧⑨ 표시값: 연결 상속인이 살아 있으면 live값, 없으면 스냅샷
  const displayName = linked?.name?.trim() || shareholder.name;
  const displayRrn = linked?.residentNumber ?? shareholder.residentNumber;

  // dangling 감지: heirRef 있지만 allHeirs에서 찾을 수 없음
  const isDangling = shareholder.heirRef !== undefined && linked === undefined;

  // controlled select value 인코딩
  // 그룹1: "heir:<id>", 그룹2: enum 그대로
  const selectValue = shareholder.heirRef
    ? `heir:${shareholder.heirRef}`
    : shareholder.relation === "heir"
      ? "" // legacy 미연결 heir → placeholder
      : shareholder.relation;

  const handleRelationChange = (value: string) => {
    if (value.startsWith("heir:")) {
      const heirId = value.slice(5);
      const targetHeir = allHeirs.find((h) => h.id === heirId);
      if (targetHeir) {
        // 이름 미입력 상속인은 관계 라벨로 fallback (Zod name.min(1) 준수)
        const snapshotName =
          targetHeir.name?.trim() ||
          HEIR_RELATION_LABELS[targetHeir.relation];
        onUpdate({
          heirRef: heirId,
          relation: "heir",
          name: snapshotName,
          residentNumber: targetHeir.residentNumber,
        });
      }
    } else if (value === "") {
      // placeholder 선택 — 변경 없음
    } else {
      onUpdate({
        heirRef: undefined,
        relation: value as ShareholderInfo["relation"],
        name: "",
        residentNumber: undefined,
      });
    }
  };

  return (
    <div className="rounded-md border border-violet-200 dark:border-violet-700 bg-white dark:bg-gray-900 p-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* ⑦ 구분 */}
        <div className="space-y-1">
          <label className="block text-micro font-medium text-gray-600 dark:text-gray-400">
            ⑦ 구분
          </label>
          <select
            value={selectValue}
            onChange={(e) => handleRelationChange(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* legacy 미연결 heir placeholder */}
            {selectValue === "" && (
              <option value="" disabled>
                — 구분 선택 (미연결) —
              </option>
            )}

            {/* 그룹1: 입력된 상속인 */}
            {naturalHeirs.length > 0 && (
              <optgroup label="입력된 상속인">
                {naturalHeirs.map((h) => (
                  <option key={h.id} value={`heir:${h.id}`}>
                    {h.name?.trim() || HEIR_RELATION_LABELS[h.relation]} (
                    {HEIR_RELATION_LABELS[h.relation]})
                  </option>
                ))}
              </optgroup>
            )}

            {/* 그룹2: 기타 관계 */}
            <optgroup label="기타 관계">
              {GROUP2_RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {SHAREHOLDER_RELATION_LABEL[r]}
                </option>
              ))}
            </optgroup>
          </select>

          {/* 자연인 상속인 0명 hint */}
          {naturalHeirs.length === 0 && (
            <p className="text-micro text-gray-400 dark:text-gray-500">
              상속인을 먼저 추가하면 자동채움됩니다
            </p>
          )}

          {/* dangling 경고 배지 */}
          {isDangling && (
            <p className="text-micro text-amber-600 dark:text-amber-400">
              ⚠ 상속인 (미연결) — ⑦을 다시 선택해주세요
            </p>
          )}
        </div>

        {/* ⑩ 지분율 */}
        <div className="space-y-1">
          <label className="block text-micro font-medium text-gray-600 dark:text-gray-400">
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
          <label className="block text-micro font-medium text-gray-600 dark:text-gray-400">
            ⑧ 성명
            {shareholder.heirRef && (
              <span className="ml-1 text-violet-600 dark:text-violet-400">
                (자동채움)
              </span>
            )}
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => {
              if (!shareholder.heirRef) {
                onUpdate({ name: e.target.value });
              }
            }}
            readOnly={!!shareholder.heirRef}
            placeholder="주주 성명"
            className={
              "w-full rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (shareholder.heirRef
                ? "border-violet-200 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-700 text-gray-600 dark:text-gray-300 cursor-default"
                : "border-input bg-background")
            }
          />
        </div>

        {/* ⑨ 주민등록번호 (옵션) */}
        <div className="space-y-1">
          <label className="block text-micro font-medium text-gray-600 dark:text-gray-400">
            ⑨ 주민등록번호 (선택)
            {shareholder.heirRef && (
              <span className="ml-1 text-violet-600 dark:text-violet-400">
                (자동채움)
              </span>
            )}
          </label>
          <input
            type="text"
            value={displayRrn ?? ""}
            onChange={(e) => {
              if (!shareholder.heirRef) {
                onUpdate({ residentNumber: e.target.value || undefined });
              }
            }}
            readOnly={!!shareholder.heirRef}
            placeholder="000000-0000000"
            className={
              "w-full rounded-md border px-2 py-1.5 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (shareholder.heirRef
                ? "border-violet-200 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-700 text-gray-600 dark:text-gray-300 cursor-default"
                : "border-input bg-background")
            }
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="text-micro text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
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
  allHeirs,
}: {
  heir: Heir;
  set: (patch: Partial<Heir>) => void;
  /** 상속인 목록 전체 — ⑦ 그룹1 자동채움용 */
  allHeirs: Heir[];
}) {
  const shareholders = heir.shareholders ?? [];
  const sumRatio = shareholders.reduce((s, sh) => s + (sh.shareRatio || 0), 0);
  const sumOver = sumRatio > 1.0 + 1e-9;

  const naturalHeirs = filterNaturalHeirs(allHeirs);

  // ③ Legacy normalize: relation="heir" && !heirRef 행 → name-match로 heirRef 보강
  // 렌더 시 1회 보정 (useEffect 금지 정책 — store 직접 호출 없음, 렌더 경로 내 set 호출도 금지)
  // → 대신 updateShareholder를 통한 명시적 onChange에서만 처리 (normalize는 하단 헬퍼 함수로)

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
    // §3-4: 자연인 상속인 ≥1명이면 첫 상속인 자동 연결
    const firstHeir = naturalHeirs[0];
    let newShareholder: ShareholderInfo;

    if (firstHeir) {
      const snapshotName =
        firstHeir.name?.trim() || HEIR_RELATION_LABELS[firstHeir.relation];
      newShareholder = {
        id: generateShareholderId(),
        relation: "heir",
        heirRef: firstHeir.id,
        name: snapshotName,
        residentNumber: firstHeir.residentNumber,
        shareRatio: 0,
      };
    } else {
      // 상속인 없음 → 기타 관계(heir_spouse) 수동 모드 시작
      newShareholder = {
        id: generateShareholderId(),
        relation: "heir_spouse",
        name: "",
        shareRatio: 0,
      };
    }

    set({
      shareholders: [...shareholders, newShareholder],
    });
  };

  // §3-5: Legacy normalize — 렌더 전 한 번만 보정
  // useEffect 금지 정책 적용: 렌더 경로에서 set() 호출하지 않고,
  // 대신 shareholders를 정규화된 버전으로 표시용 파생 계산
  const normalizedShareholders = shareholders.map((sh) => {
    if (sh.relation === "heir" && !sh.heirRef && sh.name) {
      // name-match 시도
      const matched = naturalHeirs.find(
        (h) => h.name?.trim() === sh.name.trim(),
      );
      if (matched) {
        // match됐으면 heirRef 보강된 버전 반환 (display용)
        // 실제 store 갱신은 사용자 상호작용 시점에 발생
        return { ...sh, heirRef: matched.id };
      }
    }
    return sh;
  });

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-900/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">
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
              "text-micro font-mono " +
              (sumOver ? "text-red-600 font-bold" : "text-gray-500")
            }
          >
            합 {(sumRatio * 100).toFixed(2)}%
          </span>
        </div>
        {sumOver && (
          <p className="text-micro text-red-600">
            ⚠ 지분율 합이 100%를 초과합니다 (외부 주주분 제외).
          </p>
        )}

        {normalizedShareholders.length > 0 && (
          <div className="space-y-2">
            {normalizedShareholders.map((sh, i) => (
              <ShareholderRow
                key={sh.id}
                shareholder={sh}
                onUpdate={(patch) => updateShareholder(i, patch)}
                onRemove={() => removeShareholder(i)}
                allHeirs={allHeirs}
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
