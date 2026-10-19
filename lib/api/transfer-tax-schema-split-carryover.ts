/**
 * ⑫ 주택·건물 **토지·건물 분리 계산의 파트 이월과세**(소득세법 §97의2①) 와이어 shape — 단건(주 자산)·다건·컴패니언이 공유한다.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §1 (와이어 정본)
 *
 * 증여 **사건 1벌**(`carryoverGiftEvent`)과 **파트 N벌**(`landCarryoverPart`·`buildingCarryoverPart`)을 최상위 형제 키로 받는다.
 * 일반건물(`transfer-tax-building-schemas.ts`의 `carryoverGiftEvent` + `*CarryoverPart`)과 같은 사건 shape를 쓰되,
 *   · 파트에 **평가액 칸이 없다** — 파트 평가액은 기존 `landAcquisitionPrice`·`buildingAcquisitionPrice`가 정본이다(이중 진실 회피).
 *   · 증여세 상당액 칸이 없다 — ⑭ 합성기(`composeSplitCarryover`)가 영 §163의2②로 안분한다.
 *   · 파트 환산(`useEstimatedAcquisition`)이 없다 — 증여자 취득가액 필수(I-4).
 *
 * ⚠️ **leaf 규약** — 이 파일은 `zod`만 import한다. `transfer-tax-schema-base-shape.ts`·`transfer-tax-schema-split.ts`(둘 다 leaf)가
 *    spread하므로 다른 스키마 파일을 import하면 TDZ 위험이 생긴다. 일반건물 스키마가 여기 shape를 import한다(방향이 한쪽).
 */
import { z } from "zod";

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
 * ⑫ **파트별** 이월과세 입력 — 증여자가 그 파트(토지/건물)를 취득한 날·금액.
 * `donorAcquisitionPrice`는 양수 필수다(I-4: 파트 환산 없음 — 모르면 이 화면은 아직 지원하지 않는다).
 */
export const splitCarryoverPartShape = z.object({
  donorAcquisitionDate: z.string().date(),
  /** 증여자의 취득 당시 금액 (§97의2①1호) */
  donorAcquisitionPrice: z.number().int().positive(),
  /** 증여자가 보유 중 지출한 자본적지출 (§97의2①2호 — 양도일 2024.1.1. 전은 엔진이 0 처리) */
  donorCapitalExpenditure: z.number().int().nonnegative().optional(),
});

/** 단건 `propertyBaseShape`·컴패니언 `splitAcquisitionShape`가 spread하는 최상위 키 3종 */
export const splitCarryoverShape = {
  carryoverGiftEvent: carryoverGiftEventShape.optional(),
  landCarryoverPart: splitCarryoverPartShape.optional(),
  buildingCarryoverPart: splitCarryoverPartShape.optional(),
} as const;

type Issue = (path: (string | number)[], message: string) => void;

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
    carryoverGiftEvent?: z.infer<typeof carryoverGiftEventShape>;
    landCarryoverPart?: z.infer<typeof splitCarryoverPartShape>;
    buildingCarryoverPart?: z.infer<typeof splitCarryoverPartShape>;
    landAcquisitionPrice?: number;
    buildingAcquisitionPrice?: number;
  },
  issue: Issue,
  prefix: (string | number)[] = [],
): void {
  const ev = d.carryoverGiftEvent;
  if (!ev || (!d.landCarryoverPart && !d.buildingCarryoverPart)) return; // 짝 누락·stray는 leaf(S1)가 짚는다
  const at = (k: string) => [...prefix, k];
  for (const [key, part] of [["landCarryoverPart", d.landCarryoverPart], ["buildingCarryoverPart", d.buildingCarryoverPart]] as const) {
    if (part && part.donorAcquisitionDate > ev.giftRegistryDate)
      issue([...at(key), "donorAcquisitionDate"], "증여자의 취득일이 증여 등기접수일보다 늦을 수 없습니다 (소득세법 §97의2①)");
  }
  if (ev.donorRelation === "other") return;
  const sum =
    (d.landCarryoverPart ? (d.landAcquisitionPrice ?? 0) : 0) + (d.buildingCarryoverPart ? (d.buildingAcquisitionPrice ?? 0) : 0);
  if (sum > ev.giftTaxBase)
    issue(at("carryoverGiftEvent").concat("giftTaxBase"), "파트별 증여 당시 평가액 합계가 증여세 과세가액을 초과합니다 (소득세법 시행령 §163의2②)");
}
