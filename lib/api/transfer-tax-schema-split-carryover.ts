/**
 * ⑫ 주택·건물 **토지·건물 분리 계산의 파트 이월과세**(소득세법 §97의2①) 와이어 shape — 단건(주 자산)·다건·컴패니언이 공유한다.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §1 (와이어 정본)
 *
 * 증여 **사건 1벌**(`carryoverGiftEvent`)과 **파트 N벌**(`landCarryoverPart`·`buildingCarryoverPart`)을 최상위 형제 키로 받는다.
 * 일반건물(`transfer-tax-building-schemas.ts`의 `carryoverGiftEvent` + `*CarryoverPart`)과 같은 사건 shape를 쓰되,
 *   · 파트에 **평가액 칸이 없다** — 파트 평가액은 기존 `landAcquisitionPrice`·`buildingAcquisitionPrice`가 정본이다(이중 진실 회피).
 *   · 증여세 상당액 칸이 없다 — ⑭ 합성기(`composeSplitCarryover`)가 영 §163의2②로 안분한다.
 *   · 파트 환산(P6): 증여자 취득가액을 모르면 `useEstimatedAcquisition` + `donorStandardPriceAtAcquisition`(증여자 취득 당시 그 파트 기준시가 총액)으로 보낸다 —
 *     가액과 분자는 상호배타다(`refineSplitCarryoverValues`). 분모(양도 당시 그 파트 기준시가)는 새로 받지 않고 기존 `*StandardPriceAtTransfer`를 쓴다.
 *
 * ⚠️ **leaf 규약** — 이 파일은 **다른 스키마 파일을 import하지 않는다**(`zod`와 스키마가 아닌 순수 모듈만). `transfer-tax-schema-base-shape.ts`·
 *    `transfer-tax-schema-split.ts`(둘 다 leaf)가 spread하므로 스키마 파일을 import하면 TDZ 위험이 생긴다. 일반건물 스키마가 여기 shape를 import한다(방향이 한쪽).
 */
import { z } from "zod";
import { toDate } from "@/lib/api/date-coerce";
import { maxPriorResidenceMonthsBetween } from "@/lib/tax-engine/one-house/gift-household-basis";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { donorBuiltRejectedKey, donorBuiltShape } from "./transfer-tax-schema-donor-built";

/** 이월과세 적용배제 선언 (법 §97의2②) — 토지·건물·일반건물 공통. */
export const carryoverExclusionShape = z.object({
  expropriationWithin2Years: z.boolean().optional(),
  /** D45 · Q-3 — 옛 이력의 「② 2호 선언」(레거시). 옛 키 `oneHouseExemptionApplies`는 strip된다. */
  legacyOneHouseExemptionDeclared: z.boolean().optional(),
  isFamilyBusinessInheritedAsset: z.boolean().optional(),
});

/**
 * ⑫ **증여 사건** (파트로 나뉘지 않는 사실) — 영 §163의2②1호·3호. 일반건물(`generalBuildingValuation.carryoverGiftEvent`)과 같은 shape.
 */
export const carryoverGiftEventShape = z.object({
  giftRegistryDate: z.string().date(),
  /** 영 §163의2②1호 증여세 산출세액 */
  giftTaxCalculated: z.number().int().nonnegative(),
  /** 영 §163의2②3호 증여세 과세가액 — 안분 분모 */
  giftTaxBase: z.number().int().positive(),
  /** §97의2① 관계요건 — 하나의 증여이므로 사건-수준이 정본이다. ⑭가 두 파트에 복사한다. */
  donorRelation: z.enum(["spouse", "lineal", "other"]).optional(),
  donorDeceased: z.boolean().optional(),
  exclusionDeclared: carryoverExclusionShape.optional(),
});

/**
 * ⑫ 주택 split의 증여 사건 — 일반건물 사건 shape에 **§97의2②2호 판정 사실**(P5)을 더한다. 일반건물은 1세대1주택 판정이 없어 이 키를 받지 않는다
 * (받으면 조용히 무시되는 입력이 된다).
 *   · 세대 사실(결정 #33·#34·#38) — 건물(주택)이 이월과세일 때만(B·C). 토지만(A)이면 건물은 수증자 본인 취득이라 묻지 않는다(P5-Q3).
 *   · 배우자 예외(D45) — 주택 통째 증여(C)만. 해석례의 대상이 주택·주택 지분이다(P5-Q4).
 */
export const splitCarryoverGiftEventShape = carryoverGiftEventShape.extend({
  donorSameHouseholdContinuous: z.boolean().optional(),
  donorHouseholdHoldingStartDate: z.string().date().optional(),
  donorPriorHouseholdResidenceMonths: z.number().int().nonnegative().optional(),
  donorRejoinedAfterDivorce: z.boolean().optional(),
  spouseGiftOneHouseAtGiftDate: z.boolean().optional(),
});

/**
 * ⑫ **파트별** 이월과세 입력 — 증여자가 그 파트(토지/건물)를 취득한 날·금액.
 * 실가면 `donorAcquisitionPrice`(양수), 모르면 환산(`useEstimatedAcquisition` + `donorStandardPriceAtAcquisition` 양수) — 둘은 상호배타이고
 * 어느 쪽이든 하나는 필수다(`refineSplitCarryoverValues` — 키별 optional이라 shape만으로는 막지 못한다).
 */
export const splitCarryoverPartShape = z.object({
  donorAcquisitionDate: z.string().date(),
  /** 증여자의 취득 당시 금액 (§97의2①1호) — 환산이면 보내지 않는다 */
  donorAcquisitionPrice: z.number().int().positive().optional(),
  /** P6 — 증여자 취득가액을 모를 때 환산취득가액(§97①1호 나목)으로 계산한다. 미지정 = false(P1~P5 payload 그대로) */
  useEstimatedAcquisition: z.boolean().optional(),
  /**
   * P6 — 환산취득가액의 분자: 증여자 취득 당시 그 파트 기준시가 **총액**(물건 전체 값 — 지분 스케일 금지).
   * 0이면 환산취득가 0·개산공제 0이라 `nonnegative`를 쓰지 않는다(일반건물 shape의 침묵 오산출 전례).
   */
  donorStandardPriceAtAcquisition: z.number().int().positive().optional(),
  /** 증여자가 보유 중 지출한 자본적지출 (§97의2①2호 — 양도일 2024.1.1. 전은 엔진이 0 처리) */
  donorCapitalExpenditure: z.number().int().nonnegative().optional(),
  /**
   * 당초 증여 때 이 파트에 담보된 채무로서 인수한 금액(「상속세 및 증여세법」 제47조 제1항) — 영 §163의2②2호 분자(파트 평가액 − 이 값)에서만 뺀다.
   * B 취득가액은 파트 평가액 그대로다. 파트 평가액 이하(`refineSplitCarryoverValues`). 미전송 = 0. 계획서 `carryover-gift-tax-numerator-net.plan.md` §4.2.
   */
  giftAssumedDebt: z.number().int().nonnegative().optional(),
  /** 증여자 신축·증축 가산세(§114조의2)는 **건물 파트만** 받는다(`splitCarryoverBuildingPartShape`) — 토지 파트에는 침묵 무시 대신 거부 */
  donorBuilt: donorBuiltRejectedKey,
});

/**
 * PR-3 — 건물 파트의 증여자 신축·증축(§114조의2). 일체 주택 안분(`housing`)은 split 파트에 필요 없다(파트별 기준시가가 이미 나뉘어 있다) —
 * 받으면 조용히 strip되지 않도록 `.strict()`로 400을 낸다.
 */
export const splitDonorBuiltShape = donorBuiltShape.omit({ housing: true }).strict();

/** 건물 파트 — 토지 파트 shape + 증여자 신축·증축. `buildingCarryoverPart`만 이 shape를 쓴다. */
export const splitCarryoverBuildingPartShape = splitCarryoverPartShape.extend({
  donorBuilt: splitDonorBuiltShape.optional(),
});

/** 단건 `propertyBaseShape`·컴패니언 `splitAcquisitionShape`가 spread하는 최상위 키 3종 */
export const splitCarryoverShape = {
  carryoverGiftEvent: splitCarryoverGiftEventShape.optional(),
  landCarryoverPart: splitCarryoverPartShape.optional(),
  buildingCarryoverPart: splitCarryoverBuildingPartShape.optional(),
} as const;

type Issue = (path: (string | number)[], message: string) => void;

/**
 * 결정 #38 — 이월과세 「증여자와 계속 같은 세대」가 「예」면 세대 보유 시작일(증여자 취득일 ≤ 시작일 < 증여 등기접수일)이 필수다.
 * 비우면 엔진이 미확인으로 읽어 「같다고 답했는데 효과가 없는」 상태가 된다. 일반 증여 refine(`transfer-tax-schema-refines.ts`)·
 * ⑧(`transfer-tax-validate-acquisition.ts`)과 같은 조건이다. 자산 단위 이월과세(`refineCarryoverHouseholdStart`)와 주택 split 파트 이월과세(P5)가 함께 쓴다.
 */
export function carryoverHouseholdStartIssues(
  ct: {
    giftRegistryDate: string;
    donorAcquisitionDate: string;
    donorSameHouseholdContinuous?: boolean;
    donorHouseholdHoldingStartDate?: string;
    donorPriorHouseholdResidenceMonths?: number;
  },
  issue: Issue,
  prefix: (string | number)[] = [],
): void {
  // 결정 #38-7 — 증여 전 동일세대 거주 개월은 「계속 같은 세대」일 때만 의미가 있다. 아니면 조용히 무시되는 입력이 되므로 막는다(⑧·④와 같은 조건).
  if (ct.donorSameHouseholdContinuous !== true) {
    if (ct.donorPriorHouseholdResidenceMonths !== undefined)
      issue([...prefix, "donorPriorHouseholdResidenceMonths"], "증여 전 동일세대 거주 개월은 증여자와 계속 같은 세대일 때만 입력할 수 있습니다");
    return;
  }
  const start = ct.donorHouseholdHoldingStartDate;
  if (!start) {
    issue([...prefix, "donorHouseholdHoldingStartDate"], "증여자와 계속 같은 세대이면 세대 보유 시작일이 필요합니다 (소득세법 시행령 §154①)");
  } else if (start >= ct.giftRegistryDate || start < ct.donorAcquisitionDate) {
    issue([...prefix, "donorHouseholdHoldingStartDate"], "세대 보유 시작일은 증여자 취득일 이후, 증여일 이전이어야 합니다");
  } else if (ct.donorPriorHouseholdResidenceMonths !== undefined) {
    const max = maxPriorResidenceMonthsBetween(toDate(start, "donorHouseholdHoldingStartDate"), toDate(ct.giftRegistryDate, "giftRegistryDate"));
    if (ct.donorPriorHouseholdResidenceMonths > max)
      issue(
        [...prefix, "donorPriorHouseholdResidenceMonths"],
        `증여 전 동일세대 거주 개월은 세대 보유 시작일부터 증여 등기접수일까지(${max}개월)를 넘을 수 없습니다`,
      );
  }
}

export const SPLIT_CARRYOVER_HOUSEHOLD_LAND_ONLY_MESSAGE =
  "증여자와의 세대 사실은 건물(주택)이 이월과세일 때만 입력합니다 — 토지만 이월과세이면 건물은 본인이 취득해 1세대1주택 판정에 쓰지 않습니다 (소득세법 시행령 §154①)";
export const SPLIT_CARRYOVER_SPOUSE_EXCEPTION_PART_MESSAGE =
  "배우자 예외(증여일 현재 1세대1주택을 배우자로부터 증여)는 토지·건물을 통째로 증여받은 경우에만 입력합니다 — 토지만·건물만 증여받은 경우는 해석례가 없어 적용하지 않습니다 (소득세법 §97의2②2호)";

/**
 * 파트 이월과세 입력의 값 검사 (⑫) — 일반건물 `refineGbCarryover`의 거울.
 *   · 파트 증여 당시 평가액 합 ≤ 증여세 과세가액 (넘으면 파트별 증여세 상당액 합이 산출세액을 초과한다 — 영 §163의2②)
 *   · 증여자 취득일 ≤ 증여 등기접수일
 * 관계 「그 외」는 엔진이 §97의2① 요건 불충족으로 미적용을 판정하므로 증여자 기준 값 검사를 건너뛴다(`required-refines-gb.ts` 선례).
 *
 * 평가액은 정본인 `landAcquisitionPrice`·`buildingAcquisitionPrice`를 읽는다(파트에 평가액 칸이 없다).
 */
export function refineSplitCarryoverValues(
  d: {
    carryoverGiftEvent?: z.infer<typeof splitCarryoverGiftEventShape>;
    landCarryoverPart?: z.infer<typeof splitCarryoverPartShape>;
    buildingCarryoverPart?: z.infer<typeof splitCarryoverBuildingPartShape>;
    landAcquisitionPrice?: number;
    buildingAcquisitionPrice?: number;
    landStandardPriceAtTransfer?: number;
    buildingStandardPriceAtTransfer?: number;
    // PR-3 — 증여자 신축·증축(건물 파트)이 계산에 닿을 수 있는 자산 조건(엔진 `assertDonorBuiltPartInput`의 거울)
    propertyType?: string;
    preHousingDisclosure?: unknown;
    transferType?: string;
  },
  issue: Issue,
  prefix: (string | number)[] = [],
): void {
  const at = (k: string) => [...prefix, k];
  refineSplitDonorBuilt(d, issue, prefix);
  // P6 — 파트 가액 ⇔ 환산 분자 (상호배타 + 하나 필수). 사건 유무와 무관한 파트 자체의 완결이다(가액이 optional이 되어 shape가 더는 필수를 강제하지 않는다).
  for (const [key, part, transferStd, noun] of [
    ["landCarryoverPart", d.landCarryoverPart, d.landStandardPriceAtTransfer, "토지"],
    ["buildingCarryoverPart", d.buildingCarryoverPart, d.buildingStandardPriceAtTransfer, "건물"],
  ] as const) {
    if (!part) continue;
    if (part.useEstimatedAcquisition === true) {
      if (part.donorAcquisitionPrice !== undefined)
        issue([...at(key), "donorAcquisitionPrice"], `${noun} 파트 환산취득가액을 쓰면 증여자 취득가액은 보내지 않습니다 — 둘 중 하나만 입력합니다 (${TRANSFER.CARRYOVER_DONOR_BASIS})`);
      if (part.donorStandardPriceAtAcquisition === undefined)
        issue([...at(key), "donorStandardPriceAtAcquisition"], `${noun} 파트 환산취득가액에는 증여자 취득 당시 그 파트 기준시가가 필요합니다 (${TRANSFER.CARRYOVER_ESTIMATED_ACQ}·${TRANSFER.CARRYOVER_DONOR_BASIS})`);
      // 분모 — 엔진이 환산 파트에 한해 던지는 조건과 같다. 양도시 기준시가 연혁 면제(2016.1.1. 전 구분 기재)는 환산 파트가 있으면 적용하지 않는다(분모가 계산에 쓰인다).
      if (!((transferStd ?? 0) > 0))
        issue([...prefix, key === "landCarryoverPart" ? "landStandardPriceAtTransfer" : "buildingStandardPriceAtTransfer"],
          `${noun} 파트 환산취득가액의 분모인 양도 당시 ${noun} 기준시가가 필요합니다 — 취득시 비율로 대신 나누지 않습니다 (소득세법 §99①1호, 시행령 §164③)`);
    } else {
      if (part.donorStandardPriceAtAcquisition !== undefined)
        issue([...at(key), "donorStandardPriceAtAcquisition"], `${noun} 파트 환산 분자는 환산취득가액을 쓸 때만 보낼 수 있습니다 — 조용히 버려지지 않도록 막습니다 (${TRANSFER.CARRYOVER_DONOR_BASIS})`);
      if (part.donorAcquisitionPrice === undefined)
        issue([...at(key), "donorAcquisitionPrice"], `${noun} 파트 증여자 취득가액이 필요합니다 — 모르면 환산취득가액(증여자 취득 당시 기준시가)으로 입력하세요 (${TRANSFER.CARRYOVER_DONOR_BASIS})`);
    }
  }
  const ev = d.carryoverGiftEvent;
  if (!ev || (!d.landCarryoverPart && !d.buildingCarryoverPart)) return; // 짝 누락·stray는 leaf(S1)가 짚는다
  for (const [key, part] of [["landCarryoverPart", d.landCarryoverPart], ["buildingCarryoverPart", d.buildingCarryoverPart]] as const) {
    if (part && part.donorAcquisitionDate > ev.giftRegistryDate)
      issue([...at(key), "donorAcquisitionDate"], "증여자의 취득일이 증여 등기접수일보다 늦을 수 없습니다 (소득세법 §97의2①)");
  }
  // P5 §97의2②2호 — 세대 사실은 건물(주택) 파트의 사실이다(⑭가 건물 파트에만 싣는다). 토지만이면 받지 않는다(조용히 버려지는 입력 방지).
  const hasHousehold =
    ev.donorSameHouseholdContinuous !== undefined || ev.donorHouseholdHoldingStartDate !== undefined
    || ev.donorPriorHouseholdResidenceMonths !== undefined || ev.donorRejoinedAfterDivorce !== undefined;
  if (hasHousehold && !d.buildingCarryoverPart)
    issue(at("carryoverGiftEvent").concat("donorSameHouseholdContinuous"), SPLIT_CARRYOVER_HOUSEHOLD_LAND_ONLY_MESSAGE);
  if (d.buildingCarryoverPart)
    carryoverHouseholdStartIssues(
      { ...ev, donorAcquisitionDate: d.buildingCarryoverPart.donorAcquisitionDate },
      issue,
      at("carryoverGiftEvent"),
    );
  if (ev.spouseGiftOneHouseAtGiftDate !== undefined && !(d.landCarryoverPart && d.buildingCarryoverPart))
    issue(at("carryoverGiftEvent").concat("spouseGiftOneHouseAtGiftDate"), SPLIT_CARRYOVER_SPOUSE_EXCEPTION_PART_MESSAGE);
  // 영 §163의2②2호 분자 = 파트 평가액 − 당초 증여 때 인수한 채무(채무가 평가액을 넘을 수 없다).
  const taxed = (key: "landCarryoverPart" | "buildingCarryoverPart", part: { giftAssumedDebt?: number } | undefined, value: number | undefined, noun: string): number => {
    if (!part) return 0;
    const debt = part.giftAssumedDebt ?? 0;
    if (debt > (value ?? 0))
      issue([...at(key), "giftAssumedDebt"], `${noun} 파트의 당초 증여 때 인수한 채무가 증여 당시 평가액보다 큽니다 (상속세 및 증여세법 §47①)`);
    return Math.max(0, (value ?? 0) - debt);
  };
  const sum =
    taxed("landCarryoverPart", d.landCarryoverPart, d.landAcquisitionPrice, "토지") + taxed("buildingCarryoverPart", d.buildingCarryoverPart, d.buildingAcquisitionPrice, "건물");
  if (ev.donorRelation === "other") return;
  if (sum > ev.giftTaxBase)
    issue(at("carryoverGiftEvent").concat("giftTaxBase"), "파트별 증여세 과세가액(증여 당시 평가액 − 당초 증여 때 인수한 채무) 합계가 증여세 과세가액을 초과합니다 (소득세법 시행령 §163의2②)");
}

/**
 * 건물 파트 `donorBuilt`의 값 검사 (⑫) — 엔진 `assertDonorBuiltPartInput`·⑧ `validateSplitDonorBuilt`와 같은 조건(UI 통과 ⇒ ⑫ 통과, 400 모순 0).
 * 사건(`carryoverGiftEvent`)이 없으면 날짜 상한은 건너뛴다 — 짝 누락은 leaf(S1)가 짚는다.
 */
function refineSplitDonorBuilt(
  d: {
    carryoverGiftEvent?: { giftRegistryDate: string };
    buildingCarryoverPart?: z.infer<typeof splitCarryoverBuildingPartShape>;
    propertyType?: string;
    preHousingDisclosure?: unknown;
    transferType?: string;
  },
  issue: Issue,
  prefix: (string | number)[],
): void {
  const part = d.buildingCarryoverPart;
  const db = part?.donorBuilt;
  if (!part || !db) return;
  const at = (...k: (string | number)[]) => [...prefix, "buildingCarryoverPart", "donorBuilt", ...k];
  if (part.useEstimatedAcquisition !== true)
    issue(at(), "증여자 신축·증축 가산세(소득세법 §114조의2)는 증여자 취득가액을 환산취득가액으로 계산할 때만 적용됩니다 — 실지거래가액 승계에는 보낼 수 없습니다");
  if (d.propertyType !== "housing" && d.propertyType !== "building") issue(at(), "증여자 신축·증축 가산세는 주택·건물에만 적용됩니다");
  if (d.preHousingDisclosure) issue(at(), "개별주택가격·공동주택가격 최초공시 전 환산과 함께 쓸 수 없습니다 — 신축 후 5년 이내 양도 건물은 최초공시 이후 취득입니다");
  if (d.transferType === "burdened_gift") issue(at(), "부담부증여의 이월과세는 아직 지원하지 않습니다");
  if (db.constructionDate < part.donorAcquisitionDate || (d.carryoverGiftEvent && db.constructionDate > d.carryoverGiftEvent.giftRegistryDate))
    issue(at("constructionDate"), "증여자의 신축·증축일은 증여자 취득일 이후, 증여 등기접수일 이전이어야 합니다");
  if (db.buildingType === "extension") {
    if (!db.extensionFloorArea) issue(at("extensionFloorArea"), "증축은 바닥면적 합계가 필요합니다 (85㎡ 초과만 대상)");
    if (!db.extensionStdPriceAtAcquisition) issue(at("extensionStdPriceAtAcquisition"), "증축 가산세는 증축 부분의 증여자 취득(완공) 당시 기준시가가 필요합니다");
  }
}
