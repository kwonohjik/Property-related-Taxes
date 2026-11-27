/**
 * ⑨⑩⑫ 국외자산 부동산 양도소득세(소득세법 §118의2~§118의8) Zod 입력 스키마
 *
 * 필드는 엔진 입력(`ForeignRealEstateInput`, `lib/tax-engine/foreign-realestate/types.ts`)과 1:1이다 — TypeScript는 이 스키마의 필드 누락을
 * 감지하지 못한다(신규 엔진 필드는 여기에도 추가). 날짜는 `string|Date`로 받고 ⑭ `engine-input.ts`가 `toDate`로 바꾼다.
 *
 * - 기본 모양(타입·enum·배열 상한): 이 파일.
 * - 엔진이 던지는 검증과 같은 판정(환율·날짜·과세기간·id·차손 혼재 등): `transfer-foreign-refines.ts` — 엔진 함수를 **그대로 부른다**.
 * - route가 쓰는 스키마는 `foreignRealEstateInputSchema`(= 기본 모양 + refine 전부). 기본 모양만 쓰면 refine이 빠진다.
 *
 * 계획서: docs/02-design/features/transfer-foreign-realestate.engine.plan.md §3.2·§4·§4.1
 */
import { z } from "zod";
import { addForeignRealEstateRefines } from "./transfer-foreign-refines";

/** 화면 카드·행 수 상한 — ⑤(「+ 추가」)·⑧·⑫의 단일 소스(`asset-card-count-cap.ts`와 같은 규약). 연간 합산 route의 자산 상한(20)과 같다. */
export const FOREIGN_RE_MAX_ASSETS = 20;
/** 자본적지출·양도비·외국납부세액 행 수 상한(자산당 / 전체) */
export const FOREIGN_RE_MAX_ROWS = 50;

/** ⑨ 자산 종류 — 법 §118의2 1호 토지·건물(권리 2호는 v1 범위 밖) */
export const foreignAssetKindSchema = z.enum(["land", "building"]);

/** ⑨ 외국납부세액 처리 방법 — 법 §118의6① 1호 세액공제 / 2호 필요경비 산입 */
export const foreignRealEstateTaxMethodSchema = z.enum(["credit", "expense"]);

const dateInput = z.union([z.string(), z.date()]);

/** ⑫ 외화 금액 1항목 — 각 항목이 자기 일자·기준환율을 가진다(영 §178의5①). 환율·외화액의 값 검증은 refine(`tryToKrw`)이 한다. */
export const foreignMoneyItemSchema = z.object({
  amountForeign: z.number(),
  /** 통화 코드 — 표시용(계산 무관) */
  currency: z.string().regex(/^[A-Z]{3}$/, "통화 코드는 3자리 영문 대문자입니다"),
  /** 수령 또는 지출한 날 */
  date: dateInput,
  exchangeRate: z.number(),
});

export const foreignTaxItemSchema = foreignMoneyItemSchema.extend({
  /** 어느 자산의 양도소득에 대한 외국세인지(`assets[].id`) */
  assetId: z.string(),
});

export const foreignRealEstateAssetSchema = z.object({
  id: z.string().min(1).max(64),
  kind: foreignAssetKindSchema,
  transferDate: dateInput,
  acquisitionDate: dateInput,
  transfer: foreignMoneyItemSchema,
  acquisition: foreignMoneyItemSchema,
  capitalExpenditures: z.array(foreignMoneyItemSchema).max(FOREIGN_RE_MAX_ROWS).default([]),
  transferCosts: z.array(foreignMoneyItemSchema).max(FOREIGN_RE_MAX_ROWS).default([]),
  /**
   * 매매 취득만 계산한다(상속·증여 취득가액 근거 미확인 — 엔진 계획 Q-6·V-6). 엔진에는 이 칸이 없어 **Zod가 막지 않으면 조용히 매매로 계산된다**.
   * 미입력은 매매와 같다.
   */
  acquisitionCause: z.literal("purchase", { error: "국외 부동산은 매매 취득만 계산합니다 (상속·증여 취득가액 근거 미확인)" }).optional(),
  /** 외화 차입 취득 환차익 제외(법 §118의2 단서)의 계산식이 법령에 없어 계산하지 않는다(엔진 계획 V-14). 엔진에 칸이 없어 Zod가 막는다. */
  foreignBorrowAcquired: z.literal(false, { error: "외화 차입 취득 자산의 환차익 제외는 계산하지 않습니다 (법령에 계산식 없음)" }).optional(),
});

export const foreignRealEstateForeignTaxSchema = z.object({
  method: foreignRealEstateTaxMethodSchema,
  items: z.array(foreignTaxItemSchema).max(FOREIGN_RE_MAX_ROWS),
});

/** ⑫ 기본 모양(refine 없음) — route는 `foreignRealEstateInputSchema`를 쓴다. */
export const foreignRealEstateBaseSchema = z.object({
  /** 해당 자산의 양도일까지 계속 국내에 주소·거소를 둔 연수(정수) — 5 미만이면 과세대상 아님(오류 아님, 엔진이 not_liable). */
  domesticResidenceYears: z.number(),
  /** 같은 과세기간(양도일 연도)에 양도한 1건 이상 — 건수 하한은 refine(`assertAssetsPresent`)이 막는다. */
  assets: z.array(foreignRealEstateAssetSchema).max(FOREIGN_RE_MAX_ASSETS),
  foreignTax: foreignRealEstateForeignTaxSchema.optional(),
});

/** ⑫ route가 쓰는 스키마 = 기본 모양 + 엔진과 같은 검증(refine) 전부 */
export const foreignRealEstateInputSchema = addForeignRealEstateRefines(foreignRealEstateBaseSchema);

export type ForeignRealEstateBaseInput = z.infer<typeof foreignRealEstateBaseSchema>;
