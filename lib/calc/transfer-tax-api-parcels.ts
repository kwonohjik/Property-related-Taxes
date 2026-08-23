/**
 * 다필지(§114⑦ 필지별 독립 계산) — API 페이로드의 `parcels[]` 조립.
 *
 * `transfer-tax-api.ts`에서 분리 (2026-08-23, 800줄 정책). 조립 규칙(지분 스케일 대상·
 * 감환지 면적 정정·환산 단가 게이트)이 한 덩어리로 응집돼 있어 그대로 옮겼다 — 로직 무변경.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { applyRatio, resolveAcqAreaForStdPrice } from "./transfer-tax-api-helpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * @param parcels 자산-수준 필지 배열 (`primary.parcels`)
 * @param primaryFractional 대표 자산이 지분 양도인가 — 금액 필드에만 지분율을 곱한다
 * @param primaryRatio 대표 자산 지분율
 */
export function buildParcelsPayload(
  parcels: AssetForm["parcels"],
  primaryFractional: boolean,
  primaryRatio: number,
) {
  return parcels.map((p) => {
        const scenario = p.areaScenario ?? "partial";
        const isReduction = scenario === "reduction";

        /**
         * 지분 스케일 — **금액 필드 전용**. 자산-수준 `transferPrice`가 이미
         * `applyRatio(totalContractPrice, primaryRatio)`로 지분분인데(:212) 필지 금액이
         * 물건 전체(100%)로 남으면 **양도가액 지분분 − 취득가액 100%** 혼합 스케일이 된다
         * (실측: 지분 50%에서 양도차익 8,000만 vs 정본 2억 8,000만 — **2억 과소**).
         * §97② 단서 swap 비교(자본적지출+양도비 vs 환산+개산공제)도 같은 이유로 뒤집힌다.
         *
         * ⚠️ **면적·기준시가·보상단가는 스케일하지 않는다** — 면적은 필지 간 안분 비율의
         *    분자·분모로 함께 나타나 상쇄되고, 기준시가·보상단가는 물건의 단가라
         *    환산 산식에서 분자·분모로 상쇄된다. `ratioed`(makeRatioed)와 달리 **0을
         *    undefined로 바꾸지 않아** 기존 필드별 undefined 규약을 보존한다.
         * (P3 PR #843이 split 파트 필드에서 고친 것과 동형 — 계획서 §10 별건 A3)
         */
        const scaleAmt = (n: number) =>
          primaryFractional ? applyRatio(n, primaryRatio) : n;

        /**
         * 취득 기준시가 산정용 면적 (B4-1b, 2026-07-30).
         *
         * 엔진은 `standardAtAcq = floor(acqArea × sqmAtAcq)`로 쓴다
         * (`multi-parcel-transfer.ts:349`). 따라서 **취득 당시 단가에 곱할 면적**이며,
         * 일부양도(`partial`)에서는 취득 전체가 아니라 **양도한 부분의 면적**이다 —
         * 단건 경로와 같은 규약(`resolveAcqAreaForStdPrice`)이다.
         *
         * 근거: 「소득세법 시행령」 제176조의2 제2항 제2호의 "취득당시의 기준시가"는
         * 법 제114조 제7항 문맥상 **양도자산의** 것이고, 조심 2018부0572(2018.05.03,
         * 기각)도 "**각 필지의** 취득 당시 기준시가"를 안분 기준으로 삼았다.
         *
         * 감환지는 **먼저** 처리한다 — UI/여기서 의제취득면적
         * (`priorLandArea × allocatedArea / entitlementArea`)을 계산하므로 그 뒤에
         * 또 양도분을 적용하면 **이중 안분**이 된다(계획서 BR4).
         * 증환지는 `entitlementArea < allocatedArea`라 `partial` 판정에 걸리지 않는다.
         *
         * `effectiveAcquisitionArea`(엔진 결과 echo, `:459`)도 이 값으로 표시되는데,
         * 계산 재사용처가 없는 **표시 전용**이라 정정된 값이 노출되는 것이 맞다.
         */
        const finalAcqArea = isReduction
          ? (parseFloat(p.priorLandArea) * parseFloat(p.allocatedArea)) /
            parseFloat(p.entitlementArea)
          // ⚠️ `scenario`를 명시 주입한다 — 필지 기본값은 `"partial"`(`:498`)이지만
          //    헬퍼 기본값은 `"same"`이다. `p`를 그대로 넘기면 `areaScenario`가
          //    undefined인 구 세션 필지에서 정정이 조용히 미적용된다.
          : resolveAcqAreaForStdPrice({ ...p, areaScenario: scenario }) ?? 0;

        // 감환지: 양도면적 = 교부면적 (UI에서 transferArea=allocatedArea로 이미 동기화)
        const finalTransferArea = isReduction
          ? parseFloat(p.allocatedArea) || 0
          : parseFloat(p.transferArea) || 0;

        return {
          id: p.id,
          acquisitionDate:
            p.useDayAfterReplotting && p.replottingConfirmDate
              ? p.replottingConfirmDate
              : p.acquisitionDate,
          acquisitionMethod: p.acquisitionMethod,
          acquisitionPrice:
            p.acquisitionMethod === "actual" ? scaleAmt(parseAmount(p.acquisitionPrice)) : undefined,
          acquisitionArea: finalAcqArea,
          transferArea: finalTransferArea,
          standardPricePerSqmAtAcq:
            p.acquisitionMethod === "estimated"
              ? parseFloat(p.standardPricePerSqmAtAcq) || 0
              : undefined,
          standardPricePerSqmAtTransfer:
            p.acquisitionMethod === "estimated"
              ? parseFloat(p.standardPricePerSqmAtTransfer) || 0
              : undefined,
          // 공익수용 §164⑨ 1호 — 필지별 min[] 특례. 환산 방식일 때만 의미(엔진이 최종 게이트).
          compensationPerSqm:
            p.acquisitionMethod === "estimated"
              ? parseAmount(p.compensationPerSqm) || undefined
              : undefined,
          compensationBasisStdPrice:
            p.acquisitionMethod === "estimated"
              ? parseAmount(p.compensationBasisStdPrice) || undefined
              : undefined,
          expenses:
            p.acquisitionMethod === "actual" ? scaleAmt(parseAmount(p.expenses)) : undefined,
          // §97② 단서 swap — 두 필드 합 > 0이면 분리 전송, 아니면 undefined (swap 비활성)
          capitalExpenditure:
            (parseAmount(p.capitalExpenditure) || parseAmount(p.transferExpense))
              ? scaleAmt(parseAmount(p.capitalExpenditure))
              : undefined,
          transferExpense:
            (parseAmount(p.capitalExpenditure) || parseAmount(p.transferExpense))
              ? scaleAmt(parseAmount(p.transferExpense))
              : undefined,
          useDayAfterReplotting: p.useDayAfterReplotting || undefined,
          replottingConfirmDate:
            p.useDayAfterReplotting && p.replottingConfirmDate
              ? p.replottingConfirmDate
              : undefined,
          entitlementArea: isReduction
            ? parseFloat(p.entitlementArea) || undefined
            : undefined,
          allocatedArea: isReduction
            ? parseFloat(p.allocatedArea) || undefined
            : undefined,
          priorLandArea: isReduction
            ? parseFloat(p.priorLandArea) || undefined
            : undefined,
        };
      });
}
