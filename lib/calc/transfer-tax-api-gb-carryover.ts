/**
 * ④ 일반건물 × 배우자등 이월과세(§97의2) — 폼 → payload 변환.
 *
 * 계획: `docs/00-pm/transfer-gb-carryover-wiring.plan.md`
 * 설계: `docs/02-design/features/transfer-gb-carryover-wiring.engine.design.md` D9-10
 *
 * ## 왜 이 파일이 생겼나
 *
 * 종전 ④는 `landAcquisitionCause: "carryover_gift"`만 싣고 **서브객체를 만들지 않았다**.
 * 엔진 STEP 0.475 조건(`acquisitionCause === "carryover_gift" && carryoverTaxation`)이
 * 불충족돼 **조용히 미발동** — 사용자는 10칸을 채우는데 세액이 1원도 안 바뀌었다
 * (실측: 200 OK · 경고 0 · 세액 그대로).
 *
 * ## 출력 모양 — 사건 1벌 + 파트 N벌
 *
 * 엔진은 파트마다 완결된 객체를 원하지만 **증여는 하나**다. 그래서 사건(등기일·산출세액·
 * 과세가액·배제선언)은 1벌로 보내고 route가 조립한다. 증여세 상당액은 **route가**
 * 영 §163의2②로 산정한다 — 사용자가 안분하지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";

/** 빈 문자열·0을 `undefined`로 — payload에 0을 실으면 「입력했다」와 구별되지 않는다. */
const amountOrUndefined = (s: string | undefined): number | undefined => {
  const n = parseAmount(s ?? "");
  return n > 0 ? n : undefined;
};

function buildPart(c: CarryoverTaxationForm | undefined) {
  if (!c?.donorAcquisitionDate) return undefined;
  return {
    donorAcquisitionDate: c.donorAcquisitionDate,
    donorAcquisitionPrice: c.useEstimatedAcquisition
      ? undefined
      : amountOrUndefined(c.donorAcquisitionPrice),
    donorCapitalExpenditure: amountOrUndefined(c.donorCapitalExpenditure),
    /** 영 §163의2②2호 안분 분자 + 비교과세 시나리오 B 취득가액 (같은 값을 겸한다). */
    giftDateAssetValue: parseAmount(c.giftDateValuation),
    useEstimatedAcquisition: c.useEstimatedAcquisition,
    /** 환산 모드 분자 — 증여자 취득 당시 그 파트의 기준시가 (설계 D9-8). */
    donorStandardPriceAtAcquisition: c.useEstimatedAcquisition
      ? amountOrUndefined(c.donorStandardPriceAtAcquisition)
      : undefined,
  };
}

/**
 * 엔진 모양 서브객체 — **증여세를 사용자가 안분한** legacy 경로.
 *
 * 신규 2칸(산출세액·과세가액)을 채우지 않은 입력(기존 sessionStorage 포함)에서도
 * 이월과세가 **동작해야 한다** — 안 그러면 「입력했는데 세액 그대로」가 그대로 남는다.
 */
function buildEngineShaped(c: CarryoverTaxationForm | undefined) {
  if (!c?.giftRegistryDate || !c.donorAcquisitionDate) return undefined;
  return {
    giftRegistryDate: c.giftRegistryDate,
    donorAcquisitionDate: c.donorAcquisitionDate,
    donorAcquisitionPrice: c.useEstimatedAcquisition
      ? undefined
      : amountOrUndefined(c.donorAcquisitionPrice),
    useEstimatedAcquisition: c.useEstimatedAcquisition,
    giftTaxAmount: parseAmount(c.giftTaxAmount),
    donorCapitalExpenditure: amountOrUndefined(c.donorCapitalExpenditure),
    giftDateValuation: parseAmount(c.giftDateValuation),
    // 환산 분자 — 이 경로에서도 실어야 취득가액 0을 피한다(설계 D9-8).
    donorStandardPriceAtAcquisition: c.useEstimatedAcquisition
      ? amountOrUndefined(c.donorStandardPriceAtAcquisition)
      : undefined,
    ...(c.exclusionDeclared
      ? {
          exclusionDeclared: {
            expropriationWithin2Years: c.exclusionDeclared.expropriationWithin2Years || undefined,
            oneHouseExemptionApplies: c.exclusionDeclared.oneHouseExemptionApplies || undefined,
            isFamilyBusinessInheritedAsset:
              c.exclusionDeclared.isFamilyBusinessInheritedAsset || undefined,
          },
        }
      : {}),
  };
}

export interface GbCarryoverPayload {
  carryoverGiftEvent?: object;
  landCarryoverPart?: object;
  buildingCarryoverPart?: object;
  landCarryoverTaxation?: object;
  buildingCarryoverTaxation?: object;
}

/**
 * 일반건물 payload에 얹을 이월과세 조각.
 *
 * @returns 해당 없으면 `{}` — 스프레드해도 무해하다.
 */
export function buildGbCarryoverPayload(asset: AssetForm): GbCarryoverPayload {
  /**
   * 🔴 **부담부증여에는 이 payload를 만들지 않는다** — 차단이 아니라 **중복 배선 회피**다.
   *
   * 부담부증여 × 이월과세는 **다른 줄기가 이미 지원한다**(D-7a·D-7b,
   * `burdened-gift-carryover-159-97-2.plan.md`). 그쪽은 영 §159 안분 단계에 세 축을
   * 배선하고 `bgCoDonor*` 입력을 쓴다 — `landCarryoverTaxation`을 쓰지 않는다.
   *
   * 여기서 서브객체를 함께 실으면 **§159 경로와 §97의2 경로가 각각 취득가액을 만들어**
   * 어느 쪽이 이겼는지 화면으로 알 수 없게 된다.
   *
   * ⚠️ **차단 메시지를 띄우지 않는다** — 초안은 ⑧에서 사유를 말하게 했는데, 그것이
   *    그쪽 ⑧(「당초 증여자」 입력 요구)를 가로채 **지원된 기능을 막았다**
   *    (E2E CB-2 실패로 실측, 2026-08-10 정정).
   */
  if (asset.transferType === "burdened_gift") return {};

  const landIsCarryover = asset.acquisitionCause === "carryover_gift";
  const buildingIsCarryover = asset.gbBuildingAcquisitionCause === "carryover_gift";
  if (!landIsCarryover && !buildingIsCarryover) return {};

  // 증여 사건은 **토지 쪽 서브객체 하나**가 정본이다 — 하나의 증여이므로 두 벌을 두지 않는다.
  const c = asset.carryover;
  if (!c?.giftRegistryDate) return {};

  const giftTaxCalculated = parseAmount(c.giftTaxCalculated);
  const giftTaxBase = parseAmount(c.giftTaxBase);
  /**
   * 🔑 **두 칸이 다 차 있을 때만** 안분한다. 하나만 있으면 분모가 없어 증여세 상당액이
   *    0이 되는데, 그건 「입력했는데 반영 안 됨」의 재발이다.
   *
   * ⇒ 안분 불가면 **legacy 엔진 모양**으로 내려간다 — 사용자가 `giftTaxAmount`에 직접
   *   안분해 넣은 값을 쓴다. 기존 sessionStorage와 API 직접 호출자가 여기 해당한다.
   *   ⑧ validate가 신규 2칸을 권장·강제하지만, **못 채웠다고 이월과세를 꺼버리진 않는다.**
   */
  if (!(giftTaxCalculated > 0) || !(giftTaxBase > 0)) {
    return {
      ...(landIsCarryover ? { landCarryoverTaxation: buildEngineShaped(c) } : {}),
      ...(buildingIsCarryover
        ? { buildingCarryoverTaxation: buildEngineShaped(asset.buildingCarryover ?? c) }
        : {}),
    };
  }

  return {
    carryoverGiftEvent: {
      giftRegistryDate: c.giftRegistryDate,
      giftTaxCalculated,
      giftTaxBase,
      ...(c.exclusionDeclared
        ? {
            exclusionDeclared: {
              expropriationWithin2Years: c.exclusionDeclared.expropriationWithin2Years || undefined,
              oneHouseExemptionApplies: c.exclusionDeclared.oneHouseExemptionApplies || undefined,
              isFamilyBusinessInheritedAsset:
                c.exclusionDeclared.isFamilyBusinessInheritedAsset || undefined,
            },
          }
        : {}),
    },
    ...(landIsCarryover ? { landCarryoverPart: buildPart(c) } : {}),
    // 건물은 자기 파트 입력을 쓰고, 없으면 토지 것과 같은 증여라 보고 토지 파트를 재사용한다.
    ...(buildingIsCarryover
      ? { buildingCarryoverPart: buildPart(asset.buildingCarryover ?? c) }
      : {}),
  };
}
