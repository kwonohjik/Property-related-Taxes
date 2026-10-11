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
import { isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";

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
    // D45 배우자 예외 사실 — ⑤가 배우자일 때만 묻는다. 관계가 바뀐 stale 값은 싣지 않는다(엔진도 관계를 본다).
    spouseGiftOneHouseAtGiftDate:
      c.donorRelation === "spouse" && c.spouseGiftOneHouseAtGiftDate ? true : undefined,
    // 결정 #33·#34 — 증여자와 계속 같은 세대 사실. 묻는 조건은 ⑤·⑧과 같은 술어(`carryoverHouseholdQuestionApplies`)다:
    //   증여자가 사망하지 않았고 관계가 「그 외」가 아닐 때만. 아니면 stale 값을 싣지 않는다(미답 "" = 미전송 = 미확인).
    ...carryoverHouseholdPayload(asset),
    exclusionDeclared: {
      expropriationWithin2Years: c.exclusionDeclared.expropriationWithin2Years || undefined,
      // D45 · Q-3 — 옛 이력의 선언만(③이 옮긴 값). 새 폼에는 세우는 UI가 없다.
      legacyOneHouseExemptionDeclared:
        c.exclusionDeclared.legacyOneHouseExemptionDeclared || undefined,
      isFamilyBusinessInheritedAsset:
        c.exclusionDeclared.isFamilyBusinessInheritedAsset || undefined,
    },
  };

  return { carryoverTaxation, topLevelOverrides };
}

/**
 * ④ 이월과세(`carryover_gift`) 자산의 `acquisitionDate` — 자산 카드에 취득일 칸이 따로 없으면 **증여 등기접수일**.
 *
 * 주 자산·컴패니언이 **같은 규칙**을 쓴다(2026-09-30 CP-5). 종전에는 주 자산만 이 fallback을 두고, 컴패니언은
 * 빈 값을 보내 ⑭가 **주 자산 취득일**로 대신 채웠다(다른 물건의 날짜). ⑧은 등기접수일을 필수로 요구한다.
 */
export function carryoverAcquisitionDateFallback(asset: AssetForm): string {
  return asset.acquisitionDate || asset.carryover?.giftRegistryDate || "";
}

/**
 * 양도 대표 자산의 **④ 취득일** — 본문 `acquisitionDate`·명부 양도 행·§155① 종전주택 취득일이 모두 이 한 값을 읽는다 (G4-3).
 *
 * 이월과세(`carryover_gift`)는 자산 카드에 취득일 칸이 없어 `acquisitionDate`가 비어 있을 수 있다. 본문만 위 fallback을 쓰고 명부 양도
 * 행·§155① 인자가 원시값을 쓰면 ⑧을 통과한 입력을 ⑫가 400(`houses.0.acquisitionDate` Invalid ISO date)으로 막고, 양도 행만 고치면
 * §155① 도출(`!prev`)이 조용히 빠진다.
 *
 * 🔑 **우선순위는 본문과 같다**(`acquisitionDate` → 증여 등기접수일). 이월과세 주택이 §155①의 「종전의 주택을 취득한 날」을 증여일로 볼지
 *    증여자 취득일로 볼지는 결정 대기 축이라 여기서 정하지 않는다 — 빈 값만 본문과 같은 값으로 채운다.
 */
export function primaryAcquisitionDateOf(asset: AssetForm | undefined): string | undefined {
  if (!asset) return undefined;
  return asset.acquisitionCause === "carryover_gift" ? carryoverAcquisitionDateFallback(asset) : asset.acquisitionDate;
}

/**
 * 「증여자와 증여일부터 양도일까지 계속 같은 세대」 질문을 **묻는가** — ⑤(위젯 노출)·⑧(필수)·④(전송)가 같은 술어를 쓴다.
 *
 * §154① 비과세 판정을 받는 주택(`isOneHouseExemptionAsset`)이고, 증여자가 사망하지 않았고, 관계가 「그 외」가 아닐 때.
 * **관계를 고르지 않았어도 묻는다**(결정 #34 조건: 관계 미선택이 질문을 건너뛰는 구멍이 되지 않게). 사망은 질문 없이 통산 없이
 * 계산하고 엔진이 확인 필요를 고지한다. 관계 「그 외」는 묻지 않고, 엔진이 별도 세대(증여일 기준)로 읽는다 — 묻지 않는 질문을
 * 미확인으로 읽어 「입력되지 않아」 고지와 보수 판정을 내면 사용자가 풀 길이 없다(`carryoverGiftHouseholdBasis`). 비주택은 이 사실이
 * 결론을 가르지 않아 묻지 않는다(§154① 판정을 받지 않는 입주권·분양권·토지는 미전송이어도 세액이 같다 — 실측).
 */
export function carryoverHouseholdFactVisible(asset: Pick<AssetForm, "assetKind" | "carryover">): boolean {
  const c = asset.carryover;
  return !!c && isOneHouseExemptionAsset(asset.assetKind) && c.donorRelation !== "other" && !c.donorDeceased;
}

/**
 * 이월과세 주택의 「주택 취득 당시」 기준일(YYYY-MM-DD) — Step4 조정대상지역 자동 판별의 기준일 (결정 #33 G4-1).
 *
 * 자산 카드에는 취득일 칸이 없어(`acquisitionDate`가 비어 있다) 종전에는 기준일이 비었다. 엔진은 증여자와 계속 같은 세대로 확인되면
 * 세대 보유 시작일, 아니면 증여일(`one-house/gift-household-basis.ts`)로 판정하므로 화면 자동 판별도 같은 날을 쓴다.
 * 세대 관계가 미확인(옛 이력)일 때 엔진은 증여자 취득일도 함께 보지만(주소가 있으면 코드 판정), 이 단일 기준일은 증여일이다.
 */
export function carryoverResidenceJudgmentDate(asset: Pick<AssetForm, "assetKind" | "carryover" | "acquisitionCause">): string | undefined {
  if (asset.acquisitionCause !== "carryover_gift" || !asset.carryover) return undefined;
  const c = asset.carryover;
  if (
    carryoverHouseholdFactVisible(asset) &&
    c.donorSameHousehold === "yes" &&
    c.donorHouseholdHoldingStartDate &&
    c.donorHouseholdHoldingStartDate >= c.donorAcquisitionDate &&
    c.donorHouseholdHoldingStartDate < c.giftRegistryDate
  )
    return c.donorHouseholdHoldingStartDate;
  return c.giftRegistryDate || undefined;
}

/** ④ 전송 조각 — 질문을 묻는 경우에만, 답한 값만. */
function carryoverHouseholdPayload(asset: AssetForm): {
  donorSameHouseholdContinuous?: boolean;
  donorHouseholdHoldingStartDate?: string;
} {
  const c = asset.carryover;
  if (!c || !carryoverHouseholdFactVisible(asset) || c.donorSameHousehold === "") return {};
  if (c.donorSameHousehold === "no") return { donorSameHouseholdContinuous: false };
  return {
    donorSameHouseholdContinuous: true,
    ...(c.donorHouseholdHoldingStartDate ? { donorHouseholdHoldingStartDate: c.donorHouseholdHoldingStartDate } : {}),
  };
}
