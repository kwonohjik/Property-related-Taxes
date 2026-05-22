"use client";

/**
 * 거주지 자동 검증 미리보기 카드 (UI-E2 + v4.1.1 Phase 5)
 *
 * 옵션 A 정책 (lib/calc/farming-residence-check.ts):
 *   - matchKind (자동 검증) = 시·군·구 동일 > 연접 > 30km > 산림지 단서 > fail
 *   - met (최종 boolean) = 사용자 명시값 그대로
 *   - 자동이 사용자 명시를 덮어쓰지 않음
 *
 * matchKind 5분기 (디자인 v1.1 §4-3):
 *   - same_district          — emerald "동일 시·군·구"
 *   - adjacent_district      — emerald "연접 시·군·구"
 *   - within_30km            — emerald "30km 직선거리"
 *   - forest_manageable_area — emerald "산림지 통상 경영 지역 (사용자 명시)"
 *   - fail                   — rose "4가지 조건 모두 미충족"
 *   - null                   — gray "미입력"
 *
 * 모순 안내 (met vs autoMet):
 *   - met=true + autoMet=false → 노란 경고
 *   - met=false + autoMet=true → 파란 안내
 */

import type { SigunguMatchKind } from "@/lib/tax-engine/types/inheritance-asset-location.types";

function labelMatchKind(kind: SigunguMatchKind | null): string {
  switch (kind) {
    case "same_district":
      return "동일 시·군·구";
    case "adjacent_district":
      return "연접 시·군·구";
    case "within_30km":
      return "30km 직선거리";
    case "forest_manageable_area":
      return "산림지 통상 경영 지역 (사용자 명시)";
    case "fail":
      return "4가지 조건 모두 미충족";
    case null:
      return "미입력";
  }
}

import type { FarmingResidenceCheckResult } from "@/lib/calc/farming-residence-check";

export interface ResidenceCheckPreviewCardProps {
  result: FarmingResidenceCheckResult;
}

function formatKm(d: number | null): string {
  return d === null ? "-" : `${d.toFixed(1)}km`;
}

export function ResidenceCheckPreviewCard({
  result,
}: ResidenceCheckPreviewCardProps) {
  const {
    decedentMet,
    heirMet,
    decedentAutoMet,
    heirAutoMet,
    decedentMatchKind,
    heirMatchKind,
    decedentMinDistanceKm,
    heirMinDistanceKm,
  } = result;

  // autoMet 양쪽 null — 좌표/자산 미입력
  if (decedentAutoMet === null && heirAutoMet === null) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50/40 dark:bg-gray-900/20 dark:border-gray-700 p-2">
        <p className="text-[11px] text-gray-600 dark:text-gray-400">
          ⓘ 좌표 또는 자산 위치 미입력 — 자동 검증 보류
        </p>
      </div>
    );
  }

  // 자동 결과 색조
  const bothAuto = decedentAutoMet === true && heirAutoMet === true;
  const noneAuto = decedentAutoMet === false && heirAutoMet === false;
  const tone = bothAuto ? "emerald" : noneAuto ? "rose" : "amber";

  const toneClasses = {
    emerald:
      "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200",
    amber:
      "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 text-amber-800 dark:text-amber-200",
    rose:
      "border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800 text-rose-800 dark:text-rose-200",
  }[tone];

  return (
    <div className="space-y-1">
      <div className={`rounded-md border ${toneClasses} p-2`}>
        <p className="text-[11px] font-semibold">
          🤖 §16②1호나 거주지 OR 자동 검증
        </p>
        <p className="text-[10px] mt-0.5">
          피상속인 — {labelMatchKind(decedentMatchKind)}
          {decedentMinDistanceKm !== null && ` (${formatKm(decedentMinDistanceKm)})`}
          {" · "}
          상속인 — {labelMatchKind(heirMatchKind)}
          {heirMinDistanceKm !== null && ` (${formatKm(heirMinDistanceKm)})`}
        </p>
        <p className="text-[10px] mt-0.5 opacity-80">
          ※ 연접 시·군·구 매트릭스는 Phase 1 데이터 주입 후 활성 (옵션 A — 사용자 명시 우선)
        </p>
      </div>

      {/* 모순 안내 — 피상속인 */}
      {decedentMet === true && decedentAutoMet === false && (
        <ConflictRow
          tone="warn"
          label="피상속인"
          text="사용자 명시 통과 / 자동 30km 초과 — 시·군·구·연접 거주 또는 면제 사유 명확화 권장"
        />
      )}
      {decedentMet === false && decedentAutoMet === true && (
        <ConflictRow
          tone="info"
          label="피상속인"
          text="자동 30km 이내 통과 가능성 — 거주지 충족 검토 권장"
        />
      )}

      {/* 모순 안내 — 상속인 */}
      {heirMet === true && heirAutoMet === false && (
        <ConflictRow
          tone="warn"
          label="상속인"
          text="사용자 명시 통과 / 자동 30km 초과 — 시·군·구·연접 거주 또는 면제 사유 명확화 권장"
        />
      )}
      {heirMet === false && heirAutoMet === true && (
        <ConflictRow
          tone="info"
          label="상속인"
          text="자동 30km 이내 통과 가능성 — 거주지 충족 검토 권장"
        />
      )}
    </div>
  );
}

function ConflictRow({
  tone,
  label,
  text,
}: {
  tone: "warn" | "info";
  label: string;
  text: string;
}) {
  const classes =
    tone === "warn"
      ? "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200"
      : "border-sky-300 bg-sky-50 dark:bg-sky-950/20 dark:border-sky-800 text-sky-800 dark:text-sky-200";
  return (
    <div className={`rounded-md border ${classes} p-2`}>
      <p className="text-[10px]">
        <span className="font-semibold">{tone === "warn" ? "⚠️" : "ℹ️"} {label}</span> — {text}
      </p>
    </div>
  );
}
