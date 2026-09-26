/**
 * 증여로 보는 경우 (Phase 1) — Zod 입력 검증 스키마.
 *
 * ⚠️ discriminatedUnion 제약: 각 브랜치는 순수 z.object여야 한다.
 * z.object().superRefine()는 ZodEffects가 되어 discriminatedUnion에 넣을 수 없으므로,
 * cross-field 검증은 union 전체에 .superRefine()을 한 번만 적용한다.
 */
import { z } from "zod";

const rateFractionSchema = z.object({ numer: z.number().nonnegative(), denom: z.number().positive() });
const trustBenefitSchema = z.object({
  type: z.literal("trust_benefit"),
  beneficiaryType: z.enum(["same", "diff_principal", "diff_income"]),
  trustPropertyValue: z.number().nonnegative(),
  yieldRate: rateFractionSchema.optional(),
  withholdingRate: rateFractionSchema,
  // §61②→§62 정기금 유형 (기본 finite). finite일 때만 installments 필수
  incomeAnnuityType: z.enum(["finite", "perpetual", "lifetime"]).optional(),
  installments: z.number().int().positive().optional(),
  incomeIntervalYears: z.number().positive().optional(),
  expectedRemainingYears: z.number().nonnegative().optional(),
  beneficiaryGender: z.enum(["male", "female"]).optional(),
  beneficiaryAge: z.number().nonnegative().optional(),
  // 증여시기 분리 (§33①1·2호) — string 수신 → Date 변환
  incomeGiftDate: z.coerce.date().optional(),
  principalGiftDate: z.coerce.date().optional(),
  surrenderValue: z.number().nonnegative().optional(),
  giftTimingType: z.enum(["actual", "decedent_death", "agreed", "first_installment"]).optional(),
});

const insuranceSchema = z.object({
  type: z.literal("insurance"),
  caseType: z.enum(["non_payer", "gifted_premium"]),
  insuranceProceeds: z.number().nonnegative({ message: "보험금은 0 이상이어야 합니다" }),
  totalPremiumPaid: z.number().positive({ message: "총 납부보험료는 0보다 커야 합니다" }),
  relevantPremium: z.number().nonnegative({ message: "관련 보험료는 0 이상이어야 합니다" }),
  isInheritanceInsurance: z.boolean(),
});

const bargainTransferSchema = z.object({
  type: z.literal("bargain_transfer"),
  transactionPrice: z.number().nonnegative({ message: "거래대가는 0 이상이어야 합니다" }),
  marketValue: z.number().positive({ message: "시가는 0보다 커야 합니다" }),
  isRelatedParty: z.boolean(),
  transactionType: z.enum(["purchase", "sale"]),
  hasJustifiableReason: z.boolean().optional(),
  isExcludedTransaction: z.boolean().optional(),
});

const debtForgivenessSchema = z.object({
  type: z.literal("debt_forgiveness"),
  forgivenDebt: z.number().positive({ message: "면제·인수·변제 채무액은 0보다 커야 합니다" }),
  compensation: z.number().nonnegative({ message: "보상액은 0 이상이어야 합니다" }),
  occurType: z.enum(["creditor_waiver", "third_party_assumption"]),
});

const freeRealEstateSchema = z.object({
  type: z.literal("free_realestate"),
  subType: z.enum(["free_use", "collateral"]),
  propertyValue: z.number().nonnegative().optional(),
  loanAmount: z.number().nonnegative().optional(),
  actualInterestPaid: z.number().nonnegative().optional(),
  isRelatedParty: z.boolean(),
  hasJustifiableReason: z.boolean().optional(),
  // 다기간 (G2/G3) — undefined=단일 / [...]=다기간 (빈 []은 superRefine 차단)
  periods: z
    .array(
      z.object({
        startDate: z.string().min(1),
        propertyValue: z.number().nonnegative().optional(),
        loanAmount: z.number().nonnegative().optional(),
        actualInterestPaid: z.number().nonnegative().optional(),
      })
    )
    .optional(),
  // 경정청구 (G1)
  rectification: z
    .object({
      giftTaxCalculated: z.number().nonnegative(),
      giftDate: z.string().min(1),
      terminationDate: z.string().min(1),
    })
    .optional(),
});

const freeLoanSchema = z.object({
  type: z.literal("free_loan"),
  loanAmount: z.number().positive({ message: "대출금액은 0보다 커야 합니다" }),
  actualInterestPaid: z.number().nonnegative({ message: "실제 지급이자는 0 이상이어야 합니다" }),
  appropriateRate: z.object({
    numer: z.number().positive(),
    denom: z.number().positive(),
  }),
  isRelatedParty: z.boolean(),
  hasJustifiableReason: z.boolean().optional(),
  // §41의4② 다년 분할 — YYYY-MM-DD 문자열 (date-coerce N/A, 문자열 그대로 엔진 전달)
  loanStartDate: z.string().optional(),
  loanEndDate: z.string().optional(),
});
// §43² 1년 이내 동일거래(§41의4) 합산 — 복수 대출 건 (별도 type dispatch)
const freeLoanItemSchema = z.object({
  loanDate: z.string().min(1),
  loanAmount: z.number().positive(),
  actualInterestPaid: z.number().nonnegative(),
  appropriateRate: z.object({ numer: z.number().positive(), denom: z.number().positive() }),
  isRelatedParty: z.boolean(),
  hasJustifiableReason: z.boolean().optional(),
  label: z.string().optional(),
});
const freeLoanAggregatedSchema = z.object({
  type: z.literal("free_loan_aggregated"),
  loans: z.array(freeLoanItemSchema).min(1, { message: "대출 건을 1건 이상 입력하세요" }),
});

// ── Phase 2: 자본거래 (평가가액·주식수 직접 입력) — sub-case 필드는 caseType별 optional ──
// 🔴 `.int()`는 장식이 아니다 — 소수 분모가 통과하면 엔진의 `safeMultiplyThenDivide`가
//    BigInt 경로에서 `RangeError: Division by zero`를 던져 API가 500으로 죽는다
//    (leaf 쪽 가드는 `lib/tax-engine/tax-utils.ts`에 함께 넣었다).
//    생산 측(`lib/calc/gift-deemed-api.ts`의 `parseRatio`)은 `{Math.round(pct*100), 10_000}`
//    으로 언제나 정수를 만들므로, 정수 강제가 정상 입력을 막지 않는다.
const ratioSchema = z
  .object({
    numer: z.number().int().nonnegative(),
    denom: z.number().int().positive(),
  })
  // 🔴 SC-7-g: 상한이 없어 200%(`{20000, 10000}`)가 그대로 통과했다 — 실측 2,000,000,000원.
  //    이 스키마의 사용처 14곳은 **전부 지분율 축**이다(이자율 같은 1을 넘는 rate는 없다)
  //    — `appropriateRate`는 별도 스키마다. ⑧validate가 막는 것은 클라이언트라 **서버측 관문**을 여기 둔다.
  //    roster의 「주식수 > 발행주식총수」 가드(같은 파일 superRefine)와 같은 층위고, single 경로만 비어 있었다.
  .refine((r) => r.numer <= r.denom, {
    message: "지분율은 100%를 초과할 수 없습니다",
  });
const mergerShareholderSchema = z.object({
  id: z.string(),
  name: z.string(),
  shares: z.number().nonnegative(),
});
const mergerSchema = z.object({
  type: z.literal("merger"),
  caseType: z.enum(["stock", "non_stock"]).optional(),
  overvaluedSharePrice: z.number().nonnegative(),
  majorShares: z.number().nonnegative(),
  mergedSharePrice: z.number().nonnegative().optional(),
  preMergerShares: z.number().nonnegative().optional(),
  exchangedShares: z.number().nonnegative().optional(),
  faceValue: z.number().nonnegative().optional(),
  mergeConsideration: z.number().nonnegative().optional(),
  // Phase A 평가 §28⑤
  mergedPriceMode: z.enum(["direct", "auto"]).optional(),
  underSharePrice: z.number().nonnegative().optional(),
  underPreShares: z.number().nonnegative().optional(),
  postMergerTotalShares: z.number().nonnegative().optional(),
  listedPostAvgPrice: z.number().nonnegative().optional(),
  isListed: z.boolean().optional(),
  // G0 echo §28①②
  isRelatedCompany: z.boolean().optional(),
  shareholderOwnedShares: z.number().nonnegative().optional(),
  shareholderTotalShares: z.number().nonnegative().optional(),
  faceValueSum: z.number().nonnegative().optional(),
  // Phase B 매트릭스
  shareholders: z
    .object({
      overvalued: z.array(mergerShareholderSchema),
      undervalued: z.array(mergerShareholderSchema),
      exchangeRatio: z.object({ numer: z.number(), denom: z.number() }),
    })
    .optional(),
  // Phase C 분할합병 §28⑦
  isSplitMerger: z.boolean().optional(),
  splitValuationMode: z.enum(["supplementary", "net_asset_ratio"]).optional(),
  splitCompanyPreSharePrice: z.number().nonnegative().optional(),
  splitBusinessNetAsset: z.number().nonnegative().optional(),
  splitCompanyNetAsset: z.number().nonnegative().optional(),
});
const capitalIncreaseShape = {
  direction: z.enum(["low", "high"]).optional(),
  subType: z.enum(["forfeited_realloc", "third_party", "excess", "no_realloc"]).optional(),
  // 🔢 **주식수 필드에만 `.int()`를 건다.** 「상증령」§29② 각 호 산식이 「발행주식총수」·
  //   「증가한 주식수」·「실권주수」를 분모·분자로 쓰므로 소수는 성립하지 않는다.
  //   소수가 들어오면 `computeWeightedPerShare`의 `BigInt(Math.floor(denom))`이 0n이 되어
  //   **RangeError → HTTP 500**이 났다(400이어야 할 입력 오류). 분모가 0과 1 사이면 예외 대신
  //   `1/denom` 배 **증폭**이 된다(denom 0.5 → 정확히 2배, 0.1 → 10배, 상한 없음).
  // 🚫 **가액 필드에는 걸지 말 것** — 「상증법」§63①1호 가목의 「최종 시세가액의 **평균액**」은
  //   본래 소수다. `preIssuePrice`·`newSharePrice`·`listedMarketAvg`가 그 자리다.
  preIssuePrice: z.number().nonnegative(),
  preIssueShares: z.number().int().positive({ message: "증자 전 발행주식총수는 0보다 커야 합니다" }),
  newSharePrice: z.number().nonnegative(),
  // 3-A — ㉯ 산식의 분자·분모 양쪽에 들어가므로 0이면 증자가 아니다(⑧과 대칭).
  issuedShares: z.number().int().positive({ message: "증자 주식수는 0보다 커야 합니다" }),
  forfeitedShares: z.number().int().nonnegative(),
  relatedAcquiredShares: z.number().int().nonnegative().optional(),
  ratioDenomShares: z.number().int().nonnegative().optional(),
  // 증여일(§29①) — 행위시법 판정 전용. route는 parsed.data를 그대로 넘기므로 여기서 Date가 된다.
  giftDate: z.coerce.date().optional(),
  // §29②2호 가목 「증자전의 지분비율대로 균등하게 증자하는 경우의 증가주식수」 — 저가 나목 ㉯ 기준 수량
  equalIssueShares: z.number().int().nonnegative().optional(),
  // §29②2호 다목 「증자후 신주인수자의 지분비율」 — 저가 나목 전용. 분모는 파생하지 않고 받는다.
  postIssueSubscriberRatio: z
    .object({ numer: z.number().nonnegative(), denom: z.number().positive() })
    .optional(),
  smallShareholderImputation: z.boolean().optional(),
  // §29②1가·3나 단서 — 주권상장법인등 Min(저가)/Max(고가). 전환주식(§39①3호)의
  // atConversion·atIssuance도 이 shape을 재사용하므로 한 곳 수정으로 함께 커버된다.
  isListed: z.boolean().optional(),
  listedMarketAvg: z.number().nonnegative().optional(),
  // §39① 괄호(주권상장법인 모집방법 배정 제외) · §29③ 간주모집 취소 — 전환주식 2시점도 이 shape 재사용
  allocationMethod: z.enum(["normal", "public_offering", "deemed_public_offering"]).optional(),
  // 「상증법」§2 9호·§4의2①·③ — 수증자가 영리법인이면 증여세 납세의무자가 아니다(전환주식 2시점도 이 shape 재사용)
  doneeIsForProfitCorp: z.boolean().optional(),
  // §4의2④ 납세의무 게이트 2축 — ⑫ strip 방지(빠지면 게이트가 엔진에 도달하지 못한다)
  issuerGainCorporateTaxed: z.boolean().optional(),
  doneeIsShareholderOfIssuer: z.boolean().optional(),
} as const;
/**
 * §39 증자 축 공통 교차검증 — ⑧(`gift-deemed-validate.ts`)과 **같은 규칙**을 ⑫에도 건다.
 * 한쪽만 고치면 다른 쪽이 남는다(직접 API 호출은 ⑧을 거치지 않는다).
 */
function refineCapitalIncrease(
  val: {
    direction?: "low" | "high";
    subType?: "forfeited_realloc" | "third_party" | "excess" | "no_realloc";
    issuedShares: number;
    relatedAcquiredShares?: number;
    ratioDenomShares?: number;
    isListed?: boolean;
    listedMarketAvg?: number;
    allocationMethod?: "normal" | "public_offering" | "deemed_public_offering";
  },
  ctx: z.RefinementCtx,
): void {
  const numer = val.relatedAcquiredShares;
  const denom = val.ratioDenomShares;
  // 3-B — 분자 ≤ 분모. 세 호 전부 「… 인수한 신주수 ÷ (그 신주수를 포함하는 총수)」 형태라
  //   분자가 분모를 넘으면 가중이 1을 초과해 증폭이 된다.
  if (numer != null && denom != null && denom > 0 && numer > denom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["relatedAcquiredShares"],
      message: "특수관계인이 인수한 신주수가 분모 신주수를 초과할 수 없습니다",
    });
  }
  // 3-B — **나목 한정** 하한. §29②4호 분모는 균등증자 가정 총수라 실제 증가주식수 이상이다.
  //   ⚠️ 다·라목(§29②5호) 분모는 증가주식수의 부분집합이므로 걸면 안 된다.
  if (val.direction === "high" && val.subType === "no_realloc" && denom != null && denom > 0 && denom < val.issuedShares) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ratioDenomShares"],
      message: "분모(균등증자 가정 증자 주식총수)는 증자 주식수보다 작을 수 없습니다",
    });
  }
  // 3-C·3-D — 상장이면 「상증령」§29②1가·3나 단서의 종가평균이 필요하다. 없으면 엔진이
  //   조용히 이론값으로 간다(`applyListedPerShareBound`가 `avg <= 0`이면 그대로 통과).
  //   ⚠️ 공모 배정만 예외다 — §39① 괄호로 적용 자체가 제외돼 이 값이 세액에 닿지 않는다.
  //      간주모집(§29③)은 제외가 취소되어 과세되므로 예외가 아니다.
  if (
    val.isListed === true &&
    val.allocationMethod !== "public_offering" &&
    (val.listedMarketAvg == null || val.listedMarketAvg <= 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["listedMarketAvg"],
      message: "주권상장법인등은 증자 후 1주당 평가가액(전후 2개월 종가평균)이 필요합니다",
    });
  }
}

const capitalIncreaseSchema = z
  .object({ type: z.literal("capital_increase"), ...capitalIncreaseShape })
  .superRefine(refineCapitalIncrease);
// 전환주식(§39①3호)의 2시점이 이 스키마를 재사용한다 — 같은 교차검증이 두 시점에 그대로 걸린다.
const capitalIncreaseInnerSchema = z.object(capitalIncreaseShape).superRefine(refineCapitalIncrease);
// §39 cap-table 다수증자·다증여자 (equity-delta)
const capShareholderSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  preShares: z.number().int().nonnegative(),
  entitledShares: z.number().int().nonnegative(),
  subscribedShares: z.number().int().nonnegative(),
  reallocatedShares: z.number().int().nonnegative().optional(),
  relatedTo: z.array(z.string()).optional(),
  // 행별 §39① 공모 제외 — 한 증자에 공모 배정과 특정 배정이 섞일 수 있다
  allocationMethod: z.enum(["normal", "public_offering", "deemed_public_offering"]).optional(),
  // 행별 §4의2①·③ 영리법인 — 이익·검증내역은 보존하고 과세분만 0이 된다
  isCorporate: z.boolean().optional(),
  // 「상증령」§29⑤ 소액주주 판정의 액면 요건(3억원 미만) — §39② 1인 의제 자동 판정용.
  // optional인 것은 「선택 입력」이기 때문이다 — 미입력은 「소액주주 아님」(요건 미입증)이다.
  faceValueSum: z.number().nonnegative().optional(),
});
const capitalIncreaseAllocationSchema = z
  .object({
    type: z.literal("capital_increase_allocation"),
    direction: z.enum(["low", "high"]),
    preIssuePrice: z.number().nonnegative(),
    newSharePrice: z.number().nonnegative(),
    shareholders: z.array(capShareholderSchema).min(2, { message: "주주를 2명 이상 입력하세요" }),
    // §39① 괄호 「주권상장법인이」 — 공모 배정 제외의 AND 조건. ㉯ 계산에는 쓰이지 않는다(안 C 유지)
    isListed: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    // 포기 ↔ 재배정 병존 불가 (⑧ gift-deemed-validate.ts와 동일 규칙 — 3중 일치)
    val.shareholders.forEach((s, i) => {
      const realloc = s.reallocatedShares ?? 0;
      if (realloc <= 0) return;
      if (s.subscribedShares - realloc < s.entitledShares) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${s.name?.trim() || "주주"}: 당초 배정분을 포기한 주주는 실권주를 재배정받을 수 없습니다`,
          path: ["shareholders", i, "reallocatedShares"],
        });
      }
    });
  });
const convertibleStockSchema = z
  .object({
    type: z.literal("convertible_stock"),
    atConversion: capitalIncreaseInnerSchema,
    atIssuance: capitalIncreaseInnerSchema,
  })
  // 3-C — 「상증법」§39①3호는 **가목(저가)과 나목(고가)을 택일**한다. 두 시점은 같은 전환주식
  //   한 건의 전후이므로 발행이 저가인데 전환이 고가일 수 없다. 종전에는 두 시점의 `direction`이
  //   서로 독립이라 가목+나목 혼합이 그대로 통과했다(⑤는 `csDirection` 한 칸이라 UI로는 못
  //   만들지만, 직접 API 호출은 ⑧을 거치지 않는다).
  .superRefine((val, ctx) => {
    const a = val.atConversion.direction;
    const b = val.atIssuance.direction;
    if (a != null && b != null && a !== b) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["atIssuance", "direction"],
        message: "전환주식은 두 시점의 발행유형(저가/고가)이 같아야 합니다 (§39①3호 가목·나목 택일)",
      });
    }
  });
const capitalDecreaseShareholderSchema = z.object({
  id: z.string(),
  name: z.string(),
  preShares: z.number().nonnegative(),
  redeemedShares: z.number().nonnegative(),
  redemptionPricePerShare: z.number().nonnegative().optional(),
  relationGroup: z.string().optional(),
});
const capitalDecreaseSchema = z.object({
  type: z.literal("capital_decrease"),
  caseType: z.enum(["low", "high"]).optional(),
  sharePrice: z.number().nonnegative(),
  redemptionPrice: z.number().nonnegative().optional(),
  totalRedeemedShares: z.number().nonnegative().optional(),
  majorPostRatio: ratioSchema.optional(),
  relatedRedeemedShares: z.number().nonnegative().optional(),
  faceValue: z.number().nonnegative().optional(),
  ownRedeemedShares: z.number().nonnegative().optional(),
  // 멀티(불균등 감자 N:N) 모드
  shareholders: z.array(capitalDecreaseShareholderSchema).optional(),
  preTotalShares: z.number().nonnegative().optional(),
});
const contributionPartySchema = z.object({
  name: z.string().optional(),
  preShares: z.number().nonnegative(),
  relation: z
    .enum(["father", "mother", "grandparent", "spouse", "lineal_descendant", "sibling", "other_relative", "other"])
    .optional(),
});
const contributionSchema = z
  .object({
    type: z.literal("contribution"),
    caseType: z.enum(["low", "high"]).optional(),
    preContribPrice: z.number().nonnegative(),
    preContribShares: z.number().positive({ message: "현물출자 전 발행주식총수는 0보다 커야 합니다" }),
    newSharePrice: z.number().nonnegative(),
    contributedShares: z.number().nonnegative(),
    allocatedShares: z.number().nonnegative(),
    relatedRatio: ratioSchema.optional(),
    smallShareholderImputation: z.boolean().optional(),
    // 3-state: undefined=OFF / []=ON빈(차단) / [{...}]=데이터
    parties: z.array(contributionPartySchema).optional(),
    // §29의3①이 준용하는 §29②1가·3나 단서 + 자본시장법 §165의6①3 일반공모 제외
    isListed: z.boolean().optional(),
    listedMarketAvg: z.number().nonnegative().optional(),
    publicOfferingShares: z.number().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    // 상장 ON인데 평균액 미입력이면 엔진이 **조용히 이론값으로 통과**한다(단서 미발동).
    // 사용자는 단서가 적용된 줄 알게 되므로 차단한다.
    if (val.isListed && (val.listedMarketAvg ?? 0) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "현물출자 납입일 전후 2개월 종가평균을 입력하세요",
        path: ["listedMarketAvg"],
      });
    }
    if ((val.publicOfferingShares ?? 0) > val.allocatedShares) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "일반공모 배정 신주수가 배정받은 신주수를 초과합니다",
        path: ["publicOfferingShares"],
      });
    }
    if (val.parties === undefined) return; // OFF 경로 — gross/relatedRatio 경로
    if (val.parties.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${val.caseType === "high" ? "수증자" : "증여자"}를 1명 이상 추가하세요`,
        path: ["parties"],
      });
      return;
    }
    // 합계 주식수 > 기준 주식수 차단
    const sum = val.parties.reduce((acc, p) => acc + p.preShares, 0);
    if (val.preContribShares > 0 && sum > val.preContribShares) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "당사자 주식수 합계가 현물출자 전 발행주식총수를 초과합니다",
        path: ["parties"],
      });
    }
  });
const acquisitionFundSchema = z.object({
  type: z.literal("acquisition_fund_presumption"),
  subType: z.enum(["acquisition", "debt_repayment"]),
  acquisitionValue: z.number().positive({ message: "취득재산가액(채무상환금액)은 0보다 커야 합니다" }),
  provenAmount: z.number().nonnegative(),
});
const nomineeTrustSchema = z
  .object({
    type: z.literal("nominee_trust"),
    // total 모드만 필수 (per_share는 perSharePrice×nomineeShares로 엔진 단일 도출) → superRefine로 모드별 검증
    propertyValue: z.number().nonnegative().optional(),
    hasTaxAvoidancePurpose: z.boolean(),
    isExcluded: z.boolean().optional(),
    valuationMode: z.enum(["total", "per_share"]).optional(),
    perSharePrice: z.number().nonnegative().optional(),
    nomineeShares: z.number().nonnegative().optional(),
    subscriptionPrice: z.number().nonnegative().optional(),
    theoreticalExRightsPrice: z.number().nonnegative().optional(),
    preIncreasePerShare: z.number().nonnegative().optional(),
    actualOwnerName: z.string().optional(),
    nomineeName: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.valuationMode === "per_share") {
      if (!val.perSharePrice || val.perSharePrice <= 0)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "1주당 평가액(명의개서일 §63)을 입력하세요", path: ["perSharePrice"] });
      if (!val.nomineeShares || val.nomineeShares <= 0)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "명의신탁 신주 수를 입력하세요", path: ["nomineeShares"] });
    } else if (!val.propertyValue || val.propertyValue <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "명의신탁 재산 가액을 입력하세요", path: ["propertyValue"] });
    }
  });
const shareholderDividendSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["major_shareholder", "related_party", "other"]),
  ownershipRatio: ratioSchema,
  actualDividend: z.number().nonnegative(),
  name: z.string().optional(),
});

const excessDividendGiftTaxContextSchema = z.object({
  donorRelationship: z.enum([
    "spouse",
    "lineal_ascendant_adult",
    "lineal_ascendant_minor",
    "lineal_descendant",
    "other_relative",
    // §53 열거 밖(비친족) — ⑫ strip 방지
    "none",
  ]),
  priorDeductionApplied: z.number().nonnegative().optional(),
  isGenerationSkip: z.boolean().optional(),
  isMinorGenerationSkip: z.boolean().optional(),
  isWithinFilingDeadline: z.boolean().optional(),
});

const excessDividendSchema = z.object({
  type: z.literal("excess_dividend"),
  shareholders: z.array(shareholderDividendSchema).min(1),
  dividendDate: z.coerce.date(),
  incomeTaxMode: z.enum(["undetermined", "separate", "comprehensive", "exempt"]),
  separateIncomeTax: z.number().nonnegative().optional(),
  comprehensiveTaxBase: z.number().nonnegative().optional(),
  comprehensiveTaxBaseExcluding: z.number().nonnegative().optional(),
  incomeTaxYear: z.number().int().positive().optional(),
  isDiligentFiler: z.boolean().optional(),
  actualIncomeTax: z.number().nonnegative().optional(),
  giftTaxContext: excessDividendGiftTaxContextSchema.optional(),
});
const listingGainSchema = z.object({
  type: z.literal("listing_gain"),
  eventType: z.enum(["listing", "merger"]).optional(),
  settlementPerSharePrice: z.number().nonnegative(),
  perShareAcqValue: z.number().nonnegative(),
  perShareCorpGrowth: z.number(),
  shares: z.number().nonnegative(),
  isMajorShareholder: z.boolean().optional(), // §63③ 최대주주 20% 할증
  isSurchargeExemptEntity: z.boolean().optional(), // §63③ 단서 배제(중소·중견·결손)
  // 령§31의3⑤ 기업가치 자동계산 (지정 시 perShareCorpGrowth 대신)
  corpGrowthAuto: z
    .object({
      totalNetIncomePerShare: z.number(),
      monthsBusinessStartToListingPrevDay: z.number().nonnegative(),
      monthsAcqToSettlement: z.number().nonnegative(),
    })
    .optional(),
});
const propertyServiceUseSchema = z.object({
  type: z.literal("property_service_use"),
  subType: z.enum(["free_use", "low_price", "high_price"]),
  marketValue: z.number().nonnegative(),
  consideration: z.number().nonnegative().optional(),
});
const orgChangeSchema = z.object({
  type: z.literal("org_change"),
  subType: z.enum(["share_change", "value_change"]),
  baseValue: z.number().nonnegative(),
  preShares: z.number().nonnegative().optional(),
  postShares: z.number().nonnegative().optional(),
  postPerSharePrice: z.number().nonnegative().optional(),
  preValue: z.number().nonnegative().optional(),
  postValue: z.number().nonnegative().optional(),
});
const valueIncreaseSchema = z.object({
  type: z.literal("value_increase"),
  currentValue: z.number().nonnegative(),
  acquisitionCost: z.number().nonnegative(),
  normalIncrease: z.number().nonnegative(),
  contribution: z.number().nonnegative(),
  // echo (적용요건 표시 — 산식 무관)
  acquisitionCause: z.enum(["gift", "inside_info", "borrowed_funds"]).optional(),
  valueIncreaseReason: z
    .enum(["development", "form_change", "partition", "license", "kotc_registration", "konex_listing", "similar"])
    .optional(),
  acquisitionDate: z.string().optional(),
  eventDate: z.string().optional(),
});
// §45의5 주주 행 Zod (엔진 SpecificCorpShareholder에 대응)
const scRelationSchema = z.enum([
  "self", // 지배주주 본인 (SC-4-e)
  "lineal_ascendant",
  "lineal_descendant",
  "spouse",
  "sibling",
  "other_relative",
  "other",
]);
const specificCorpShareholderSchema = z.object({
  id: z.string(),
  name: z.string(),
  relation: scRelationSchema,
  // 주식수도 같은 이유로 정수다 — roster 경로의 `shares/totalShares`가 곧 비율 분자·분모다.
  shares: z.number().int().nonnegative(),
  totalShares: z.number().int().nonnegative(),
  isDonor: z.boolean(),
  isRelated: z.boolean(),
  isCorporate: z.boolean().optional(),
  donorRelation: z
    // "none" = §53 열거 밖(비친족) — ⑫ strip 방지
    .enum(["spouse", "lineal_ascendant_adult", "lineal_ascendant_minor", "lineal_descendant", "other_relative", "none"])
    .optional(),
  isGenerationSkip: z.boolean().optional(),
});
/** §45의5 간접출자관계 — 개인 → 법인 → 특정법인 (상증령 §34의3② 각 단계 곱) */
const specificCorpIntermediarySchema = z.object({
  corpShareholderId: z.string(),
  stakeInBeneficiary: ratioSchema,
  owners: z.array(
    z.object({
      individualId: z.string(),
      ratio: ratioSchema,
    }),
  ),
});
const specificCorpSchema = z.object({
  type: z.literal("specific_corp"),
  transactionBenefit: z.number().nonnegative(),
  // 법 §45의5① 거래상대방·각 호 거래유형 (영 §34의5②④⑥⑦) — ⑫ 미등록이면 조용히 stripping된다
  counterparty: z.enum(["ruling_shareholder", "ruling_related", "other"]).optional(),
  transactionType: z
    .enum(["gratuitous", "low_price", "high_price", "capital_transaction", "debt_relief"])
    .optional(),
  marketValue: z.number().nonnegative().optional(),
  consideration: z.number().nonnegative().optional(),
  isDissolvingWithoutResidual: z.boolean().optional(),
  // §53·§57 — 수증자별 축 (roster 행이 담는다)
  // single 하위호환
  corporateTax: z.number().nonnegative().optional(),
  ownershipRatio: ratioSchema.optional(), // ⓑ 승수(인별)
  controllingGroupRatio: ratioSchema.optional(), // ⓐ §45의5① 특정법인 해당성 — 지배주주등 합계(직접+간접)
  // roster 모드 신규 필드 (⑫ Zod 입력 객체 정의 — TS 미감지 지점)
  shareholders: z.array(specificCorpShareholderSchema).optional(),
  intermediaryCorps: z.array(specificCorpIntermediarySchema).optional(),
  // 증여자 2인 이상은 §45의5①상 별개 거래다 — ⑧과 같은 규칙을 ⑫에도 건다(3중 패턴)
  annualIncome: z.number().nonnegative().optional(),
  corporateTaxComputed: z.number().nonnegative().optional(),
  // 영 §34의5④2호가목 — 법인세법 §55의2 토지등 양도소득에 대한 법인세액(산출세액에서 제외)
  corporateTaxOnLandTransfer: z.number().nonnegative().optional(),
  corporateTaxCredit: z.number().nonnegative().optional(),
  giftDeduction: z.number().nonnegative().optional(),
  // §45의5① 「거래한 날을 증여일로 하여」 — §43② 1년 윈도·§69 공제율의 기준일 (⑫ strip 방지)
  transactionDate: z.string().optional(),
  // §43②·영 §32의4 11호 — 소급 1년 이내 같은 호 선행거래 (⑫ strip 방지)
  priorTransactions: z
    .array(
      z.object({
        date: z.string().min(1),
        benefit: z.number().nonnegative(),
        label: z.string().optional(),
      }),
    )
    .optional(),
}).refine(
  (v) => (v.shareholders ?? []).filter((sh) => sh.isDonor).length <= 1,
  { message: "증여자 본인은 1명만 지정할 수 있습니다 (§45의5① — 거래별로 나누어 계산)", path: ["shareholders"] },
);
const convertibleBondSchema = z.object({
  type: z.literal("convertible_bond"),
  caseType: z.enum(["acquisition", "conversion", "conversion_reverse", "transfer"]).optional(),
  // §40①1호·2호 각 목 — 세액 불변(상증령 §30①), 공모 발행 제외 대상 판정용
  clause: z.enum(["from_related", "major_excess", "major_related_nonshareholder"]).optional(),
  // 전환사채등 **발행** 방법 — §39의 allocationMethod(배정)와 다른 개념이라 필드를 분리한다
  issuanceMethod: z.enum(["normal", "public_offering", "deemed_public_offering"]).optional(),
  bondMarketValue: z.number().nonnegative(),
  acquisitionPrice: z.number().nonnegative().optional(),
  transferPrice: z.number().nonnegative().optional(),
  preConvPrice: z.number().nonnegative().optional(),
  preConvShares: z.number().nonnegative().optional(),
  conversionPrice: z.number().nonnegative().optional(),
  increasedShares: z.number().nonnegative().optional(),
  creditedShares: z.number().nonnegative().optional(),
  isListed: z.boolean().optional(),
  listedMarketAvg: z.number().nonnegative().optional(),
  interestLoss: z.number().nonnegative().optional(),
  acquisitionGainPrior: z.number().nonnegative().optional(),
  bondTransferGainForCap: z.number().nonnegative().optional(),
  relatedPreRatio: ratioSchema.optional(),
});
// §45의3 일감몰아주기 — 순수 z.object (cross-field 지분합·매출합은 validate ⑧에 위임: discriminatedUnion superRefine 제약)
const relatedCorpSchema = z.object({
  type: z.literal("related_corp"),
  // §45의3③ 「수혜법인의 해당 사업연도 종료일을 증여시기로 본다」 (⑫ strip 방지 — 빠지면 엔진 미도달)
  fiscalYearEndDate: z.string().optional(),
  enterpriseSize: z.enum(["small", "medium", "large"]),
  totalSales: z.number().int().min(1),
  preTaxAdjOperatingIncome: z.number().int(),
  taxableIncome: z.number().int().min(1),
  corporateTaxNet: z.number().int().min(0),
  /** §⑮1호·2호 분모 — 수혜법인의 사업연도 말일 배당가능이익 (⑫ strip 방지) */
  distributableProfit: z.number().int().min(0).optional(),
  shareholders: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        relation: z.enum(["self", "relative", "other"]),
        directRatio: ratioSchema,
        isCorporate: z.boolean(),
        /** §⑮1호 분자 — 수혜법인으로부터 받은 배당소득 */
        dividendFromBeneficiary: z.number().int().min(0).optional(),
      }),
    )
    .min(1),
  intermediaryCorps: z.array(
    z.object({
      corpShareholderId: z.string().min(1),
      stakeInBeneficiary: ratioSchema,
      /** §⑮2호 분모 — 간접출자법인의 사업연도 말일 배당가능이익 */
      distributableProfit: z.number().int().min(0).optional(),
      owners: z.array(
        z.object({
          individualId: z.string().min(1),
          ratio: ratioSchema,
          /** §⑮2호 분자 — 이 간접출자법인으로부터 받은 배당소득 */
          dividendIncome: z.number().int().min(0).optional(),
        }),
      ),
    }),
  ),
  salesPartners: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        salesAmount: z.number().int().min(0),
        isRelated: z.boolean(),
        /** §⑩ 후단 「동시에 해당하는 경우에는 더 큰 금액으로 한다」 — 한 매출액이 여러 호를 가질 수 있다 */
        exclusionTypes: z
          .array(
            z.enum([
              "sec10_1",
              "sec10_2",
              "sec10_3",
              "sec10_4",
              "sec10_5",
              "sec10_5_2",
              "sec10_5_3",
              "sec10_6",
              "sec10_7",
              "sec10_8",
            ]),
          )
          .optional(),
        /** §⑩3호 전용 — 수혜법인의 그 특수관계법인에 대한 주식보유비율 */
        beneficiaryStakeInPartner: ratioSchema.optional(),
        /** §⑭1호 — 이 매출처가 §⑱ 간접출자법인이면 그 법인주주 id */
        intermediaryCorpShareholderId: z.string().optional(),
        rulingShareholderStakes: z
          .array(z.object({ shareholderId: z.string().min(1), ratio: ratioSchema }))
          .optional(),
      }),
    )
    .min(1),
});

export const deemedGiftInputSchema = z
  .discriminatedUnion("type", [
    trustBenefitSchema,
    insuranceSchema,
    bargainTransferSchema,
    debtForgivenessSchema,
    freeRealEstateSchema,
    freeLoanSchema,
    freeLoanAggregatedSchema,
    mergerSchema,
    capitalIncreaseSchema,
    capitalIncreaseAllocationSchema,
    capitalDecreaseSchema,
    contributionSchema,
    convertibleStockSchema,
    convertibleBondSchema,
    acquisitionFundSchema,
    nomineeTrustSchema,
    excessDividendSchema,
    listingGainSchema,
    propertyServiceUseSchema,
    orgChangeSchema,
    valueIncreaseSchema,
    specificCorpSchema,
    relatedCorpSchema,
  ])
  .superRefine((data, ctx) => {
    if (data.type === "insurance") {
      if (data.relevantPremium > data.totalPremiumPaid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["relevantPremium"],
          message: "관련 보험료가 총 납부보험료를 초과할 수 없습니다 (§34①)",
        });
      }
    }
    // 🔴 SC-H: 법 §45의5①은 「… **주식보유비율을 곱하여** 계산한 금액」이다. 보유주식수가
    //    발행주식총수를 넘는 것은 법이 상정하지 않는 사실관계이고, 그대로 계산하면 증여재산가액이
    //    **특정법인의 이익을 넘는다**(실측 지분율 120% / Σ 160%).
    //    ⑧validate도 같은 술어로 막지만 그쪽은 클라이언트다 — **서버측 관문**을 여기 둔다.
    //    자동 클램프는 하지 않는다(「자동 안분 fallback 금지」와 같은 층위: 잘못된 입력은 차단이 정본).
    if (data.type === "specific_corp" && Array.isArray(data.shareholders)) {
      let sum = 0;
      data.shareholders.forEach((sh, i) => {
        sum += sh.shares;
        if (sh.totalShares > 0 && sh.shares > sh.totalShares) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shareholders", i, "shares"],
            message: `주주 ${i + 1}의 주식수가 발행주식 총수를 초과합니다 (§45의5①)`,
          });
        }
      });
      const total = data.shareholders[0]?.totalShares ?? 0;
      if (total > 0 && sum > total) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shareholders"],
          message: "주주 주식수 합계가 발행주식 총수를 초과합니다 (§45의5①)",
        });
      }
    }
    // 🔴 RC-3-h: 상증령 §34의3⑩1호는 「**중소기업인 수혜법인이** 중소기업인 특수관계법인과
    //    거래한 매출액」이다. 수혜법인 측 규모는 `enterpriseSize`로 이미 들어와 있는데
    //    ⑤·⑧·⑫·엔진 어디도 교차검사를 하지 않아, 일반기업이 ⑩1호를 골라도 전액 과세제외됐다
    //    (실측 421,200,000원 → 0원). ⑧과 같은 술어를 쓰되 **서버측 관문**을 여기 둔다.
    //    ⚠️ 필요조건 검사다 — `small`이 ⑥의 「공시대상기업집단 미소속」까지 보증하지는 않고,
    //       특수관계법인 측 규모는 입력이 없다. 확실히 틀린 쪽만 막는다.
    if (data.type === "related_corp" && data.enterpriseSize !== "small" && Array.isArray(data.salesPartners)) {
      data.salesPartners.forEach((p, i) => {
        if (p.exclusionTypes?.includes("sec10_1")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["salesPartners", i, "exclusionTypes"],
            message: `매출처 ${i + 1}: ⑩1호는 수혜법인이 중소기업인 경우에만 적용됩니다 (상증령 §34의3⑩1호)`,
          });
        }
      });
    }
    // 🔴 RC-3-i: ⑩2호(50% 이상)와 ⑩3호(50% 미만)는 같은 보유비율을 50% 기준으로 가르므로
    //    동시 해당이 논리적으로 불가능하다. ⑧과 같은 술어를 서버측에도 둔다.
    if (data.type === "related_corp" && Array.isArray(data.salesPartners)) {
      data.salesPartners.forEach((p, i) => {
        const t = p.exclusionTypes ?? [];
        if (t.includes("sec10_2") && t.includes("sec10_3")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["salesPartners", i, "exclusionTypes"],
            message: `매출처 ${i + 1}: ⑩2호와 ⑩3호는 동시에 해당할 수 없습니다 (상증령 §34의3⑩2호·3호)`,
          });
        }
        if (t.length !== new Set(t).size) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["salesPartners", i, "exclusionTypes"],
            message: `매출처 ${i + 1}: 과세제외유형이 중복 선택됐습니다`,
          });
        }
      });
    }
    // 🔴 SC-6-h: single(=roster 미사용) 모드에서 지배주주등 지분율이 없으면 엔진이 조용히 0%로
    //    계산해 「증여의제이익이 1억원 미만 (§34의5⑤)」이라는 **틀린 사유**를 돌려줬다.
    //    ⑧validate(`:477-480`)가 같은 술어로 막지만 그쪽은 클라이언트다 — 서버측 관문을 여기 둔다.
    //    ⚠️ 「존재」만 보면 no-op이다 — ④는 미입력 칸도 `{numer:0, denom:10000}`을 **명시 전송**한다.
    //       그래서 `numer > 0`까지 본다(자동 fallback 금지: 미입력은 차단이 정본).
    if (data.type === "specific_corp" && !(Array.isArray(data.shareholders) && data.shareholders.length > 0)) {
      if (!data.ownershipRatio || data.ownershipRatio.numer <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ownershipRatio"],
          message: "지배주주등 지분율을 입력하세요 — 0%로는 §45의5 증여의제이익을 산출할 수 없습니다",
        });
      }
    }
    // 🔴 RC-3-f: 간접출자법인 행은 법인주주별로 **합계가 그 법인주주의 수혜법인 직접지분과
    //    같아야** 한다. 행 단위 동치만 보면 같은 법인주주를 가리키는 행이 2개일 때 둘 다 통과하고
    //    (각 행 30% = 섹션2의 30%), 엔진 `computeIndirectPaths`가 **행마다** path를 만들어
    //    간접보유비율이 행 수에 선형으로 배가된다(probe 실측 421,200,000 → 842,400,000 → 1,263,600,000).
    //    ⑧validate도 같은 술어로 막지만 그쪽은 클라이언트다 — **서버측 관문**을 여기 둔다.
    if (data.type === "related_corp" && Array.isArray(data.intermediaryCorps) && Array.isArray(data.shareholders)) {
      const sumByCorp = new Map<string, number>();
      for (const row of data.intermediaryCorps) {
        const st = row.stakeInBeneficiary;
        sumByCorp.set(row.corpShareholderId, (sumByCorp.get(row.corpShareholderId) ?? 0) + (st.denom > 0 ? (st.numer * 100) / st.denom : 0));
      }
      for (const [corpId, sum] of sumByCorp) {
        const corpRow = data.shareholders.find((s) => s.id === corpId);
        if (!corpRow) continue; // 고아 참조는 ⑧이 차단한다(⑫은 화면의 id 집합을 모른다)
        const dr = corpRow.directRatio;
        const direct = dr.denom > 0 ? (dr.numer * 100) / dr.denom : 0;
        if (Math.abs(sum - direct) > 0.01) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["intermediaryCorps"],
            message:
              `「${corpRow.name.trim() || "법인주주"}」의 간접출자법인 수혜법인 지분율 합계(${sum.toFixed(2)}%)가 ` +
              `주주현황의 직접지분(${direct.toFixed(2)}%)과 다릅니다 (상증령 §34의3⑬)`,
          });
        }
      }
    }
    if (data.type === "free_realestate") {
      // 다기간 모드(periods 정의됨) — 빈 배열 차단(자동 fallback 금지)
      if (data.periods !== undefined) {
        if (data.periods.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periods"], message: "다기간 입력 시 기간을 1개 이상 추가하세요 (§37·시행령§27③⑤)" });
        }
      } else {
        // 단일기간
        if (data.subType === "free_use" && !data.propertyValue) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["propertyValue"], message: "무상사용은 부동산 가액 입력이 필요합니다 (§37①)" });
        }
        if (data.subType === "collateral" && !data.loanAmount) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["loanAmount"], message: "무상담보는 차입금 입력이 필요합니다 (§37②)" });
        }
      }
    }
  });

export type DeemedGiftInputParsed = z.infer<typeof deemedGiftInputSchema>;
