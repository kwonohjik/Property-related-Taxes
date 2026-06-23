"use client";

/**
 * 건축물대장 자동조회 → 건물 기준시가 폼 자동채움 버튼 (인라인).
 *
 * 소재지(PNU) + 시점 연도로 표제부를 1회 조회해 구조·용도·연면적·신축연도·층수를 채운다.
 * 모달 아님(건물 1건 = 선택 단계 불요). LandPriceLookupField 동형(로컬 state + fetch + 다필드 patch).
 * 설계: docs/02-design/features/building-register-autofill.design.md §6.
 */
import { useState } from "react";
import {
  listStructureOptions,
  listUsageOptions,
} from "@/lib/tax-engine/data/building-standard-price";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";
import type { BuildingStdPriceTaxType } from "@/lib/tax-engine/types/building-standard-price.types";
import type {
  BuildingRegisterLookupResponse,
} from "@/app/api/address/building-register/route";
import type { RegisterMapConfidence } from "@/lib/tax-engine/data/building-standard-price/building-register-map";

interface Props {
  /** PNU(19자리) — 조회 활성화 조건 */
  pnu: string;
  /** 자동채움 대상 연도(양도=transferYear, 상증=valuationYear). 빈값 시 비활성 */
  year: string;
  /** 자동채움 시점 결정 — 양도(trans*) vs 상증(val*) */
  taxType: BuildingStdPriceTaxType;
  /** 3모드 가드(복합구조·기계식주차·공동주택환산) — 부모가 계산해 주입 */
  disabled: boolean;
  /** 다필드 patch — setF 직접 주입 */
  onAutoFill: (patch: Partial<BuildingStdPriceFormState>) => void;
}

export function BuildingRegisterLookupField({
  pnu,
  year,
  taxType,
  disabled,
  onAutoFill,
}: Props) {
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<RegisterMapConfidence | null>(
    null,
  );

  const canLookup = !!pnu && !!year && !disabled;

  async function handleLookup() {
    if (!canLookup) return;
    setIsLookingUp(true);
    setLookupError(null);
    setSummary(null);
    setConfidence(null);
    try {
      const res = await fetch(
        `/api/address/building-register?pnu=${encodeURIComponent(pnu)}&year=${encodeURIComponent(year)}`,
      );
      const json: BuildingRegisterLookupResponse = await res.json();
      if (json.configMissing) {
        setLookupError("건축물대장 API가 설정되지 않았습니다 — 직접 입력하세요.");
        return;
      }
      if (!json.success || !json.data) {
        setLookupError(json.warnings?.[0] ?? json.error ?? "조회 실패");
        return;
      }
      const d = json.data;
      const yearNum = parseInt(year, 10);

      const patch: Partial<BuildingStdPriceFormState> = {};
      // 공통(시점 무관) — 항상 채움
      if (d.floorArea !== null) patch.floorArea = String(d.floorArea);
      if (d.builtYear !== null) patch.builtYear = String(d.builtYear);
      if (d.floorsAbove !== null) patch.floorsAbove = String(d.floorsAbove);
      if (d.floorsBelow !== null) patch.floorsBelow = String(d.floorsBelow);

      // 시점 옵션셋 검증 후 set(미존재 = 미채움)
      const structOk =
        !!d.structureKey &&
        listStructureOptions(yearNum).some((o) => o.key === d.structureKey);
      const usageOk =
        d.usageNo !== null &&
        listUsageOptions(yearNum).some((o) => o.no === d.usageNo);

      if (taxType === "inheritance_gift") {
        if (structOk) patch.valStructureKey = d.structureKey!;
        if (usageOk) patch.valUsageNo = String(d.usageNo);
      } else {
        if (structOk) patch.transStructureKey = d.structureKey!;
        if (usageOk) patch.transUsageNo = String(d.usageNo);
      }

      onAutoFill(patch); // 무확인 덮어쓰기(명시 버튼 클릭 = 동의)
      setConfidence(d.confidence);
      setSummary(buildSummary(d, yearNum, structOk, usageOk));
    } catch {
      setLookupError("네트워크 오류로 조회하지 못했습니다.");
    } finally {
      setIsLookingUp(false);
    }
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={handleLookup}
        disabled={!canLookup || isLookingUp}
        className="h-9 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60 disabled:opacity-40 transition-colors"
      >
        {isLookingUp ? "조회 중…" : "건축물대장 조회"}
      </button>
      {!pnu && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          소재지 입력 후 조회 가능합니다
        </p>
      )}
      {pnu && !year && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          평가/양도 연도 입력 후 조회 가능합니다
        </p>
      )}
      {pnu && year && disabled && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          복합구조·기계식주차·공동주택 환산 모드는 직접 입력하세요
        </p>
      )}
      {lookupError && (
        <p className="mt-1 text-xs text-destructive">{lookupError}</p>
      )}
      {summary && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{summary}</span>
          {confidence === "medium" && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              확인 권장
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function buildSummary(
  d: NonNullable<BuildingRegisterLookupResponse["data"]>,
  year: number,
  structOk: boolean,
  usageOk: boolean,
): string {
  const parts: string[] = [];
  // 구조
  if (structOk && d.structureKey) {
    const label = listStructureOptions(year).find(
      (o) => o.key === d.structureKey,
    )?.label;
    parts.push(label ? `${label}` : "구조");
  } else {
    parts.push("구조 직접 선택");
  }
  // 용도
  if (usageOk && d.usageNo !== null) {
    const label = listUsageOptions(year).find((o) => o.no === d.usageNo)?.label;
    parts.push(label ? `${label}` : "용도");
  } else if (year < 2018) {
    parts.push("용도는 2018년 이후 평가만 자동 — 직접 선택");
  } else {
    parts.push("용도 직접 선택");
  }
  // 연면적·신축
  if (d.floorArea !== null) parts.push(`연면적 ${d.floorArea}㎡`);
  if (d.builtYear !== null) parts.push(`${d.builtYear}년 신축`);
  return parts.join(" · ") + " 자동 입력됨";
}
