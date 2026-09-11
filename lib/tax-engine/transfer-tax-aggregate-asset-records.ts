/**
 * 다건 집계 — **자산별 단건 엔진 호출 + 세율군 분류** (800줄 분리, 2026-09-11)
 *
 * `transfer-tax-aggregate.ts` 가 811줄로 정책(트리거 800 · 착지 ≤700)을 넘겨 분리했다.
 * `computeAggregateOnce` 는 580줄짜리 **단일 함수**라 함수 이동이 불가능했다 —
 * 플레이북의 **「거대 단일 함수는 구조분해」** 를 적용해 스텝 경계마다 입출력을 실측했다:
 *
 * | 스텝 | 줄 | in | out |
 * |---|---:|---:|---|
 * | **M-1+M-2** | **138** | **1**(`warnings`) | **1**(`assetRecords`) |
 * | M-3 | 35 | 5 | 4 |
 * | M-10 | 51 | 8 | 4 |
 *
 * M-1+M-2 가 압도적으로 좁다. 호출부가 `const assetRecords = buildAssetRecords(...)` 로
 * 받으면 **하류 참조가 하나도 바뀌지 않는다** — 무동작임을 diff 의 형태가 보장한다.
 *
 * ⚠️ `warnings` 는 **참조로 받아 push 한다**(블록 안에서 경고를 쌓는다). 복사본을 넘기면
 *    경고가 조용히 사라진다.
 */

import {
  calculateTransferTax,
  type TransferTaxInput,
} from "./transfer-tax";
import {
} from "./transfer-tax-penalty";
import {
} from "./transfer-tax-aggregate-reduction-step";
import {
  type CarryoverScenarioOverrides,
} from "./transfer-tax-aggregate-carryover-scope";
import { TaxCalculationError } from "./tax-errors";
import {
  classifyRateGroup,
} from "./transfer-tax-aggregate-helpers";
// picker 6종 + 세율군 1-pass 집계 — 800줄 정책 분리(Phase A-0)
import {
} from "./transfer-tax-aggregate-pickers";

export { classifyRateGroup };

import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { judgeAppurtenantLandExcess } from "./appurtenant-land-excess";
// transfer-tax-penalty 직접 호출 없음 — 자산별 가산세는 단건 엔진이 처리, aggregate는 합산만 수행.

// ============================================================
// 타입 — ./types/transfer-aggregate.types 로 분리 (800줄 정책)
// 기존 소비자들을 위해 본체 파일에서 재수출한다.
// ============================================================

import {
} from "./transfer-tax-lthd-steps";
import type {
  TransferTaxItemInput,
  AggregateTransferInput,
} from "./types/transfer-aggregate.types";

export function buildAssetRecords(
  input: AggregateTransferInput,
  rates: TaxRatesMap,
  carryoverOverrides: CarryoverScenarioOverrides,
  warnings: string[],
) {
  // M-1: 건별 단건 엔진 호출 (기본공제 스킵, 차손 허용)
  const perAsset = input.properties.map((item, assetIdx) => {
    const singleInput: TransferTaxInput = {
      ...(item as unknown as TransferTaxInput),
      annualBasicDeductionUsed: 0,
      skipBasicDeduction: true,
      skipLossFloor: true,
      // [E4] 신고서 단위 amendment가 route에서 primary item에 spread돼도 자산별 계산에
      // 누수되지 않도록 strip. 정정은 아래 집계 결정세액에 대해 1회만 계산한다(§3.3 누수 버그 수정).
      amendment: undefined,
    };
    // 자산 단위 계산 오류에 **자산 번호를 붙인다** — 이 루프에는 try/catch가 없어 예외가
    // 그대로 route까지 전파되는데, 다건에서는 어느 자산이 원인인지 메시지만으로 알 수 없다.
    let result;
    try {
      // §97의2②3호 — 신고단위 비교 결과를 내려보낸다(지정 없으면 단건 엔진이 자체 판정).
      const scenarioOverride = carryoverOverrides[assetIdx];
      result = calculateTransferTax(
        singleInput,
        rates,
        scenarioOverride ? { carryoverScenarioOverride: scenarioOverride } : undefined,
      );
    } catch (e: unknown) {
      if (e instanceof TaxCalculationError) {
        throw new TaxCalculationError(e.code, `자산 ${assetIdx + 1}: ${e.message}`, {
          ...(e.details ?? {}),
          assetIndex: assetIdx + 1,
        });
      }
      throw e;
    }
    /**
     * 🔴 **단건 경고를 집계가 통째로 버리고 있었다** (2026-08-26 · R-5 실측).
     *
     * `computeAggregateOnce`는 `warnings` 배열을 만들고 **한 번도 채우지 않았다**
     * (`warnings.push` 0건). 그래서 §89② 판정 불가 안내·§155⑦3호 귀농 사후관리·
     * §156의2⑬ 추징 등 **모든 단건 경고**가 다건·일괄양도에서 사라졌다.
     *
     * ⚠️ 자산이 여럿이므로 **어느 자산의 경고인지** 라벨을 붙인다 — 안 붙이면 3자산 번들에서
     *    같은 문구가 세 번 나오고 무엇을 확인해야 하는지 알 수 없다.
     * ⚠️ 같은 자산에서 중복은 그대로 둔다(단건 엔진이 이미 dedupe한다).
     */
    for (const w of result.warnings ?? []) {
      const label = item.propertyLabel ? `[${item.propertyLabel}] ` : "";
      const line = `${label}${w}`;
      if (!warnings.includes(line)) warnings.push(line);
    }

    // 정밀 NBL 판정이 원시 플래그를 override한 경우, 결과가 노출한 판정값으로 item을 교정.
    // (원시 isNonBusinessLand=사용자 체크박스 vs 정밀판정=사업용 불일치 시 그룹·세율 오적용 방지)
    const nblJudgment = result.nonBusinessLandJudgmentDetail;
    /**
     * 🔴 STEP 0.62(상업용건물 부수토지 초과분)도 `nblOverride`의 소스여야 한다 (E6-01, 2026-09-02 코드리뷰).
     *
     * 단건 엔진은 `runCommercialAppurtenantLandStep`이 `effectiveInput`에
     * `isNonBusinessLand: true` + `nonBusinessLandAreaRatio`를 **파생 주입**하고 그 값으로 세율을 정한다.
     * 그런데 그 파생 입력은 result에 echo되지 않아 여기 `correctedSingleInput`에 복원되지 않았고,
     * 그룹 세액 재계산에서 「소득세법」 §104①8호 +10%p가 통째로 사라졌다
     * (실측 그룹세액 −14,403,750원 → §104⑤ 1호 바닥 완충 후 최종 **11,683,750원 과소**).
     * clause8 echo도 0이 되어 §104⑤ 8호 크로스 조정이 함께 소실됐다.
     *
     * ⇒ 단건 엔진과 **같은 leaf**(`judgeAppurtenantLandExcess`)로 재판정한다. 값을 새로 배관하는
     *    대신 같은 함수를 부르므로 dual truth가 생기지 않는다(구분소유 지분율은 판정식에서 약분된다).
     */
    const cal = item.commercialAppurtenantLand;
    const calExcess =
      !nblJudgment && item.propertyType === "commercial_building" && cal
        ? judgeAppurtenantLandExcess({
            landArea: cal.totalLandArea,
            buildingFootprintArea: cal.totalBuildingFootprintArea,
            zoneType: cal.zoneType,
            unapprovedBuilding: cal.unapprovedBuilding,
            context: "상업용건물",
          })
        : undefined;
    const nblOverride = nblJudgment
      ? {
          isNonBusinessLand: nblJudgment.isNonBusinessLand,
          nonBusinessLandAreaRatio: nblJudgment.surcharge.nonBusinessAreaRatio,
        }
      : calExcess && calExcess.nonBusinessArea > 0
        ? {
            isNonBusinessLand: true,
            nonBusinessLandAreaRatio: calExcess.nonBusinessRatio,
          }
        : undefined;
    /**
     * 배우자등 이월과세(§97의2) — **채택된 시나리오의 §104② 기산 사실**로 item을 교정.
     *
     * 단건 엔진은 STEP 0.475에서 `workingInput`을 채택 시나리오 입력으로 갈아탄 뒤 세율을
     * 정한다(A=증여자 취득일·`gift` / B=증여 등기접수일·`purchase`). 그런데 여기 `item`은
     * **원본**이라 `acquisitionCause`가 `"carryover_gift"` 그대로다 —
     * 아래 두 소비자가 **채택 결과를 못 보고** 최상위 `donorAcquisitionDate` 유무만으로 갈렸다:
     *   · `classifyRateGroup`      (M-2 세율군 = §104⑤ 버킷·§102② 통산 범위·기본공제 우선순위)
     *   · `aggregateByGroup`→`calcTax` (`correctedSingleInput`이 곧 `taxRateInput`)
     *
     * 실측(토지 10억 · 증여자 2010-01-01 취득 · 2025-09-01 증여 · 2026-06-01 양도, mock 세율):
     *   · **A 채택**인데 `short_term`으로 분류 → 단건 228,660,000 vs 일괄 315,000,000 (**+86,340,000 과대**)
     *   · **B 채택**인데 `progressive`로 분류 → 단건 350,000,000 vs 일괄 258,060,000 (**−91,940,000 과소**)
     * 두 방향이 **정확히 반대**라 최상위 `donorAcquisitionDate` 배선만으로는 한쪽을 고치면
     * 다른 쪽이 깨진다 — 교정은 「채택 결과를 반영」하는 이 층에서만 성립한다.
     * anchor `aggregate-carryover-adopted-rate-basis.anchor.test.ts` (되돌리면 C-2·C-5·C-6 3건 red).
     *
     * ⚠️ 사실을 그대로 덮어쓸 뿐 「어느 세율군인가」를 넘기지 않는다(엔진 헬퍼는 사실만 받는다).
     */
    const rateBasisOverride = result.carryoverTaxationDetail?.adoptedRateBasis;
    const hasOverride = nblOverride !== undefined || rateBasisOverride !== undefined;
    const correctedItem: TransferTaxItemInput = hasOverride
      ? { ...item, ...nblOverride, ...rateBasisOverride }
      : item;
    const correctedSingleInput: TransferTaxInput = hasOverride
      ? { ...singleInput, ...nblOverride, ...rateBasisOverride }
      : singleInput;
    return { item, correctedItem, correctedSingleInput, singleInput, result };
  });

  // M-2: 세율군 분류 — 정밀판정·이월과세 채택 교정 item 기준 (원시 플래그 오분류 방지)
  const classified = perAsset.map((pa) => ({
    ...pa,
    rateGroup: classifyRateGroup(pa.correctedItem, pa.result),
  }));

  // 자산별 원시 income 및 세율군 정리
  // 장특공제는 양수 양도차익에만 적용되므로 (소득세법 §95②), 차손 자산은 income = transferGain
  const assetRecords = classified.map((pa) => {
    if (pa.result.isExempt) {
      return { ...pa, taxableGain: 0, lthd: 0, income: 0 };
    }
    const transferGain = pa.result.transferGain;
    if (transferGain < 0) {
      return { ...pa, taxableGain: transferGain, lthd: 0, income: transferGain };
    }
    const taxableGain = pa.result.taxableGain;
    const lthd = pa.result.longTermHoldingDeduction;
    const income = taxableGain - lthd;
    return { ...pa, taxableGain, lthd, income };
  });
  return assetRecords;
}
