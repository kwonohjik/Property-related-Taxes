/**
 * ⑫ 이월과세 × **증여자가 신축·증축한 건물**(소득세법 §114조의2) 입력 스키마 — `carryoverTaxation.donorBuilt`.
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-1)
 *
 * 이 객체는 **단건 인라인 shape(`transfer-tax-schema-base-shape.ts`)과 엔진 shape(`carryoverTaxationEngineShape` — 컴패니언·GB 파트)가
 * 함께 쓴다.** 한쪽에만 두면 다른 쪽에서 **침묵 strip**된다(400이 아니라 200 + 가산세 0).
 * GB **토지** 파트(`landCarryoverTaxation`·`landCarryoverPart`)와 split **토지 파트**(`splitCarryoverPartShape`)는
 * 범위 밖이라 **명시 거부**한다(`rejectDonorBuiltRefine`·`donorBuiltRejectedKey`) — 받아 놓고 무시하면 침묵 오답이다.
 * split **건물 파트**(`buildingCarryoverPart`)는 PR-3 부터 수용한다 — `lib/api/transfer-tax-schema-split-carryover.ts`의 `splitCarryoverBuildingPartShape`.
 * 일반건물 **건물 파트**(`buildingCarryoverTaxation`·`buildingCarryoverPart`)는 PR-5a 부터 수용한다 — 아래 `refineGbBuildingDonorBuilt`.
 */
import { z } from "zod";
import { toDate } from "./date-coerce";

const positiveInt = z.number().int().positive();

export const donorBuiltHousingShape = z.object({
  /** 증여자 취득 당시 ㎡당 개별공시지가 */
  landPricePerSqmAtAcquisition: positiveInt,
  /** 토지 면적 (㎡) */
  landArea: z.number().positive(),
  /** 증여자 취득 당시 건물 기준시가 N */
  buildingStdPriceAtAcquisition: positiveInt,
  /** 양도 당시 토지·건물 기준시가 — 건물분 안분과 양도가액 기준시가 안분에 둘 다 쓰인다 */
  landStdPriceAtTransfer: positiveInt,
  buildingStdPriceAtTransfer: positiveInt,
  /** 양도가액 토지·건물 구분(소득세법 §100②·③ · 영 §166⑥·⑧) — `resolveTransferPriceSplit` 법정 서열 입력 */
  sale: z
    .object({
      landTransferPrice: z.number().int().nonnegative().optional(),
      buildingTransferPrice: z.number().int().nonnegative().optional(),
      /** 공유지분 계약서(100%) 구분 기재 — §100③ 판정 전용(위 두 칸은 지분 몫). 본인 신축 `selfBuiltHousingShape`도 이 객체를 쓴다 */
      contractLandTransferPrice: z.number().int().nonnegative().optional(),
      contractBuildingTransferPrice: z.number().int().nonnegative().optional(),
      landAppraisalAtTransfer: z.number().int().nonnegative().optional(),
      buildingAppraisalAtTransfer: z.number().int().nonnegative().optional(),
      saleSplitExemption: z.enum(["other_law", "demolished_land_only"]).optional(),
    })
    .optional(),
});

export const donorBuiltShape = z.object({
  buildingType: z.enum(["new", "extension"]),
  /** 증여자의 신축 취득일(영 §162①4호) 또는 증축 완공일 — 5년 기산점 */
  constructionDate: z.string().date(),
  /** 증축 바닥면적 합계(㎡) — 85㎡ 초과만 대상 */
  extensionFloorArea: z.number().positive().optional(),
  /** 증축 부분의 증여자 취득(완공) 당시 기준시가 총액 */
  extensionStdPriceAtAcquisition: positiveInt.optional(),
  /** 일체 주택(`propertyType: housing`)일 때 필수 — 건물분 산정 입력 */
  housing: donorBuiltHousingShape.optional(),
});

export type DonorBuiltWire = z.infer<typeof donorBuiltShape>;

/**
 * 부담부증여(§159) × 이월과세의 «당초 증여자 신축·증축»(PR-4) — `burdenedGiftInfo.carryoverDonorBasis.donorBuilt`.
 * 일체 주택 안분(`housing`)은 받지 않는다(§159가 토지·건물을 자산별로 따로 구한다) — 받으면 조용히 strip 되므로 `.strict()`로 400.
 *
 * ⑭ Date 변환을 **스키마가 한다**(`constructionDate` transform) — `burdenedGiftInfo`는 단건·컴패니언·번들 안분·일반건물 route 여러 곳으로 객체째 흘러가
 * 지점마다 변환을 두면 한 곳만 빠져도 `Date < string` 침묵 false 가 난다(`lib/api/date-coerce.ts`). 파싱 결과가 곧 엔진 입력 타입이다.
 */
export const bgDonorBuiltShape = donorBuiltShape
  .omit({ housing: true })
  .extend({ constructionDate: z.string().date().transform((v) => toDate(v, "burdenedGiftInfo.carryoverDonorBasis.donorBuilt.constructionDate")) })
  .strict();

type CtLike = {
  donorAcquisitionDate: string;
  giftRegistryDate: string;
  useEstimatedAcquisition: boolean;
  donorBuilt?: z.infer<typeof donorBuiltShape>;
};

/**
 * 이월과세 서브객체 수준 규칙 — 엔진 `assertDonorBuiltInput`·⑧과 같은 조건(UI 통과 ↔ validate 차단 모순 금지).
 * 자산 종류 의존 규칙(일체 주택의 `housing` 필수 등)은 이 서브객체에 propertyType 이 없어 `refineDonorBuiltOuter`가 맡는다.
 */
export function refineDonorBuiltInCarryover(ct: CtLike, ctx: z.RefinementCtx, pathPrefix: (string | number)[] = []): void {
  const db = ct.donorBuilt;
  if (!db) return;
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...pathPrefix, "donorBuilt", ...path], message });
  if (!ct.useEstimatedAcquisition)
    issue([], "증여자 신축·증축 가산세(소득세법 §114조의2)는 증여자 취득가액을 환산취득가액으로 계산할 때만 적용됩니다 — 실지거래가액 승계에는 보낼 수 없습니다");
  if (db.constructionDate < ct.donorAcquisitionDate || db.constructionDate > ct.giftRegistryDate)
    issue(["constructionDate"], "증여자의 신축·증축일은 증여자 취득일 이후, 증여 등기접수일 이전이어야 합니다");
  if (db.buildingType === "extension") {
    if (!db.extensionFloorArea) issue(["extensionFloorArea"], "증축은 바닥면적 합계가 필요합니다 (85㎡ 초과만 대상)");
    if (!db.extensionStdPriceAtAcquisition)
      issue(["extensionStdPriceAtAcquisition"], "증축 가산세는 증축 부분의 증여자 취득(완공) 당시 기준시가가 필요합니다");
  }
}

/** GB 파트 wire 에서 `donorBuilt` 를 받으면 거부 — 아직 계산에 쓰이지 않으므로 침묵 무시 대신 400 */
export function rejectDonorBuiltRefine(ct: { donorBuilt?: unknown }, ctx: z.RefinementCtx): void {
  if (ct.donorBuilt !== undefined)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["donorBuilt"],
      message: "이 입력 경로(토지·건물 파트 / 일반건물 파트)의 증여자 신축·증축 가산세(소득세법 §114조의2)는 아직 지원하지 않습니다",
    });
}

/** 거부용 키(일반건물 파트·split 토지 파트) — 값이 있으면 어떤 값이든 거부된다 */
export const donorBuiltRejectedKey = z
  .any()
  .optional()
  .refine((v) => v === undefined, "이 입력 경로의 증여자 신축·증축 가산세(소득세법 §114조의2)는 아직 지원하지 않습니다");

/**
 * 일반건물 **건물 파트**(PR-5a)의 신규 파트 모양 `buildingCarryoverPart.donorBuilt` — 일체 주택 안분(`housing`)은 받지 않는다(토지·건물이 카드로 이미 나뉘어 건물분 그 자체).
 * 받으면 조용히 strip 되므로 `.strict()`로 400.
 */
export const gbDonorBuiltPartShape = donorBuiltShape.omit({ housing: true }).strict();

/** 일반건물 건물 파트의 엔진 모양(`buildingCarryoverTaxation`)이 공유 shape(`donorBuiltShape`)의 `housing` 을 받지 않도록 막는다 — 위 `.strict()` 와 같은 규칙 */
export function rejectDonorBuiltHousingRefine(ct: { donorBuilt?: { housing?: unknown } }, ctx: z.RefinementCtx): void {
  if (ct.donorBuilt?.housing !== undefined)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["donorBuilt", "housing"],
      message: "일반건물 건물 파트에는 일체 주택 건물분 입력(housing)을 보낼 수 없습니다 — 토지·건물이 이미 나뉘어 있습니다",
    });
}

type GbBuildingDonorBuiltOuterLike = {
  buildingAcquisitionCause?: string;
  extensionInfo?: unknown;
  carryoverGiftEvent?: { giftRegistryDate: string };
  buildingCarryoverTaxation?: { donorBuilt?: unknown };
  buildingCarryoverPart?: {
    donorAcquisitionDate: string;
    useEstimatedAcquisition: boolean;
    donorBuilt?: z.infer<typeof gbDonorBuiltPartShape>;
  };
};

/**
 * 일반건물 건물 파트 × 증여자 신축·증축 (⑫, PR-5a) — `generalBuildingValuationSchema` 의 superRefine 이 부른다.
 * 엔진 `assertDonorBuiltInput`(`general_building_unit`)·⑧ `validateDonorBuiltGb` 와 **같은 조건**이다(UI 통과 ⇒ ⑫ 통과).
 *
 * 환산 여부·신축일 범위·증축 필수 칸은 엔진 모양(`carryoverTaxationEngineShape`)이 이미 자기 superRefine 으로 검사한다 —
 * 여기서는 (a) 신규 파트 모양에 같은 규칙을 걸고 (b) 두 모양 공통의 **자산 수준** 규칙(취득원인·증축 3-way·사건 동반)을 건다.
 */
export function refineGbBuildingDonorBuilt(val: GbBuildingDonorBuiltOuterLike, ctx: z.RefinementCtx): void {
  const legacy = val.buildingCarryoverTaxation?.donorBuilt;
  const part = val.buildingCarryoverPart?.donorBuilt;
  if (!legacy && !part) return;
  const where = legacy ? "buildingCarryoverTaxation" : "buildingCarryoverPart";
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [where, "donorBuilt", ...path], message });

  if (val.buildingAcquisitionCause === "newConstruction")
    issue([], "증여자 신축·증축 가산세(소득세법 §114조의2)는 양도인 본인 신축과 다른 축입니다 — 건물 취득 원인이 본인 신축이면 함께 보낼 수 없습니다");
  else if (val.buildingAcquisitionCause !== "carryover_gift")
    issue([], "증여자 신축·증축 정보는 건물 취득 원인이 이월과세(증여)일 때만 보낼 수 있습니다");
  if (val.extensionInfo !== undefined)
    issue([], "증축(3-way) 일반건물의 건물 이월과세에서는 증여자 신축·증축 가산세를 아직 지원하지 않습니다");

  const p = val.buildingCarryoverPart;
  if (part && p) {
    // 신규 파트 모양은 증여 사건(등기접수일)이 짝으로 있어야 조립된다(`composeGbCarryover`) — 없으면 donorBuilt 가 조용히 버려진다
    if (!val.carryoverGiftEvent)
      issue([], "증여자 신축·증축 정보는 증여 사건(carryoverGiftEvent)과 함께 보내야 합니다");
    else
      refineDonorBuiltInCarryover(
        { donorAcquisitionDate: p.donorAcquisitionDate, giftRegistryDate: val.carryoverGiftEvent.giftRegistryDate, useEstimatedAcquisition: p.useEstimatedAcquisition, donorBuilt: part },
        ctx,
        ["buildingCarryoverPart"],
      );
  }
}

type OuterLike = {
  propertyType?: string;
  acquisitionCause?: string;
  preHousingDisclosure?: unknown;
  landAcquisitionDate?: string;
  transferType?: string;
  burdenedGiftInfo?: unknown;
  standardPriceAtAcquisition?: number;
  standardPriceAtTransfer?: number;
  carryoverTaxation?: { donorBuilt?: z.infer<typeof donorBuiltShape> } | null;
};

type BgOuterLike = {
  transferType?: string;
  acquisitionCause?: string;
  propertyType?: string;
  isSelfBuilt?: boolean;
  mixedUse?: unknown;
  burdenedGiftInfo?: {
    valuationMode?: string;
    acquisitionMethod?: string;
    carryoverDonorBasis?: { donorBuilt?: z.infer<typeof bgDonorBuiltShape> };
  };
  carryoverTaxation?: { donorAcquisitionDate?: string; giftRegistryDate?: string } | null;
  /** 일반건물(PR-5c) — 건물 취득원인(본인 신축과 다른 축) · 묶음 경로(지분·함께 양도)는 F27 을 타지 않는다 */
  generalBuildingValuation?: { buildingAcquisitionCause?: string } | null;
  generalBuildingShares?: unknown[];
  companionAssets?: unknown[];
};

/**
 * 일반건물 부담부증여 × 증여자 신축·증축 (PR-5c) — 단건(F27: `general-building-route-carryover.ts`)만 받는다.
 * · 환산취득가액(K-5)·감정가액(K-7) — 방식 규칙은 위 공통 규칙이 본다(K-7 은 PR-2 `gb-bg-carryover-presumed-scenario-b.plan.md` 에서 열었다)
 * · 건물 취득원인이 본인 신축이면 가산세 축이 둘로 겹친다(양도인 신축 vs 증여자 신축) → 거부
 * · 지분 분할 취득(축 B)·함께 양도(컴패니언) 묶음은 이월과세 §97의2 를 타지 않아 받아 놓고 무시하게 된다 → 거부
 */
function refineGbBgDonorBuilt(data: BgOuterLike, issue: (path: (string | number)[], message: string) => void): void {
  if (!data.generalBuildingValuation) issue([], "일반건물 부담부증여의 증여자 신축·증축 정보는 일반건물 입력(generalBuildingValuation)과 함께 보내야 합니다");
  if (data.generalBuildingValuation?.buildingAcquisitionCause === "newConstruction")
    issue([], "일반건물 부담부증여에서 양도인 본인 신축(건물 취득 원인 newConstruction)과 당초 증여자 신축(donorBuilt)은 다른 축입니다 — 함께 보낼 수 없습니다");
  if ((data.generalBuildingShares?.length ?? 0) > 0 || (data.companionAssets?.length ?? 0) > 0)
    issue([], "지분 분할 취득·함께 양도 묶음의 일반건물은 당초 증여자 신축·증축 가산세(소득세법 §114조의2)를 아직 지원하지 않습니다");
}

/**
 * 부담부증여 × 증여자 신축·증축 값 검사 (⑫) — 엔진 `assertBgDonorBuiltInput`·⑧ `validateDonorBuiltBg`와 같은 조건(UI 통과 ⇒ ⑫ 통과).
 * 환산(K-5)·감정(K-7)만 가산세 대상이고, 양도인 본인 신축(`isSelfBuilt`)과는 다른 축이라 함께 받지 않는다.
 */
export function refineBgDonorBuilt(data: BgOuterLike, ctx: z.RefinementCtx): void {
  const db = data.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt;
  if (!db) return;
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["burdenedGiftInfo", "carryoverDonorBasis", "donorBuilt", ...path], message });
  if (data.transferType !== "burdened_gift") issue([], "증여자 신축·증축 정보는 부담부증여에서만 burdenedGiftInfo 로 보낼 수 있습니다");
  if (data.acquisitionCause !== "carryover_gift") issue([], "증여자 신축·증축 정보는 취득 원인이 이월과세(증여)일 때만 보낼 수 있습니다");
  const method = data.burdenedGiftInfo?.acquisitionMethod;
  if (data.burdenedGiftInfo?.valuationMode !== "sangjeungbeop_market" || (method !== "converted" && method !== "appraisal"))
    issue([], "부담부증여의 증여자 신축·증축 가산세는 시가 모드의 취득가액 산정방식이 환산취득가액(K-5) 또는 감정가액(K-7)일 때만 적용됩니다");
  if (data.propertyType !== "housing" && data.propertyType !== "building" && data.propertyType !== "general_building")
    issue([], "증여자 신축·증축 가산세는 주택·건물·일반건물에만 적용됩니다");
  if (data.propertyType === "general_building") refineGbBgDonorBuilt(data, issue);
  if (data.mixedUse) issue([], "겸용주택 부담부증여는 증여자 신축·증축 가산세를 아직 지원하지 않습니다");
  if (data.isSelfBuilt === true)
    issue([], "부담부증여에서 양도인 본인 신축(isSelfBuilt)과 당초 증여자 신축(donorBuilt)은 다른 축입니다 — 함께 보낼 수 없습니다");
  const ct = data.carryoverTaxation;
  // 스키마 transform 이 Date 로 바꿨다 — ISO 일자 문자열로 되돌려 비교한다. 날짜 형식 자체가 틀리면(빈 문자열 등) transform 이 실패해 값이 문자열 그대로 온다 — 그 오류는 Zod 가 이미 냈으니 범위 비교는 건너뛴다(500 방지).
  const built = db.constructionDate instanceof Date ? db.constructionDate.toISOString().slice(0, 10) : undefined;
  if (built && ((ct?.donorAcquisitionDate && built < ct.donorAcquisitionDate) || (ct?.giftRegistryDate && built > ct.giftRegistryDate)))
    issue(["constructionDate"], "증여자의 신축·증축일은 증여자 취득일 이후, 증여 등기접수일 이전이어야 합니다");
  if (db.buildingType === "extension") {
    if (!db.extensionFloorArea) issue(["extensionFloorArea"], "증축은 바닥면적 합계가 필요합니다 (85㎡ 초과만 대상)");
    if (method === "converted" && !db.extensionStdPriceAtAcquisition)
      issue(["extensionStdPriceAtAcquisition"], "증축 환산(K-5) 가산세는 증축 부분의 증여자 취득(완공) 당시 기준시가가 필요합니다");
  }
}

/** 자산 종류·취득원인 의존 규칙 — 단건 `addPropertyRefines`가 호출한다. */
export function refineDonorBuiltOuter(data: OuterLike, ctx: z.RefinementCtx): void {
  const db = data.carryoverTaxation?.donorBuilt;
  if (!db) return;
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["carryoverTaxation", "donorBuilt", ...path], message });
  if (data.acquisitionCause !== "carryover_gift")
    issue([], "증여자 신축·증축 정보는 취득 원인이 이월과세(증여)일 때만 보낼 수 있습니다");
  if (data.propertyType !== "housing" && data.propertyType !== "building")
    issue([], "증여자 신축·증축 가산세는 주택·건물에만 적용됩니다");
  if (data.preHousingDisclosure)
    issue([], "개별주택가격·공동주택가격 최초공시 전 환산과 함께 쓸 수 없습니다 — 일반 기준시가 환산을 선택하세요");
  if (data.landAcquisitionDate) issue([], "토지·건물을 나눠 계산하는 자산은 아직 지원하지 않습니다");
  if (data.transferType === "burdened_gift" || data.burdenedGiftInfo)
    issue([], "부담부증여의 증여자 신축·증축은 burdenedGiftInfo.carryoverDonorBasis.donorBuilt 로 보냅니다 — 이월과세 서브객체로는 받지 않습니다");
  if (data.propertyType === "housing") {
    if (!db.housing)
      issue(["housing"], "일체 주택은 건물분만 가산세 대상이라 개별주택가격을 토지·건물 기준시가 비율로 나누는 입력이 필요합니다");
    if (!data.standardPriceAtAcquisition || !data.standardPriceAtTransfer)
      issue([], "일체 주택의 건물분을 구하려면 증여자 취득 당시·양도 당시 주택공시가격이 필요합니다");
  } else if (db.buildingType === "extension" && !data.standardPriceAtTransfer) {
    issue([], "증축 부분 환산취득가액의 분모인 양도 당시 기준시가가 필요합니다");
  }
}

/** 축 B 컴패니언 묶음(`fractionalSplitBundle`)의 일반건물 부담부증여 × 이월과세 거부 문구 — 화면은 이 조합을 만들지 않는다(지분 분할 일반건물은 `generalBuildingShares`로 간다). */
export const GB_BG_CARRYOVER_BUNDLED_MESSAGE =
  "일반건물 부담부증여의 배우자 등 이월과세(소득세법 §97의2)는 지분 분할 취득을 함께 양도 묶음으로 보내면 계산하지 못합니다 — 지분 분할 일반건물은 지분 배열(generalBuildingShares)로 보내세요";

/** 지분 분할 취득(축 B)은 지분마다 이월과세를 싣는다 — 최상위 `carryoverTaxation`은 route가 읽지 않는다. */
export const GB_BG_CARRYOVER_SHARE_TOP_LEVEL_MESSAGE =
  "일반건물 지분 분할 취득의 부담부증여 × 이월과세는 지분마다 보냅니다(generalBuildingShares[].carryoverTaxation) — 최상위 carryoverTaxation은 받지 않습니다";

/**
 * 일반건물 부담부증여 × 이월과세 × 묶음 경로 거부 (⑫ · 계획서 `gb-bg-carryover-presumed-scenario-b.plan.md` PR-3 → `gb-bg-carryover-share-bundled.plan.md`).
 * 함께 부담부증여 묶음(컴패니언)은 PR-1부터, 지분 분할 취득(`generalBuildingShares`)은 PR-2부터 계산한다 — 지분마다 A/B 카드 세트를
 * 외부 비교 단위로 등록한다(`general-building-fractional.ts`). 남는 거부는 둘이다:
 *  · 지분 배열과 함께 온 최상위 `carryoverTaxation` — 지분 route는 지분 것만 읽어 받아 놓고 무시하게 된다.
 *  · 축 B로 선언된 컴패니언 묶음(`fractionalSplitBundle`)의 일반건물 — 그 경로의 카드 빌더는 지분 축 §159 축소를 하지 않는다.
 */
export function refineGbBgCarryoverBundled(
  data: {
    propertyType?: string;
    transferType?: string;
    carryoverTaxation?: unknown;
    generalBuildingShares?: ReadonlyArray<unknown>;
    companionAssets?: ReadonlyArray<{ assetKind?: string; transferType?: string; carryoverTaxation?: unknown }>;
    fractionalSplitBundle?: boolean;
  },
  ctx: z.RefinementCtx,
): void {
  const companions = data.companionAssets ?? [];
  const isGbBgCarryover = (a: { kind?: string; transferType?: string; carryoverTaxation?: unknown }) =>
    a.kind === "general_building" && a.transferType === "burdened_gift" && a.carryoverTaxation != null;
  if ((data.generalBuildingShares?.length ?? 0) > 0 && isGbBgCarryover({ kind: data.propertyType, ...data }))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["carryoverTaxation"], message: GB_BG_CARRYOVER_SHARE_TOP_LEVEL_MESSAGE });
  if (companions.length === 0 || data.fractionalSplitBundle !== true) return;
  if (isGbBgCarryover({ kind: data.propertyType, ...data }))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["carryoverTaxation"], message: GB_BG_CARRYOVER_BUNDLED_MESSAGE });
  companions.forEach((c, i) => {
    if (isGbBgCarryover({ kind: c.assetKind, ...c }))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companionAssets", i, "carryoverTaxation"], message: GB_BG_CARRYOVER_BUNDLED_MESSAGE });
  });
}
