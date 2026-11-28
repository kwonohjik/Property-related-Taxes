/**
 * 상속·증여 자산(EstateItem) 공통 Zod 스키마 — heirAllocationSchema + baseItemSchema.
 * estate-item-schema.ts에서 분리(800줄 정책, U-04 2026-11-28). 외부 경로는 estate-item-schema.ts re-export로 보존.
 */
import { z } from "zod";


export const heirAllocationSchema = z.object({
  heirId: z.string().min(1),
  amount: z.number().nonnegative(),
  areaM2: z.number().nonnegative().optional(),
});

export const baseItemSchema = z.object({
  id: z.string().min(1),
  // cash·financial·deposit은 위치 기반이 아니므로 자산명 선택 입력 (빈 문자열 허용)
  name: z.string(),
  marketValue: z.number().nonnegative().optional(),
  appraisedValue: z.number().nonnegative().optional(),
  similarSalesValue: z.number().nonnegative().optional(), // 유사매매사례가액 (시행령 §49④) — baseItemSchema 추가 → 9멤버 .extend 전파
  /**
   * 유사매매사례가액 출처 메타 (§9 D8 — 1필드만).
   * "manual": 사용자 수동 입력 / "rtms_auto": RTMS 자동조회 후 선택
   * 엔진 미소비 — UI 표시 전용. baseItemSchema 추가 → discriminatedUnion 9멤버 자동 전파.
   */
  similarSalesSource: z.enum(["manual", "rtms_auto"]).optional(),
  standardPrice: z.number().nonnegative().optional(),
  // 상업용 건물 부수토지 개별공시지가 총액(§61①1호) — 경로 B 보충평가 합산용. 누락 시 silent strip.
  appurtenantLandStandardPrice: z.number().nonnegative().optional(),
  // 부수토지 대지면적(㎡) — 총액 산출 근거 보존 + 건물 기준시가 계산기 prefill. 엔진 미소비(총액이 단일 진실).
  appurtenantLandArea: z.number().nonnegative().optional(),
  // 상속개시자료 요약 4표 (2026-05-28) — Table A 비고/수량 열
  valuationMethod: z
    .enum([
      "market_value",
      "similar_sales",
      "standard_price",
      "appraisal",
      "acquisition_cost",
      "book_value",
    ])
    .optional(),
  areaSqm: z.number().nonnegative().optional(),
  quantityCount: z.number().nonnegative().optional(),
  mortgageAmount: z.number().nonnegative().optional(),
  leaseDeposit: z.number().nonnegative().optional(),
  // §47① 부담부증여 수증자 인수 채무 (증여 모드 전용 — §66 평가용 mortgageAmount와 독립)
  assumedDebtForGift: z.number().nonnegative().optional(),
  // §47③ 배우자·직계존비속 채무 인수 객관적 입증 토글 (표시·안내용)
  burdenedGiftDebtConfirmed: z.boolean().optional(),
  // §47① 합산배제증여재산(§41의3·§41의5) — 본세 §55① 호별 스트림. ⑫ strip 방지
  isAggregationExcludedGift: z.boolean().optional(),
  // 증여의제 법정 산식 산정액 표지 — 부표1 ⑧ 평가기준코드 01 배제. ⑫ strip 방지
  isStatutoryFormulaValue: z.boolean().optional(),
  // 「상증법」§4의2⑥ 단서 면제 표지 — ⑫ strip 방지(빠지면 토글 잠금이 발동하지 않는다)
  isJointLiabilityExemptGift: z.boolean().optional(),
  // §55① 호분기 — 명의신탁(1호)·일감몰아주기(2호)=3천만 공제 없음, 그 외(3호)=3천만 공제. ⑫ strip 방지 (G-4)
  aggregationExcludedClass: z.enum(["nominee_trust", "deemed_profit", "general"]).optional(),
  // §45의5② 증여세 한도 + staleness 근거 — ⑫ strip 방지(빠지면 마법사가 한도를 모른 채 계산한다)
  deemedGiftTaxCap: z
    .object({
      limitAmount: z.number().nonnegative(),
      basis: z.object({
        deemedGiftValue: z.number().nonnegative(),
        giftDeduction: z.number().nonnegative(),
      }),
    })
    .optional(),
  monthlyRent: z.number().nonnegative().optional(), // §61⑤ 임대료환산
  // §61⑤ 미임대(공실) 부분 — 1동 건물 일부 임대 시 미임대분 기준시가 합산용. 누락 시 silent strip.
  totalBuildingArea: z.number().nonnegative().optional(), // 전체 건물 연면적(㎡) — 토지 안분 분모
  vacantBuildingArea: z.number().nonnegative().optional(), // 미임대 건물 연면적(㎡) — 토지 안분 분자
  vacantBuildingStandardPrice: z.number().nonnegative().optional(), // 미임대분 건물 기준시가(원, 직접입력)
  creditGuaranteeAmount: z.number().nonnegative().optional(), // §63② 신용보증 차감
  // 담보채무 §14 자동공제 (collateral-debt-auto-deduction)
  deductSecuredClaimAsDebt: z.boolean().optional(),
  securedClaimIsFinancialDebt: z.boolean().optional(),
  securedClaimCreditorName: z.string().optional(),
  // 종합사례 PDF 확장
  heirAllocations: z.array(heirAllocationSchema).optional(),
  deemedCategory: z.enum(["retirement", "insurance", "trust"]).optional(),
  // 갭4: 물납 충당순위 §74②6호 상속인 거주주택 (누락 시 z.object 침묵 strip — ⑫)
  isHeirResidenceProperty: z.boolean().optional(),
  /** 국채·공채 (상증령 §74②1호 충당 1순위 · §73⑤ 금융재산 열거 외) — 물납 표시 전용 */
  isGovernmentBond: z.boolean().optional(),
  isGovernmentBondListed: z.boolean().optional(),
  /** §74①2호가목 단서 — 최초상장 + 자본시장법 처분제한 (물납 충당 2순위) */
  isNewlyListedDisposalRestricted: z.boolean().optional(),
  isFamilyBusinessAsset: z.boolean().optional(),
  // §23의2 동거주택 상속공제 자동도출 (v3)
  isCohabitantHouse: z.boolean().optional(),
  // §23의2 자산유형 — 입주권·분양권 미적용 게이트 (조심 2021중6665 / 재산세제과-237)
  cohabitHouseRightType: z
    .enum(["house", "single_redev_right", "one_plus_one_right", "sale_right"])
    .optional(),
  // §22 금융재산상속공제 자동화 (2026-05-21)
  isFinancialAssetForDeduction: z.boolean().optional(),
  // §22② 최대주주 법정 강제 배제 — 상장·비상장 V1·V2 공용 직속 필드 (2026-05-27, E-4)
  // baseItemSchema 상속으로 listedItemSchema·unlistedItemSchema 모두 자동 적용.
  isSection22MajorShareholder: z.boolean().optional(),
  trustType: z.enum(["cash_trust", "real_estate", "security", "other"]).optional(),
  // 영농상속공제 자동화 (2026-05-21, §18의3 + 시행령 §16⑤)
  farmingCategory: z
    .enum([
      "farmland",
      "pasture",
      "forest_land",
      "fishing_vessel",
      "fishing_right",
      "agricultural_building",
      "salt_field",
      "corporate_stock",
    ])
    .optional(),
  // 어업권·양식업권 면허 제외 (PR-RE-1, 시행령 §16⑤마목 단서)
  fishingLicenseExcluded: z.boolean().optional(),
  // 가업상속공제 정밀화 (2026-05-21, 상증법 §18의2 + 상증령 §15⑤)
  familyBusinessCategory: z
    .enum([
      "business_real_estate",
      "business_equipment",
      "corporate_stock",
      "intangible_asset",
      "inventory",
      "other",
    ])
    .optional(),
  // 거주지 자동 검증 좌표 (PR-E F-10, §16②1호나)
  estateLatLng: z.object({ lat: z.number(), lng: z.number() }).optional(),
  fishingAnchorLatLng: z
    .object({ lat: z.number(), lng: z.number() })
    .optional(),
  // v4.1.1 Phase 0+0-Fix — 자산 소재지 시·군·구 코드 + 주소 영속화
  estateSigunguCode: z.string().optional(),
  fishingAnchorSigunguCode: z.string().optional(),
  estateAddress: z
    .object({
      road: z.string().optional(),
      jibun: z.string().optional(),
      building: z.string().optional(),
      detail: z.string().optional(),
      pnu: z.string().optional(),
    })
    .optional(),
  // 법인 사업무관자산 (PR-C F-8, 시행령 §15⑤2호 + §16⑤2호)
  corporateNonBusinessAssets: z
    .object({
      nonBusinessLand: z.number().nonnegative().optional(),
      rentedRealEstate: z.number().nonnegative().optional(),
      externalLoans: z.number().nonnegative().optional(),
      excessCash: z.number().nonnegative().optional(),
      nonOperatingFinancial: z.number().nonnegative().optional(),
      // PR-3-b — 과다현금 자동산정 + 나·다목 제외 단서 (strip 방지)
      currentCash: z.number().nonnegative().optional(),
      // 미입력 칸은 null (자리 고정 — IG-028·IG-029). 엔진이 Number.isFinite로 걸러낸다.
      cashByYearEnd: z.array(z.number().nonnegative().nullable()).optional(),
      rentedRealEstateExclusion: z.number().nonnegative().optional(),
      externalLoansExclusion: z.number().nonnegative().optional(),
    })
    .optional(),
  corporateTotalAssets: z.number().nonnegative().optional(),
  // 영농 2년 사용 (G4, §16⑤1호) — false=제외, undefined=충족 가정
  farmingUsedTwoYears: z.boolean().optional(),
  // D4: 영농 사용 개시일 (D-4, §16⑤1호 자동판정, 2026-06-04) — YYYY-MM-DD string, Date 변환 금지
  // farmingUseStartDate 입력 시 deathDate 대비 자동판정, 미입력 시 farmingUsedTwoYears fallback
  farmingUseStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
  // §74 지정문화유산 등 징수유예 (상증법 §74 / 상증령 §76①) — base 공통(전 variant 전파)
  culturalHeritageType: z
    .enum(["heritage_data", "museum", "designated", "natural_monument"])
    .optional(),
  // ===== 조특법 특례 2-스트림 분리과세 (§30의5⑪·§30의6⑤) =====
  // T-11: 동기화 지점 ⑨⑫ — types/inheritance-gift.types.ts EstateItem.isSpecialTreatmentAsset과 동기화
  /**
   * 특례 스트림 귀속 여부 — 혼합 증여(N개 자산) 시 명시 필수.
   *   true  → 특례 스트림 (창업자금 §30의5 / 가업승계 §30의6)
   *   false → 일반 스트림 (§47·§53·§56)
   *   undefined → 단일 자산 시 자동 특례 귀속 (명시 불필요)
   * 법령 근거: §30의5⑪ — 창업자금 외 자산은 특례 스트림 과세가액에 §47② 합산 금지.
   */
  isSpecialTreatmentAsset: z.boolean().optional(),
  // ===== 조특법 §71 영농자녀 농지 감면 (gift-farmland-reduction-71) =====
  // 동기화 지점 ⑫ — EstateItem.isFarmlandGiftReduction과 동기화 (누락 시 z.object 침묵 strip)
  isFarmlandGiftReduction: z.boolean().optional(),
});
