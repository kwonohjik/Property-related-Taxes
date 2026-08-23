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
import { applyRatio } from "@/lib/tax-engine/tax-utils";

/** 빈 문자열·0을 `undefined`로 — payload에 0을 실으면 「입력했다」와 구별되지 않는다. */
const amountOrUndefined = (s: string | undefined): number | undefined => {
  const n = parseAmount(s ?? "");
  return n > 0 ? n : undefined;
};

/** 파트 N벌 — 신규(안분) 경로. `landCarryoverPart`·`buildingCarryoverPart`. */
export interface GbCarryoverPartPayload {
  donorAcquisitionDate: string;
  donorAcquisitionPrice: number | undefined;
  donorCapitalExpenditure: number | undefined;
  giftDateAssetValue: number;
  useEstimatedAcquisition: boolean;
  donorStandardPriceAtAcquisition: number | undefined;
}

/** 엔진 모양 — legacy(사용자 안분) 경로. `landCarryoverTaxation`·`buildingCarryoverTaxation`. */
export interface GbCarryoverEngineShapedPayload {
  donorRelation: string | undefined;
  donorDeceased: boolean | undefined;
  giftRegistryDate: string;
  donorAcquisitionDate: string;
  donorAcquisitionPrice: number | undefined;
  useEstimatedAcquisition: boolean;
  giftTaxAmount: number;
  donorCapitalExpenditure: number | undefined;
  giftDateValuation: number;
  donorStandardPriceAtAcquisition: number | undefined;
  exclusionDeclared?: {
    expropriationWithin2Years: boolean | undefined;
    oneHouseExemptionApplies: boolean | undefined;
    isFamilyBusinessInheritedAsset: boolean | undefined;
  };
}

/** 사건 1벌 — 증여 그 자체의 사실. */
export interface GbCarryoverGiftEventPayload {
  giftRegistryDate: string;
  giftTaxCalculated: number;
  giftTaxBase: number;
  donorRelation: string | undefined;
  donorDeceased: boolean | undefined;
  exclusionDeclared?: GbCarryoverEngineShapedPayload["exclusionDeclared"];
}

function buildPart(c: CarryoverTaxationForm | undefined): GbCarryoverPartPayload | undefined {
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
function buildEngineShaped(
  c: CarryoverTaxationForm | undefined,
  /**
   * §97의2① 관계요건의 **정본**. 관계·사망은 파트가 아니라 **증여 사건**의 사실이라
   * 건물 파트도 토지 쪽 값을 따라야 한다 — 건물 폼에는 이 입력이 없어서
   * 그대로 두면 건물만 배제되지 않는다.
   */
  relationSource: CarryoverTaxationForm | undefined = c,
): GbCarryoverEngineShapedPayload | undefined {
  if (!c?.giftRegistryDate || !c.donorAcquisitionDate) return undefined;
  return {
    donorRelation: relationSource?.donorRelation || undefined,
    donorDeceased: relationSource?.donorDeceased || undefined,
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
  carryoverGiftEvent?: GbCarryoverGiftEventPayload;
  landCarryoverPart?: GbCarryoverPartPayload;
  buildingCarryoverPart?: GbCarryoverPartPayload;
  landCarryoverTaxation?: GbCarryoverEngineShapedPayload;
  buildingCarryoverTaxation?: GbCarryoverEngineShapedPayload;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 지분(공유) 모드 스케일 — `applyShareScale`이 여기로 위임한다.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 🔑 **분류표를 `Record<keyof …, boolean>`으로 두는 이유** — 위 인터페이스에 필드를 하나
 *    추가하면 `tsc`가 「이 표에 그 키가 없다」고 **컴파일 에러**를 낸다. 종전 `applyShareScale`은
 *    키 이름을 배열로 열거해서 **새 필드가 조용히 미스케일로 빠졌다** — 이 결함이 바로 그것이다.
 *    (같은 실패 모드가 ⑭ 필드 열거에서도 재발한 적이 있다.)
 *
 * `true` = 100% 기준으로 입력받은 **금액** → × 지분율.
 * `false` = 스케일 금지. 아래 세 부류다.
 *
 * 1. **금액이 아닌 것**(일자·관계·모드 플래그) — 자명.
 * 2. 🔴 **기준시가**(`donorStandardPriceAtAcquisition`) — 환산 산식
 *    `양도가액 × 취득시 기준시가 ÷ 양도시 기준시가`에서 **분모가 물건 전체(100%) 기준**이다
 *    (`general-building-valuation.ts`가 `transferLandPricePerSqm × landArea`로 도출하고,
 *    그 값은 `GB_SHARE_PROPERTY_LEVEL_PATHS`로 전 지분 동일이 강제된다). 분자 `transferPrice`는
 *    이미 × r 된 파트 양도가액이므로, 분자까지 줄이면 **× r²** 이 된다.
 *    실측: `donorStandardPriceAtAcquisition` 100,000,000 → scenarioA 취득가액 100,000,000,
 *    같은 값을 × 0.4 하면 40,000,000(이중 축소). 같은 규율이 `applyShareScale`·
 *    `buildCarryoverPayload`(컴패니언) JSDoc에도 이미 명문화돼 있다.
 * 3. ⚠️ **`giftTaxAmount`(legacy 증여세 상당액)** — 사용자가 영 §163의2②로 **직접 산정해 넣는**
 *    값이라 「100% 기준 증여세 상당액」이라는 관측 가능한 금액이 존재하지 않는다. 스케일하면
 *    실제 납부한 필요경비를 반감시켜 **근거 없이 불리하게** 적용하는 것이 된다.
 *    ⇒ 컴패니언 경로(F16 A-10 · anchor R-1c)의 결정을 그대로 승계한다. **뒤집지 말 것.**
 */
const PART_SCALE: Record<keyof GbCarryoverPartPayload, boolean> = {
  donorAcquisitionDate: false,
  /** §97의2①의 취득가액 — 배너 「취득가액은 물건 전체(100%) 기준」 대상. */
  donorAcquisitionPrice: true,
  /** §97의2① 필요경비 — 동 배너. */
  donorCapitalExpenditure: true,
  /**
   * 두 용도를 겸하는데 **둘 다 × r 을 요구한다.**
   * ① 영 §163의2②2호 안분 **분자** — 분모 `giftTaxBase`가 실제 증여 신고서의 과세가액이므로
   *    분자도 실제 증여받은 몫이어야 기준이 맞는다. 미스케일이면 40% 지분인데 안분 결과가
   *    산출세액 **전액**이 된다(실측: 48,000,000 + 32,000,000 = 80,000,000 = 산출세액 전부).
   * ② 비교과세 시나리오 B 취득가액 — 같은 카드의 `transferPrice`가 이미 × r 이다.
   */
  giftDateAssetValue: true,
  useEstimatedAcquisition: false,
  donorStandardPriceAtAcquisition: false, // 🔴 기준시가 — 위 2번
};

const ENGINE_SHAPED_SCALE: Record<keyof GbCarryoverEngineShapedPayload, boolean> = {
  donorRelation: false,
  donorDeceased: false,
  giftRegistryDate: false,
  donorAcquisitionDate: false,
  donorAcquisitionPrice: true,
  useEstimatedAcquisition: false,
  giftTaxAmount: false, // ⚠️ 의도적 미스케일 — 위 3번
  donorCapitalExpenditure: true,
  /** legacy 이름의 `giftDateAssetValue` — 시나리오 B 취득가액. */
  giftDateValuation: true,
  donorStandardPriceAtAcquisition: false, // 🔴 기준시가 — 위 2번
  exclusionDeclared: false,
};

/**
 * 사건-수준은 **스케일 대상이 0건**이다 — 두 금액 모두 증여세 신고서에 적힌 사실이고
 * 영 §163의2② 안분의 **계수(분자의 곱하는 수)·분모**다. 분자(`giftDateAssetValue`)만 × r 하면
 * 안분 결과가 정확히 지분 몫이 된다. 분모까지 함께 줄이면 분수에서 약분돼 무효이고,
 * 계수만 줄이면 §163의2②의 결과를 근거 없이 한 번 더 깎는다.
 */
const GIFT_EVENT_SCALE: Record<keyof GbCarryoverGiftEventPayload, boolean> = {
  giftRegistryDate: false,
  giftTaxCalculated: false,
  giftTaxBase: false,
  donorRelation: false,
  donorDeceased: false,
  exclusionDeclared: false,
};

function scaleByMap<T extends object>(
  obj: T,
  map: Record<keyof T, boolean>,
  ratio: number,
): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(map)) {
    if (!map[key as keyof T]) continue;
    const v = out[key];
    if (typeof v === "number" && v > 0) out[key] = applyRatio(v, ratio);
  }
  return out as T;
}

/**
 * 지분 모드 — valuation 안에 스프레드된 이월과세 서브객체를 100% 기준 → 지분 몫으로 줄인다.
 *
 * ## 왜 필요한가 (실측)
 *
 * 화면은 「지분 모드 — 모든 금액을 **100% 기준**으로 입력하세요 … **양도가액·취득가액·필요경비**는
 * 물건 전체(100%) 기준으로 입력합니다」라고 **선언**한다(`OwnershipRatioInput.tsx`). 그런데 GB는
 * 이월과세를 별도 빌더로 만들어 `applyShareScale`의 flat 키 목록 **밖**에 있었다 — `transferPrice`는
 * × r 되는데 증여자 취득가액은 100% 그대로 남아 **양도차익이 음수**가 되고, 그 허수 차손이
 * `lossOffsetFromSameGroup`으로 **다른 지분의 양도차익을 잠식**했다.
 *
 * 실측(지분 60:40 · 40%가 이월과세): `land#1 transferGain −101,800,000` → 지분 A의 차익
 * 각 51,800,000 잠식 → **결정세액 22,117,800**. 4필드를 × 0.4 하면 **124,413,600**
 * (102,295,800원 과소). 지분이 작을수록 커진다 — 1/4에서는 결정세액 **0**까지 떨어졌다.
 *
 * 같은 결함을 컴패니언(주택) 경로는 F16 A-10에서 이미 고쳤다(`buildCarryoverPayload`의
 * `ownershipRatio`). **GB만 그 파급을 못 받았다.**
 *
 * ⚠️ 종전 계획서 Q3(`transfer-gb-carryover-wiring.plan.md`)는 「스케일하지 않는다」로 확정하고
 *    anchor K-15로 고정했었다. 그 결정은 **「UI 안내 = 이 지분에 대한 실제 값을 입력하세요」**를
 *    3중 일치의 성립 요건으로 못박았는데 그 안내가 **끝내 구현되지 않았고**, 대신 같은 화면에
 *    「100% 기준」 배너가 렌더된다 ⇒ 전제가 무너졌다. 현행 UI 계약과 컴패니언 경로에 맞춰
 *    **스케일로 정본을 통일**한다(K-15는 이 규칙으로 갱신).
 */
export function applyGbCarryoverShareScale(
  valuation: Record<string, unknown>,
  ratio: number,
): Record<string, unknown> {
  if (ratio >= 1) return valuation;
  const out: Record<string, unknown> = { ...valuation };
  for (const k of ["landCarryoverPart", "buildingCarryoverPart"] as const) {
    const v = out[k] as GbCarryoverPartPayload | undefined;
    if (v) out[k] = scaleByMap(v, PART_SCALE, ratio);
  }
  for (const k of ["landCarryoverTaxation", "buildingCarryoverTaxation"] as const) {
    const v = out[k] as GbCarryoverEngineShapedPayload | undefined;
    if (v) out[k] = scaleByMap(v, ENGINE_SHAPED_SCALE, ratio);
  }
  const ev = out.carryoverGiftEvent as GbCarryoverGiftEventPayload | undefined;
  // 전 항목 false지만 **표를 통과시켜** 새 필드가 분류 없이 늘어나는 것을 tsc가 막게 한다.
  if (ev) out.carryoverGiftEvent = scaleByMap(ev, GIFT_EVENT_SCALE, ratio);
  return out;
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
        ? { buildingCarryoverTaxation: buildEngineShaped(asset.buildingCarryover ?? c, c) }
        : {}),
    };
  }

  return {
    carryoverGiftEvent: {
      giftRegistryDate: c.giftRegistryDate,
      giftTaxCalculated,
      giftTaxBase,
      // §97의2① 관계요건 — 사건-수준이 정본. route가 토지·건물 두 파트에 복사한다.
      donorRelation: c.donorRelation || undefined,
      donorDeceased: c.donorDeceased || undefined,
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
