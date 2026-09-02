/**
 * ⑫ 취득가액 의제·환산 Zod 스키마 — 상속 부동산 의제취득가액·개별주택가격 미공시 환산·
 * 1990.8.30. 이전 취득 토지 등급가액
 *
 * 근거: 소득세법 시행령 §176조의2④·§163⑨(상속 의제) · §164⑤(개별주택 미공시 환산) ·
 *       §164⑦(공동주택 미공시) · 소칙 §80(등급가액)
 *
 * `transfer-tax-schema-sub.ts`가 810줄로 파일 크기 정책(트리거 800·착지 ≤700)을 넘겨
 * 분리했다(CB-08). 같은 파일에서 `reductionSchema`·`addPropertyRefines`·
 * `mixedUseAssetSchema`를 뗀 전례와 같은 이음매다.
 *
 * 🔑 이음매를 여기로 잡은 이유: 이 블록은 **원 파일을 역참조하지 않는다**. 컴패니언 블록은
 *   `reductionSchema`·`splitAcquisitionShape`·`inheritanceValuationSchema`를 되참조해
 *   순환 import가 되고, Zod 추론이 `{}`로 무너진다(실측 33 error). 크기만 보고 자르면
 *   그렇게 된다.
 *
 * 원 파일이 재수출하므로 **기존 import 경로는 무변경**이다
 * (memory `feedback_800line_split_export_preservation`).
 */

import { z } from "zod";

// ─── 상속 부동산 취득가액 의제 스키마 (소령 §176조의2④·§163⑨) ──

export const inheritedAcquisitionSchema = z.discriminatedUnion("mode", [
  // case A: 의제취득일(1985.1.1.) 전 상속·증여 — max(① 상증법 평가액, ③ 환산취득가)
  z
    .object({
      mode: z.literal("pre-deemed"),
      /** 상속개시일 */
      inheritanceStartDate: z.string().date(),
      /** 자산 종류 */
      assetKind: z.enum(["land", "house_individual", "house_apart"]),
      /** ① 상증법 §60~66 평가액 (상속세 신고가액) — max(①,③) 후보 */
      reportedValue: z.number().int().nonnegative().optional(),
      /** 의제취득일(1985.1.1.) 시점 기준시가 (원) */
      standardPriceAtDeemedDate: z.number().int().nonnegative().optional(),
      /** 양도시 기준시가 (원) */
      standardPriceAtTransfer: z.number().int().positive().optional(),
      /** 피상속인 실지취득가액 입증 가능 여부 */
      hasDecedentActualPrice: z.boolean().default(false),
      /** 피상속인 취득일 (hasDecedentActualPrice=true 시 필수) */
      decedentAcquisitionDate: z.string().date().optional(),
      /** 피상속인 실지취득가액 (원, hasDecedentActualPrice=true 시 필수) */
      decedentActualPrice: z.number().int().nonnegative().optional(),
    })
    .refine(
      (v) =>
        !v.hasDecedentActualPrice ||
        (!!v.decedentAcquisitionDate &&
          v.decedentActualPrice !== undefined &&
          v.decedentActualPrice > 0),
      {
        message: "피상속인 실지취득가액 입증 시 취득일과 취득가가 필수입니다",
        path: ["decedentAcquisitionDate"],
      },
    ),

  // case B: 의제취득일 이후 상속 — 상속세 신고가액을 취득가로 인정
  z.object({
    mode: z.literal("post-deemed"),
    /** 상속개시일 */
    inheritanceStartDate: z.string().date(),
    /** 자산 종류 */
    assetKind: z.enum(["land", "house_individual", "house_apart"]),
    /** 상속세 신고가액 (원) */
    reportedValue: z.number().int().nonnegative(),
    /** 신고 시 적용한 평가방법 */
    reportedMethod: z.enum([
      "market_value",
      "appraisal",
      "auction_public_sale",
      "similar_sale",
      "supplementary",
    ]),
    /** 평가 근거 메모 (감정평가서 번호 등, 선택) */
    evidenceMemo: z.string().max(200).optional(),
    /** 보충적평가 보조계산 사용 여부 (supplementary 선택 시만) */
    useSupplementaryHelper: z.boolean().default(false),
    /** 보조계산: 토지 면적 (㎡) */
    landAreaM2: z.number().nonnegative().optional(),
    /** 보조계산: 개별공시지가 (원/㎡) 또는 주택 공시가격 (원) */
    publishedValueAtInheritance: z.number().int().nonnegative().optional(),
  }),
]);

// ─── 개별주택가격 미공시 취득 환산 스키마 (§164⑤) ──────────────

export const preHousingDisclosureSchema = z.object({
  /** 최초 고시일 (사용자 직접 입력) */
  firstDisclosureDate: z.string().date(),
  /** 최초 고시 개별주택가격 P_F (원) */
  firstDisclosureHousingPrice: z.number().int().positive(),
  /** 토지 면적 (㎡) */
  landArea: z.number().positive(),
  /** 취득당시 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtAcquisition: z.number().int().positive(),
  /** 취득당시 건물 기준시가 (원) */
  buildingStdPriceAtAcquisition: z.number().int().nonnegative(),
  /** 최초공시일 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtFirstDisclosure: z.number().int().positive(),
  /** 최초공시일 건물 기준시가 (원) */
  buildingStdPriceAtFirstDisclosure: z.number().int().nonnegative(),
  /** 양도시 개별주택가격 P_T (원) */
  transferHousingPrice: z.number().int().positive(),
  /** 양도시 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtTransfer: z.number().int().positive(),
  /** 양도시 건물 기준시가 (원) */
  buildingStdPriceAtTransfer: z.number().int().nonnegative(),

  // Case A 4부분 안분 전용 (겸용주택 + house_to_commercial + firstDisclosure < usageChange)
  // 모두 충족 시 PHD 엔진이 4부분 안분 모드로 분기.
  /** 취득시 상가건물 기준시가 (원) */
  commercialBuildingStdPriceAtAcq: z.number().int().nonnegative().optional(),
  /** 최초공시일 상가건물 기준시가 (원) */
  commercialBuildingStdPriceAtFirstDisclosure: z.number().int().nonnegative().optional(),
  /** 양도시 상가건물 기준시가 (원) — 미입력 시 transferStandardPrice.commercialBuildingPrice 자동 사용 */
  commercialBuildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),
  /** 주택부수토지 면적 (㎡) — 미입력 시 derived.residentialLandArea 자동 사용 */
  housingLandArea: z.number().positive().optional(),
  /** 상가부수토지 면적 (㎡) — 미입력 시 derived.commercialLandArea 자동 사용 */
  commercialLandArea: z.number().positive().optional(),
  /** 양도시 주택건물 기준시가 (원) — 미입력 시 buildingStdPriceAtTransfer 자동 fallback */
  housingBuildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),
  /** 총 양도가액 (원) — 4부분 안분 시 필수 */
  totalTransferPriceForFourPart: z.number().int().nonnegative().optional(),
});

// ─── 상속 주택 환산취득가 — 개별주택 미공시 + 1990 이전 토지 스키마 ──

/** 등급가액 입력 스키마: 등급 번호 또는 등급가액 직접 입력 */
const gradeInputSchema = z.union([
  z.number().int().positive(),                          // 등급 번호 (1~365)
  z.object({ gradeValue: z.number().positive() }),      // 등급가액 직접 입력
]);

export const inheritanceHouseValuationSchema = z
  .object({
    /** 상속개시일 (1990-08-30 분기 + 2005-04-30 적용 여부 판단) */
    inheritanceDate: z.string().date(),
    /** 양도일 */
    transferDate: z.string().date(),
    /** 토지 면적 (㎡) */
    landArea: z.number().positive(),
    /** 양도시 개별공시지가 (원/㎡) */
    landPricePerSqmAtTransfer: z.number().int().positive(),
    /** 최초고시 시점 개별공시지가 (원/㎡) */
    landPricePerSqmAtFirstDisclosure: z.number().int().positive(),
    /** 양도시 개별주택가격 (원) */
    housePriceAtTransfer: z.number().int().nonnegative(),
    /** 최초고시 시점 개별주택가격 (원) */
    housePriceAtFirstDisclosure: z.number().int().positive(),
    /** 상속개시일 시점 개별공시지가 (원/㎡) — 1990-08-30 이후 시 필수 */
    landPricePerSqmAtInheritance: z.number().int().positive().optional(),
    /** 상속개시일 시점 주택가격 직접 입력 override (원) */
    housePriceAtInheritanceOverride: z.number().int().nonnegative().optional(),
    /** 양도시 건물기준시가 (원) — Sum 분모(양도시) 정확화. 미입력 시 housePriceAtTransfer로 대체 */
    buildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),
    /** 최초고시 시점 건물기준시가 (원) — §164⑤ Sum_F 분모: 토지기준시가 + 이 값 */
    buildingStdPriceAtFirstDisclosure: z.number().int().nonnegative().optional(),
    /** 상속개시일 시점 건물기준시가 (원) — §164⑤ Sum_A 분자: 토지기준시가 + 이 값 */
    buildingStdPriceAtInheritance: z.number().int().nonnegative().optional(),
    /** 최초 고시일 (기본 "2005-04-30") */
    firstDisclosureDate: z.string().date().default("2005-04-30"),
    /** 1990-08-30 이전 취득 토지 등급가액 환산 입력 */
    pre1990: z
      .object({
        grade_1990_0830: gradeInputSchema,
        gradePrev_1990_0830: gradeInputSchema,
        gradeAtAcquisition: gradeInputSchema,
        pricePerSqm_1990: z.number().int().positive(),
        forceRatioCap: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    const isBefore1990 = v.inheritanceDate < "1990-08-30";
    const hasDirectInput = v.landPricePerSqmAtInheritance !== undefined;
    const hasPre1990 = v.pre1990 !== undefined;

    if (isBefore1990 && !hasDirectInput && !hasPre1990) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "상속개시일이 1990-08-30 이전이면 pre1990 등급가액 또는 landPricePerSqmAtInheritance 중 하나가 필수입니다",
        path: ["pre1990"],
      });
    }
    if (!isBefore1990 && !hasDirectInput && !hasPre1990) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "상속개시일이 1990-08-30 이후이면 landPricePerSqmAtInheritance가 필수입니다",
        path: ["landPricePerSqmAtInheritance"],
      });
    }
  });


// ─── 비주택 → 주택 용도변경 (§95⑤·⑥ · 시행령 §154⑤ 단서) ──────────────

/**
 * ⑫ 비주택 → 주택 용도변경 입력.
 *
 * 미정의 시 Zod가 **조용히 필드를 떼어내** 엔진에 도달하지 않는다(침묵 stripping).
 * 날짜 순서(취득일 < 주거용 사용일 < 양도일) 검증은 `addPropertyRefines`가 한다 —
 * 여기서는 취득일·양도일을 볼 수 없기 때문이다.
 */
export const nonHousingToHousingConversionSchema = z.object({
  /** 사실상 주거용으로 사용한 날 (YYYY-MM-DD). 불분명하면 공부상 용도변경일 — §95⑥ 단서. */
  residentialUseStartDate: z.string().date(),
  /**
   * §95⑤2호 클램프로 잘려나간 거주 개월 수.
   * 결과 화면 절사 안내 전용 — 계산에는 쓰이지 않는다(거주기간 자체는 이미 클램프된 값이 온다).
   */
  residenceMonthsTrimmed: z.number().int().nonnegative(),
});
