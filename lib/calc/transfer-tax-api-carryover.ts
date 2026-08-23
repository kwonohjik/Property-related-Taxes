/**
 * 이월과세(증여) carryoverTaxation API 페이로드 빌드 헬퍼
 * transfer-tax-api.ts 800줄 정책에 따라 분리 (2026-05-04).
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
// ⚠️ `getOwnershipRatio`(transfer-tax-api-helpers)를 여기서 import하면 **순환 참조**다 —
//    helpers가 이 파일을 import한다(`transfer-tax-api-helpers.ts:12`). 그래서 ratio는 **인자**로 받고
//    스케일 함수만 엔진 유틸에서 직접 가져온다.
import { applyRatio } from "@/lib/tax-engine/tax-utils";

/**
 * buildCarryoverPayload 반환 타입.
 * carryoverTaxation 서브객체 + 최상위 TransferTaxInput override 필드.
 */
export interface CarryoverPayloadResult {
  /** carryoverTaxation 서브객체 */
  carryoverTaxation: object;
  /**
   * 최상위 TransferTaxInput에 spread할 override 필드.
   * "general" 환산 모드에서 standardPriceAtAcquisition/Transfer 주입에 사용.
   */
  topLevelOverrides: {
    standardPriceAtAcquisition?: number;
    standardPriceAtTransfer?: number;
    useEstimatedAcquisition?: boolean;
  };
}

/**
 * carryoverTaxation 서브객체 + 최상위 override 빌드 — acquisitionCause === "carryover_gift" 시만.
 *
 * 환산 모드별 처리:
 * - estimationMode === "general": donorStandardPriceAtAcquisition/Transfer를 최상위 standardPrice로 주입.
 *   엔진이 직접 기준시가 환산 공식을 적용 (§97 ① 1호 나목, 시행령 §163 ⑨).
 * - estimationMode === "phd": 기존 PHD(preHousingDisclosure) 경로 사용 — 최상위 override 없음.
 * - estimationMode === "apd": APD(preHousingDisclosure) 경로 사용 — 최상위 override 없음.
 * - useEstimatedAcquisition === false: donorAcquisitionPrice 직접 사용.
 *
 * 시행시기 가드: 양도일 < 2024-01-01 이면 donorCapitalExpenditure = 0 처리.
 *
 * ## 지분(공유) 모드 — `ownershipRatio` (A-10 / V-1)
 *
 * 화면은 「지분 모드 — 모든 금액을 **100% 기준**으로 입력하세요. 시스템이 지분율을 자동으로
 * 적용합니다」라고 **선언**한다(`components/calc/transfer/OwnershipRatioInput.tsx`). 종전에는
 * 이월과세 4필드만 그 계약 **밖**에 있어 같은 body 안에 100% 스케일과 지분 스케일이 섞였다 —
 * `transferPrice`는 × ratio 되는데 `giftDateValuation`(시나리오 B 취득가액)은 100% 그대로라
 * **양도차익이 음수**가 되고, 일괄(지분분할) 경로에서는 그 허수 차손이 다른 지분의 양도차익을
 * `lossOffsetFromSameGroup`으로 **잠식**했다(실측: 지분 1/2·수용배제 픽스처에서
 * primary `transferGain −100,000,000` → 공유자 지분 차손통산 100,000,000 · 결정세액
 * 99,460,000 → 34,785,000).
 *
 * 🔴 **스케일 대상은 3필드뿐이다** — `donorAcquisitionPrice` · `giftDateValuation` ·
 *    `donorCapitalExpenditure`. 셋 다 물건 전체 기준으로 관측되는 **금액**이다.
 *
 * 🔴 **`topLevelOverrides`의 기준시가 2필드는 절대 스케일하지 않는다.** 환산 산식
 *    (`양도가액 × 취득시 기준시가 ÷ 양도시 기준시가`)에서 분자·분모로 함께 나타나 약분되고,
 *    `ownershipRatio`가 이미 개산공제(영 §163⑥) base를 줄인다 — 기준시가까지 줄이면 **이중 축소**다.
 *    같은 규율이 `lib/calc/transfer-tax-api-gb-shares.ts`(`applyShareScale`)에도 명문화돼 있다.
 *
 * ⚠️ **`giftTaxAmount`(증여세 상당액)는 의도적으로 스케일하지 않는다 — 미결 사항이다.**
 *    영 §163의2②의 「증여세 산출세액 × (양도한 해당 자산가액 ÷ 증여세 과세가액)」은 사용자가
 *    **직접 산정해 넣는** 값이고(UI hint 동일 문구), 지분을 증여받았다면 그 값은 이미 지분 몫이다 —
 *    「100% 기준 증여세 상당액」이라는 관측 가능한 금액이 존재하지 않는다. 스케일하면 실제 납부한
 *    필요경비를 반감시키는 방향이라 **근거 없이 불리하게 적용**하는 것이 된다.
 *    ⇒ 현행(미스케일)을 유지한다. 바꾸려면 UI 안내 문구와 함께 결정할 것.
 */
export function buildCarryoverPayload(
  asset: AssetForm,
  transferDate: string,
  /** 공유 지분 비율 (단독 소유는 1.0). 호출부가 `getOwnershipRatio`로 이미 산출해 둔 값. */
  ownershipRatio: number,
): CarryoverPayloadResult | undefined {
  if (asset.acquisitionCause !== "carryover_gift" || !asset.carryover) return undefined;
  const c = asset.carryover;
  if (!c.giftRegistryDate || !c.donorAcquisitionDate) return undefined;

  /** 100% 기준 입력 → 지분 몫. 단독 소유(ratio ≥ 1)는 **원값 그대로**. */
  const scale = (n: number) => (ownershipRatio < 1 ? applyRatio(n, ownershipRatio) : n);

  const isAfter2024 = transferDate >= "2024-01-01";
  const rawCapex = parseAmount(c.donorCapitalExpenditure);
  const capex = isAfter2024 && rawCapex > 0 ? scale(rawCapex) : 0;
  const donorAcqPrice = scale(parseAmount(c.donorAcquisitionPrice));

  // "general" 환산 모드 — donorStandard* 필드를 최상위 standardPrice* 로 override.
  // 엔진이 useEstimatedAcquisition=true + standardPriceAtAcquisition/Transfer로 환산.
  // 🔴 지분 스케일 금지 (위 JSDoc) — 환산 산식에서 약분되고 개산공제 base와 이중 축소가 난다.
  const isGeneralEstimation = c.useEstimatedAcquisition && c.estimationMode === "general";
  const donorStdAtAcq = parseAmount(c.donorStandardPriceAtAcquisition);
  const donorStdAtTransfer = parseAmount(c.donorStandardPriceAtTransfer);

  const topLevelOverrides: CarryoverPayloadResult["topLevelOverrides"] = isGeneralEstimation
    ? {
        standardPriceAtAcquisition: donorStdAtAcq > 0 ? donorStdAtAcq : undefined,
        standardPriceAtTransfer: donorStdAtTransfer > 0 ? donorStdAtTransfer : undefined,
        // useEstimatedAcquisition은 최상위에서 true로 유지 (엔진 환산 트리거)
        useEstimatedAcquisition: true,
      }
    : {};

  const carryoverTaxation = {
    giftRegistryDate: c.giftRegistryDate,
    donorAcquisitionDate: c.donorAcquisitionDate,
    donorAcquisitionPrice:
      !c.useEstimatedAcquisition && donorAcqPrice > 0 ? donorAcqPrice : undefined,
    useEstimatedAcquisition: c.useEstimatedAcquisition,
    // ⚠️ 지분 미스케일 — 위 JSDoc의 미결 사항.
    giftTaxAmount: parseAmount(c.giftTaxAmount),
    donorCapitalExpenditure: capex > 0 ? capex : undefined,
    giftDateValuation: scale(parseAmount(c.giftDateValuation)),
    // §97의2① 관계요건 — 미선택("")·미사망(false)은 전송하지 않는다(엔진 기본값과 동치).
    donorRelation: c.donorRelation || undefined,
    donorDeceased: c.donorDeceased || undefined,
    exclusionDeclared: {
      expropriationWithin2Years: c.exclusionDeclared.expropriationWithin2Years || undefined,
      oneHouseExemptionApplies: c.exclusionDeclared.oneHouseExemptionApplies || undefined,
      isFamilyBusinessInheritedAsset:
        c.exclusionDeclared.isFamilyBusinessInheritedAsset || undefined,
    },
  };

  return { carryoverTaxation, topLevelOverrides };
}
