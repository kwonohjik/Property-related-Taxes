/**
 * ⑫ 이월과세 × **증여자가 신축·증축한 건물**(소득세법 §114조의2) 입력 스키마 — `carryoverTaxation.donorBuilt`.
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-1)
 *
 * 이 객체는 **단건 인라인 shape(`transfer-tax-schema-base-shape.ts`)과 엔진 shape(`carryoverTaxationEngineShape` — 컴패니언·GB 파트)가
 * 함께 쓴다.** 한쪽에만 두면 다른 쪽에서 **침묵 strip**된다(400이 아니라 200 + 가산세 0).
 * 토지·건물 파트 이월과세(P1~P6 wire — `splitCarryoverPartShape`·`carryoverPartShape`)와 GB 파트(`landCarryoverTaxation`·`buildingCarryoverTaxation`)는
 * 이 PR 범위 밖이라 **명시 거부**한다(`rejectDonorBuiltRefine`) — 받아 놓고 무시하면 침묵 오답이다.
 */
import { z } from "zod";

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
export function refineDonorBuiltInCarryover(ct: CtLike, ctx: z.RefinementCtx): void {
  const db = ct.donorBuilt;
  if (!db) return;
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["donorBuilt", ...path], message });
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

/** 파트·GB 파트 wire 에서 `donorBuilt` 를 받으면 거부 — 아직 계산에 쓰이지 않으므로 침묵 무시 대신 400 */
export function rejectDonorBuiltRefine(ct: { donorBuilt?: unknown }, ctx: z.RefinementCtx): void {
  if (ct.donorBuilt !== undefined)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["donorBuilt"],
      message: "이 입력 경로(토지·건물 파트 / 일반건물 파트)의 증여자 신축·증축 가산세(소득세법 §114조의2)는 아직 지원하지 않습니다",
    });
}

/** 파트 wire(`z.object`)에 두는 거부용 키 — 값이 있으면 어떤 값이든 거부된다 */
export const donorBuiltRejectedKey = z
  .any()
  .optional()
  .refine((v) => v === undefined, "이 입력 경로의 증여자 신축·증축 가산세(소득세법 §114조의2)는 아직 지원하지 않습니다");

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
  if (data.transferType === "burdened_gift" || data.burdenedGiftInfo) issue([], "부담부증여의 이월과세는 아직 지원하지 않습니다");
  if (data.propertyType === "housing") {
    if (!db.housing)
      issue(["housing"], "일체 주택은 건물분만 가산세 대상이라 개별주택가격을 토지·건물 기준시가 비율로 나누는 입력이 필요합니다");
    if (!data.standardPriceAtAcquisition || !data.standardPriceAtTransfer)
      issue([], "일체 주택의 건물분을 구하려면 증여자 취득 당시·양도 당시 주택공시가격이 필요합니다");
  } else if (db.buildingType === "extension" && !data.standardPriceAtTransfer) {
    issue([], "증축 부분 환산취득가액의 분모인 양도 당시 기준시가가 필요합니다");
  }
}
