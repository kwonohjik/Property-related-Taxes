"use client";

/**
 * HousingContribEstimatedSection — 단독주택 출자 §166③ 2-point 환산취득가 입력 카드
 *
 * 활성 조건:
 *   originalAssetType="housing" + subject="right" + direction="receive" + useEstimatedAcquisition=true
 *
 * 사례 39: 취득당시 개별주택가격(분자) + 인가당시 개별주택가격(분모) → 환산취득가 도출
 *
 * 법령 근거:
 *   - §166③: 환산취득가 = floor(권리가액 × 취득시PHD / 인가시PHD)
 *   - §163⑥: 개산공제 = floor(취득시PHD × 3%)
 *   - §166①2호 나목: 인가전 양도차익 = (권리가액 − 환산 − 개산공제) × salePriceTotal / 권리가액
 *
 * 정책 준수:
 *   - native checkbox/input 신규 작성 금지 → FieldCard + CurrencyInput
 *   - useEffect → store 미러링 금지 → useMemo 순수 계산
 *   - 자동 안분 fallback 금지 — 미입력은 validate에서 차단
 *   - 3중 패턴(UI/API/validate) 동기화 (memory `mirror-pattern`)
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { computeLumpSumDeductionBase } from "@/lib/tax-engine/tax-utils";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function HousingContribEstimatedSection({ asset, onChange }: Props) {
  const ownershipRatio = getOwnershipRatio(asset);
  const rights = parseAmount(asset.redevRightsValue);
  const stdAtAcq = parseAmount(asset.redevHousingStdPriceAtAcq);
  const stdAtApproval = parseAmount(asset.redevHousingStdPriceAtApproval);

  // §166③ 환산취득가 미리보기 (useMemo 순수 계산 — useEffect 미러링 금지)
  const preview = useMemo(() => {
    if (rights <= 0 || stdAtAcq <= 0 || stdAtApproval <= 0) return null;
    // safeMultiplyThenDivide 패턴 (BigInt overflow 방어)
    // floor(권리가액 × 취득시PHD / 인가시PHD)
    const bigNumerator = BigInt(rights) * BigInt(stdAtAcq);
    const convertedAcquisition = Number(bigNumerator / BigInt(stdAtApproval));
    // §163⑥ 개산공제 = floor(**지분** 취득시PHD × 3%)
    // 🔴 base는 100% 기준시가가 아니라 **지분 기준시가**다(R21 대장 R14). 엔진이
    //    `computeLumpSumDeductionBase(housingStdPriceAtAcq, input.ownershipRatio)`로
    //    쓰는데(`redevelopment.ts:540`) 미리보기만 100%를 곱해, 지분 자산에서
    //    **화면 금액과 실제 계산이 갈렸다**. 같은 leaf를 써 단일 진실로 맞춘다
    //    (`feedback_ui_engine_dual_truth_avoidance`). 환산취득가는 지분 스케일 대상이
    //    아니다 — 엔진 rationale도 권리가액 × PHD / PHD 그대로다.
    const lumpDeductionBase = computeLumpSumDeductionBase(stdAtAcq, ownershipRatio);
    const estimatedDeduction = Math.floor(lumpDeductionBase * 0.03);
    return { convertedAcquisition, lumpDeductionBase, estimatedDeduction };
  }, [rights, stdAtAcq, stdAtApproval, ownershipRatio]);

  return (
    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-200 text-micro font-bold text-fuchsia-800 select-none">
          5a
        </span>
        <p className="text-xs font-semibold text-fuchsia-700">
          단독주택 출자 환산취득가 (§166③ + §163⑥)
        </p>
      </div>

      {/* 안내 카드 */}
      <div className="rounded-md bg-fuchsia-100/60 border border-fuchsia-200 p-2 text-caption text-fuchsia-900 leading-relaxed">
        <p className="font-semibold mb-0.5">§166③ 환산취득가 산식</p>
        <p>
          환산취득가 = 권리가액 × <Frac top="취득당시 개별주택가격" bottom="인가당시 개별주택가격" />
        </p>
        <p className="mt-0.5 text-micro text-fuchsia-700">
          ※ 분자: 취득일 직전 최근 개별주택가격(공시일 기준) / 분모: 관리처분인가일 직전 최근 개별주택가격
        </p>
        <p className="mt-0.5 text-micro text-fuchsia-700">
          ※ 개산공제(§163⑥) = 취득당시 개별주택가격 × 3% — 자동 산출, 별도 입력 불필요
        </p>
      </div>

      {/* 취득당시 개별주택가격 (분자) */}
      <FieldCard
        label="취득당시 개별주택가격 (§166③ 분자)"
        hint="취득일 직전 최근 공시된 개별주택가격 총액 (원). 취득일이 최초공시일 이전이면 최초공시 직후 가격 사용."
      >
        <CurrencyInput
          label=""
          value={asset.redevHousingStdPriceAtAcq}
          onChange={(v) => onChange({ redevHousingStdPriceAtAcq: v })}
          hideUnit
        />
      </FieldCard>

      {/* 인가당시 개별주택가격 (분모) */}
      <FieldCard
        label="인가당시 개별주택가격 (§166③ 분모)"
        hint="관리처분 인가일 직전 최근 공시된 개별주택가격 총액 (원). 인가일이 2013-10-23이면 2013-01-01 공시 가격."
      >
        <CurrencyInput
          label=""
          value={asset.redevHousingStdPriceAtApproval}
          onChange={(v) => onChange({ redevHousingStdPriceAtApproval: v })}
          hideUnit
        />
      </FieldCard>

      {/* 환산취득가 + 개산공제 미리보기 */}
      {preview && (
        <div className="mt-1 rounded-md bg-fuchsia-100/70 border border-fuchsia-200 p-2 text-caption text-fuchsia-900 space-y-0.5">
          <p className="font-semibold text-fuchsia-800">미리보기 — §166③ 환산취득가</p>
          <p className="font-mono tabular-nums">
            환산취득가 = {parseAmount(asset.redevRightsValue).toLocaleString("ko-KR")}{" "}
            × <Frac top={stdAtAcq.toLocaleString("ko-KR")} bottom={stdAtApproval.toLocaleString("ko-KR")} />{" "}
            = <span className="font-semibold">{preview.convertedAcquisition.toLocaleString("ko-KR")}</span>
          </p>
          {/* 🔴 base는 **엔진이 실제로 쓴 지분 기준시가**를 echo한다 — 100%를 찍으면
                산식이 자기 금액을 재현하지 못한다(`feedback_engine_result_display_drift`).
                엔진 `valuationMeta.lumpDeductionBase`와 같은 규약. */}
          <p className="font-mono tabular-nums">
            개산공제(§163⑥) = {preview.lumpDeductionBase.toLocaleString("ko-KR")} × 3%{" "}
            = <span className="font-semibold">{preview.estimatedDeduction.toLocaleString("ko-KR")}</span>
          </p>
          {ownershipRatio < 1 && (
            <p className="text-micro text-fuchsia-700" data-testid="housing-contrib-ratio-note">
              ※ 개산공제 기준은 지분 기준시가입니다 (취득당시 개별주택가격 ×{" "}
              {asset.ownershipNumerator}/{asset.ownershipDenominator}).
            </p>
          )}
          <p className="text-micro text-fuchsia-700 mt-0.5">
            ※ 실제 계산은 서버 엔진에서 BigInt 정밀도로 처리됩니다. 위 값은 참고용 미리보기입니다.
          </p>
        </div>
      )}
    </div>
  );
}
