"use client";

/**
 * Step4 조정대상지역 자동 판별 — 주소(또는 법정동코드)·날짜 → `/api/address/regulated-area` → 토글 자동 반영 + 안내.
 *
 * `Step4.tsx`에서 800줄 정책으로 분리했다(OH-22 작업 중 — 원 파일 786줄). 동작은 그대로 옮겼다: 사용자가 직접 만진
 * 토글(`*Touched`)은 덮어쓰지 않고, 기준일은 거주요건 판정일(용도변경 시 주거용 사용일 · 승계조합원 준공일)이다.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isHousingLike, isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";

export function useRegulatedAreaAutoTip({
  form,
  onChange,
  primaryKind,
  primaryAddress,
  primaryRegionCode,
  residenceJudgmentDate,
  judgmentDateLabel,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  primaryKind: string;
  primaryAddress: string;
  primaryRegionCode: string;
  residenceJudgmentDate: string;
  judgmentDateLabel: string;
}): ReactNode {
  const [regulatedAuto, setRegulatedAuto] = useState<{
    isRegulatedAtTransfer: boolean;
    wasRegulatedAtAcquisition: boolean;
    transferBasis: string;
    acquisitionBasis: string | null;
    confidence: "high" | "medium" | "low";
  } | null>(null);
  const [regulatedLoading, setRegulatedLoading] = useState(false);
  const [regulatedError, setRegulatedError] = useState<string | null>(null);
  // 수동 조작 플래그 최신값 미러 — fetch 완료 시점(비동기)에 stale closure 없이 참조
  const touchedRef = useRef({ transfer: false, acquisition: false });
  touchedRef.current = {
    transfer: form.isRegulatedAreaTouched,
    acquisition: form.wasRegulatedAtAcquisitionTouched,
  };
  const primaryInDistrict = form.assets?.[0]?.regionInDesignatedDistrict;
  // 주소(또는 법정동코드)·날짜가 준비되면 조정대상지역 자동 판별
  useEffect(() => {
    if ((!primaryAddress && !primaryRegionCode) || !form.transferDate || !isHousingLike(primaryKind)) {
      setRegulatedAuto(null);
      return;
    }
    let cancelled = false;
    setRegulatedLoading(true);
    setRegulatedError(null);
    fetch("/api/address/regulated-area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: primaryAddress || undefined,
        regionCode: primaryRegionCode || undefined,
        // 소재 동이 지구 한정이면 「지구 안인가」 선언으로 코드 판정을 정한다(엔진과 같은 값).
        inDistrict: primaryRegionCode ? primaryInDistrict : undefined,
        transferDate: form.transferDate,
        // 용도변경 시 주거용 사용일 기준 — 자동 판별 결과가 그대로 wasRegulatedAtAcquisition
        // 토글에 반영되므로, 여기서 취득일을 보내면 엔진 판정과 어긋난다.
        acquisitionDate: residenceJudgmentDate || undefined,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setRegulatedError("조정대상지역 판별 실패");
          setRegulatedAuto(null);
          return;
        }
        setRegulatedAuto(data);
        // 조회 결과가 바뀔 때마다 재반영 — 단, 사용자가 직접 만진 토글은 덮어쓰지 않음
        const patch: Partial<TransferFormData> = {};
        if (!touchedRef.current.transfer) patch.isRegulatedArea = data.isRegulatedAtTransfer;
        if (!touchedRef.current.acquisition) {
          patch.wasRegulatedAtAcquisition = data.wasRegulatedAtAcquisition;
        }
        if (Object.keys(patch).length > 0) onChange(patch);
      })
      .catch(() => {
        if (!cancelled) {
          setRegulatedError("조정대상지역 판별 중 네트워크 오류");
          setRegulatedAuto(null);
        }
      })
      .finally(() => {
        if (!cancelled) setRegulatedLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryAddress, primaryRegionCode, primaryInDistrict, form.transferDate, residenceJudgmentDate, primaryKind]);

  // 조정대상지역 자동 판별 안내 — 주택은 섹션② 취득일 조정 토글 아래, 입주권·분양권은 최상단에 렌더
  return isHousingLike(primaryKind) && primaryAddress && (
    <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-xs space-y-1">
      <p className="font-medium text-blue-800 dark:text-blue-300">
        📍 조정대상지역 자동 판별 {regulatedLoading && "(조회중...)"}
      </p>
      {regulatedError && <p className="text-destructive">{regulatedError}</p>}
      {regulatedAuto && (
        <>
          <p className="text-muted-foreground">
            양도일({form.transferDate}):{" "}
            <span className={regulatedAuto.isRegulatedAtTransfer ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
              {regulatedAuto.isRegulatedAtTransfer ? "조정대상지역 ✓" : "미지정"}
            </span>{" "}
            — {regulatedAuto.transferBasis}
          </p>
          {regulatedAuto.acquisitionBasis && (
            <p className="text-muted-foreground">
              {judgmentDateLabel}({residenceJudgmentDate}):{" "}
              <span className={regulatedAuto.wasRegulatedAtAcquisition ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
                {regulatedAuto.wasRegulatedAtAcquisition ? "조정대상지역 ✓" : "미지정"}
              </span>{" "}
              — {regulatedAuto.acquisitionBasis}
            </p>
          )}
          {/*
            🔴 「아래 체크박스」는 §154① 판정 대상 자산에만 존재한다 (2026-09-05 정정).
               입주권·분양권에는 그 토글이 없고 **있어서도 안 된다** — 입주권 비과세는 법 §89①4호
               이고 그 요건(인가일 현재 기존주택이 §89①3호가목 충족)은 `exemptionEligibleAtApproval`
               자기선언이 담는다. 분양권은 §89①4호 열거 자체에 없다.
               종전에는 두 자산에도 「아래 체크박스를 수동 확인하세요」가 떠서 존재하지 않는
               컨트롤을 가리켰다.
          */}
          {regulatedAuto.confidence !== "high" && (
            <p className="text-caption text-amber-700 dark:text-amber-400">
              ⚠️ 신뢰도: {regulatedAuto.confidence} — 시군구 일부만 지정된 경우{" "}
              {isOneHouseExemptionAsset(primaryKind)
                ? "아래 체크박스를 수동 확인하세요."
                : primaryKind === "presale_right"
                  ? "표시된 판별 결과를 참고만 하세요. 분양권은 1세대1주택 비과세 대상이 아니어서(「소득세법」 §89①4호는 조합원입주권만 열거) 취득 당시 조정대상지역 보정이 필요하지 않습니다."
                  : "표시된 판별 결과를 참고만 하세요. 조합원입주권 비과세는 「소득세법」 §89①4호에 따라 관리처분계획 인가일 현재 종전주택이 요건을 충족했는지로 판정하며, 그 선언은 자산 카드의 재개발 입력에서 받습니다."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
