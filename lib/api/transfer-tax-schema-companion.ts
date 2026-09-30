/**
 * ⑫ 함께 양도된 자산(Companion Asset) 스키마 + 일괄양도 안분 보조 스키마.
 *
 * 800줄 정책에 따라 `transfer-tax-schema-sub.ts`에서 분리(2026-09-30). 공개 경로는 종전대로
 * `transfer-tax-schema-sub.ts`의 재export다.
 */
import { z } from "zod";
import { burdenedGiftInfoSchema } from "./transfer-tax-burdened-gift-schema";
import { carryoverTaxationEngineShape } from "./transfer-tax-building-schemas";
import { commercialAppurtenantLandSchema } from "./transfer-tax-building-schemas";
import { commercialBuildingValuationRequiredSchema } from "./transfer-tax-schema-commercial-refines";
import { redevelopmentSchema } from "./transfer-tax-redevelopment-schema";
import { generalBuildingValuationSchema } from "./transfer-tax-building-schemas";
import { mixedUseAssetSchema } from "./transfer-tax-schema-mixed-use";
import { reductionSchema } from "./transfer-tax-schema-reductions";
import { sec163_9AcquisitionShape } from "./transfer-tax-schema-sec163-9-shape";
// ⑫ 분리취득 축 — 단건·컴패니언 공용 shape (leaf라 TDZ 안전).
import { splitAcquisitionShape } from "./transfer-tax-schema-split";

// ─── 일괄양도 안분 — 상속 보충적평가액 입력 스키마 ───────────────

export const inheritanceValuationSchema = z.object({
  /** 상속개시일 */
  inheritanceDate: z.string().date(),
  /** 자산 종류 */
  assetKind: z.enum(["land", "house_individual", "house_apart"]),
  /** 토지 면적 (㎡) — assetKind=land 필수 */
  landAreaM2: z.number().positive().optional(),
  /** 상속개시일 직전 공시가격 (원/㎡ for land, 원 총액 for house) */
  publishedValueAtInheritance: z.number().int().nonnegative(),
  /** 시가 (우선순위 1) */
  marketValue: z.number().int().nonnegative().optional(),
  /** 감정평가 평균 (우선순위 2) */
  appraisalAverage: z.number().int().nonnegative().optional(),
});

// ─── 함께 양도된 자산(Companion Asset) 스키마 ────────────────────
// 소득세법 시행령 §166 ⑥ — 주 자산과 한 계약으로 일괄양도된 다른 자산.
// 주 자산 정보는 propertyBaseShape의 기본 필드로 들어오고,
// companionAssets는 주 자산과 기준시가 비율로 안분될 보조 자산들이다.

/**
 * ⑫ 동일조정기간 내 취득·양도 시 「양도당시 기준시가」 환산 (소령 §164⑧ · 소칙 §80①~⑤).
 *
 * 엔진이 요건을 게이트하므로 스키마는 **형태만** 검증한다. 여기 없으면 route에서
 * 침묵 strip되어 엔진에 도달하지 못한다.
 *
 * `priorBasis`·`priceSource`는 계산에 영향이 없지만 결과 화면의 근거·배지 표시에 쓰이므로
 * 함께 통과시킨다 — 「세액 무영향이니 빼도 된다」가 침묵 strip의 전형이다.
 */
export const sameAdjustmentPeriodSchema = z.object({
  formula: z.enum(["prev", "new"]).optional(),
  priorStandardPrice: z.number().int().nonnegative().optional(),
  newStandardPrice: z.number().int().nonnegative().optional(),
  adjustmentMonths: z.number().int().positive().optional(),
  priorBasis: z.enum(["direct", "nearby_land", "first_notice_rate", "ratio_conversion"]).optional(),
  priceSource: z.enum(["lookup", "manual"]).optional(),
});

export const companionAssetSchema = z.object({
  /**
   * ⑫ 토지·건물 **분리취득** 축 (N-6(A), 2026-08-23) — 단건과 **같은 shape**을 spread한다.
   *
   * 🔴 종전에는 이 축의 필드가 **하나도 없었다**. ⑤ UI(`CompanionAcqPurchaseBlock`의
   * 「토지·건물 취득일 다름」 토글)는 자산 인덱스를 보지 않아 컴패니언에도 렌더되고,
   * ④ 빌더(`buildSplitPayload`)도 `AssetForm`을 받는 공용 함수인데, ⑫에 칸이 없어
   * **조용히 strip**됐다 ⇒ 컴패니언에서 분리취득을 켜도 세액이 1원도 안 움직였다.
   *
   * ⚠️ 목록을 여기 **복사하지 않는다** — 두 벌이면 단건에 필드가 늘 때 컴패니언만 빠진다.
   */
  ...splitAcquisitionShape,
  assetId: z.string().min(1),
  assetLabel: z.string().min(1),
  /**
   * 🔄 **`commercial_building` 추가 (2026-09-03).** 종전 3종 enum은 컴패니언 상가를
   * **400으로 죽였다** — ⑧ `SINGLE_ONLY`에는 상가가 없어 화면은 통과시키는데
   * route가 「Invalid option」을 내는 **안내 없는 dead-end**였다(실측).
   * 「상가는 차단하지 않는다」는 종전 주석은 **primary가 상가일 때만** 맞았다.
   *
   * 🔄 **`presale_right` 추가 (2026-09-03).** 분양권은 장벽이 달랐다 — ⑩이 아니라 **④의 fold**가
   *    `presale_right`를 `housing`으로 접어 **200이면서 틀린 값**이었다(§104①1호 60% 단일세율과
   *    §95② 장기보유특별공제 배제가 함께 사라져 누진 그룹에 합산). ⑩·⑭를 함께 넓히고
   *    `toEngineAssetKind`에서 분양권을 뺐다. 서브객체는 없다 — 분양권 특유 축(세율·LTHD 배제·
   *    개산공제 §163⑥4호)은 전부 엔진이 `propertyType`만으로 판정한다.
   *
   * 🔄 **`right_to_move_in`·`redevelopment_apt` 추가 (2026-09-03).** 두 자산의 장벽이 서로
   *    달랐다 — 입주권은 ④ fold(200이면서 §166 없이 주택 계산), 재개발APT는 ⑩ enum(400).
   *    아래 `redevelopment` 서브객체를 함께 등록해 열었다.
   *
   * 🔄 **`general_building` 추가 (2026-09-03).** 장벽은 ⑩만이 아니었다 — route 5-a가
   *    `return`해 5-a-3 GB 분기가 **도달조차 하지 않았다**. ⑭가 `buildGbPartCards`로 파트
   *    카드를 만들어 aggregate에 합류시킨다(축 B와 **같은 leaf**).
   *
   * ⚠️ 남은 1종은 **겸용주택**(`housing` + `isMixedUseHouse`)이고 ⑧이 막는다. 그쪽은
   *    `MixedUseGainBreakdown`으로 **세액까지 자체 완결**해 aggregate 합류 경로가 없다 —
   *    세액 계산 주체를 옮기는 별건이다(설계문서 §2·V-2~V-4).
   */
  assetKind: z.enum([
    "housing",
    "land",
    "building",
    "commercial_building",
    "presale_right",
    "right_to_move_in",
    "redevelopment_apt",
    "general_building",
    "mixed_use_house",
  ]),
  /**
   * ⑫ 겸용주택(§160① 단서) — `mixed_use_house` 컴패니언 전용. **primary와 같은 스키마**.
   *
   * 🔑 이 서브객체가 있어야 ⑭가 겸용 엔진을 돌려 파트 카드로 펼칠 수 있다. 등록하지 않으면
   *    침묵 strip이라 그 자산이 **주택·상가 분리 없이** 계산된다.
   *
   * ⚠️ **primary 겸용은 여전히 ⑧이 막는다** — 5-a의 primary는 `{...engineInput}` 스프레드라
   *    (`route.ts`) 겸용이어도 평범한 주택 item이 된다. 컴패니언만 여는 것이
   *    「⑧ 통과 ↔ route 침묵 오산」을 만들지 않는 최소 개방이다.
   */
  mixedUse: mixedUseAssetSchema.optional(),
  /**
   * ⑫ 시행령 §166 (재개발·재건축) — `right_to_move_in`·`redevelopment_apt` 컴패니언 전용.
   *
   * **primary와 같은 스키마를 그대로 쓴다**(`redevelopmentSchema`). 컴패니언은 각 자산이
   * 자기 물건의 100%라 지분 스케일이 없고, 나머지 규약(refine 4종 포함)이 전부 동일하다.
   *
   * 🔑 등록하지 않으면 **침묵 strip**이라 그 자산만 §166을 잃고 일반 주택 산식으로 계산된다
   *    — 입주권이 ④ fold로 겪던 것과 **같은 결과**가 ⑫에서 다시 만들어진다.
   */
  redevelopment: redevelopmentSchema,
  /**
   * ⑫ 일반건물(토지+건물 일괄) — `general_building` 컴패니언 전용. **primary와 같은 스키마**.
   *
   * 🔑 이 서브객체가 있어야 ⑭가 파트 카드로 펼칠 수 있다. 등록하지 않으면 침묵 strip이라
   *    그 자산이 **토지·건물 분리 없이** 계산된다 — route 5-a-3이 도달조차 못 하던 종전 상태와
   *    같은 결과다(설계문서 `transfer-bundled-subengine-hosting.design.md` §1).
   */
  generalBuildingValuation: generalBuildingValuationSchema.optional(),
  /**
   * ⑫ 상가 부수토지 초과분(§101① 배율) — **물건 전체 면적**이라 지분·안분과 무관하다.
   * 누락 시 §104①8호 +10%p 세율이 통째로 사라진다(primary 축에서 실측 이력).
   */
  commercialAppurtenantLand: commercialAppurtenantLandSchema.optional(),
  /** ⑫ 상가 환산취득가(cb 기준시가) — 분자·분모로 약분되므로 지분 스케일 불요. */
  // §164⑥ 괄호 단서(§164⑧ 준용) 필수 입력 superRefine 포함 — 단건과 같은 스키마(CB1)
  commercialBuildingValuation: commercialBuildingValuationRequiredSchema.optional(),
  /**
   * 양도시점 기준시가 — **§97①1호나목 환산 분모**(매매 estimated·이월과세 general 환산).
   *
   * 🔴 **안분 키가 아니다.** 이월과세 `general` 환산 컴패니언에서 ④가 이 칸을
   *    **증여자의** 양도시 기준시가로 덮어쓰기 때문이다
   *    (`lib/calc/transfer-tax-api-carryover.ts` `topLevelOverrides`).
   *    §166⑥ 안분 키는 아래 `standardPriceAtTransferForApportion`이다.
   */
  standardPriceAtTransfer: z.number().int().positive().optional(),
  /**
   * §166⑥ **안분 키** — 사용자가 자산 카드에 입력한 「양도시 기준시가」.
   * 주택: 개별주택가격, 토지: 공시지가×면적. apportioned 모드에서 필수
   * (actual 모드·지분 컴패니언은 선택 — `transfer-tax-schema.ts` superRefine).
   *
   * 🔑 주 자산의 폼-전역 `standardPriceAtTransferForApportion`과 **같은 역할**이다.
   *    이 필드가 없으면 이월과세 general 환산 컴패니언에서 안분 키가 증여자 기준시가로
   *    치환된다(D-5).
   */
  standardPriceAtTransferForApportion: z.number().int().positive().optional(),
  /** 취득시점 기준시가 (선택) — totalAcquisitionPrice 안분 또는 매매 estimated 환산 시 키 */
  standardPriceAtAcquisition: z.number().int().positive().optional(),
  /** ⑫ §164⑧ 환산 — 컴패니언 자산도 자기 취득·양도일 축으로 판정된다 */
  sameAdjustmentPeriod: sameAdjustmentPeriodSchema.optional(),
  /**
   * ⑫ 공익수용·공매 §164⑨ 특례 — **컴패니언 자산도 대상**(소득세법 시행령 §164⑨).
   *
   * §164⑨은 법 §99①1호 **가목~라목(토지·건물·오피스텔/상업용 건물·주택) 전부**를 대상으로 하는
   * **자산 단위** 규정이고, 「주된 자산 전용」·「일괄양도 제외」 문언이 본문·괄호·단서 어디에도 없다.
   * 나아가 법 §100② → 영 §166⑥ → 「부가가치세법 시행령」 §64①1호가 일괄양도 안분 키를
   * **기준시가**로 지정하므로, 컴패니언의 양도 당시 기준시가는 법적으로 살아있는 값이고
   * §164⑨이 바로 그 값을 계산하는 규정이다.
   *
   * 🔴 이 9필드가 없으면 ④(`buildAssetPayload`)가 실은 값을 Zod가 **조용히 떼어내**
   *    ⑭(`bundled-split-helpers.ts`)의 매핑이 이미 있어도 엔진에 도달하지 못한다.
   *    (실측: 400이 아니라 200 + 특례 미적용값 — 화면에는 입력값이 그대로 보인다.)
   *
   * 타입은 단건 `propertyBaseShape`(transfer-tax-schema.ts)와 **동일**해야 한다.
   * ⚠️ 2호(공매·경락)는 조문상 수용을 요건으로 하지 않는다 — `transferCause`에 종속시키지 말 것.
   */
  transferCause: z.enum(["general", "public_expropriation"]).optional(),
  /** §164⑨1호 원/㎡ 트랙 (가·나목) — 엔진이 게이트, 여기선 strip 방지 */
  standardPricePerSqmAtTransfer: z.number().int().nonnegative().optional(),
  transferArea: z.number().positive().optional(),
  compensationPerSqm: z.number().int().nonnegative().optional(),
  compensationBasisStdPrice: z.number().int().nonnegative().optional(),
  /** §164⑨2호 공매·경락 — 1호와 독립 요건(수용 불요) */
  isAuctionTransfer: z.boolean().optional(),
  auctionPrice: z.number().int().nonnegative().optional(),
  /** §164⑨1호 주택 총액 트랙 (라목) — 개별·공동주택가격은 총액이라 원/㎡ 분해가 없다 */
  housingCompensationTotal: z.number().int().nonnegative().optional(),
  housingCompensationBasisTotal: z.number().int().nonnegative().optional(),
  /**
   * 공유지분율 (0<r≤1) — 필요경비 개산공제(§163⑥) base 축소 전용. ⑫ 침묵 stripping 방지.
   * 기준시가는 물건 전체 값을 유지하고 개산공제만 「지분 기준시가 × 3%」가 된다.
   */
  ownershipRatio: z.number().positive().max(1).optional(),
  /**
   * ⑫ 부담부증여(소령 §159) — 축 B(지분 분할 취득) 컴패니언. **누락 시 침묵 stripping**이라
   * 그 지분만 §159를 타지 않아 세액이 조용히 틀린다.
   *
   * 채무 4필드는 ④(`buildBurdenedGiftInfo`)가 **이 자산의 지분율로 안분해** 보낸다 —
   * 축 A(공유 소유)와 **반대** 규약이다. 평가액·기준시가는 물건 전체 raw이고
   * 엔진이 `ownershipRatio`로 줄인다.
   */
  burdenedGiftInfo: burdenedGiftInfoSchema.optional(),
  /**
   * ⑫ 양도 형태 — 엔진의 §159 게이트(`transfer-tax-burdened-gift-step.ts`
   * `isBurdenedGiftEngine`)가 **이 값**을 본다. `burdenedGiftInfo`만 실어도
   * 이것이 없으면 STEP 0.48이 **발동하지 않는다**(실측: 컴패니언 차익이
   * 「총계약가 × 지분율」로 남아 400,000,000 — 정답 116,400,000).
   */
  transferType: z.enum(["regular", "burdened_gift"]).optional(),
  /** 자산 직접 귀속 필요경비 (원, 선택) */
  directExpenses: z.number().int().nonnegative().optional(),
  /** 자본적 지출액 (소득세법 §97① 가목) — §97② 단서 swap 비교에 사용. 지분 모드는 × ratio 적용된 값 */
  capitalExpenditure: z.number().int().nonnegative().optional(),
  /** 양도비 (소득세법 §97① 나목) — §97② 단서 swap 비교에 사용. 지분 모드는 × ratio 적용된 값 */
  transferExpense: z.number().int().nonnegative().optional(),
  /** 상속·증여·매매(actual) 등 취득가액이 자산별로 확정된 경우 (선택) */
  fixedAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** 상속 보충적평가액 산정용 입력 (선택) — 지정 시 fixedAcquisitionPrice로 주입됨 */
  inheritanceValuation: inheritanceValuationSchema.optional(),
  /** 자산별 감면 (예: 농지 자경 감면) */
  reductions: z.array(reductionSchema).default([]),
  /**
   * §77 감면 자산이 「직접 경작한 토지」인지 — 농특세령 §4①1호 괄호 (D11-02).
   * ④가 자산의 reductions에서 승격해 싣는다(자산 축 — 엔진은 감면 유형 확정 후에 본다).
   */
  isSelfCultivatedExpropriatedLand: z.boolean().optional(),
  /** 자산별 1세대 1주택 여부 (주택 자산에 적용) */
  isOneHousehold: z.boolean().optional(),
  /** 자산별 거주기간(월) — 주택의 1세대1주택 판정용 */
  residencePeriodMonths: z.number().int().nonnegative().optional(),
  /** 자산별 미등기 여부 */
  isUnregistered: z.boolean().optional(),
  /** 자산별 비사업용 토지 여부 */
  isNonBusinessLand: z.boolean().optional(),
  // ── 일괄양도 보완: 양도가액 모드 + 취득원인 분기 ──
  /**
   * 계약서에 구분 기재된 실제 양도가액 (원, 선택).
   * §166⑥ 본문 — 지정 시 안분 대상 제외, 그대로 allocatedSalePrice로 사용.
   */
  fixedSalePrice: z.number().int().positive().optional(),
  /** 동반자산 취득 원인 — 기본 "inheritance" (기존 동작 호환).
   *  "newConstruction"은 사례 28(나대지 + 신축주택 일괄양도) 신축자가건축 케이스. */
  acquisitionCause: z
    .enum(["purchase", "inheritance", "gift", "carryover_gift", "newConstruction"])
    .default("inheritance"),
  /**
   * 12억 안분 분모용 총 물건 양도가액 — 지분 모드 전용 (단독 소유는 미설정).
   * 동일 물건을 다회 분할 취득(지분 단계취득)한 자산에서 본 자산이 보유한 지분의
   * 분모로 총 물건 양도가액을 전달. fixedSalePrice는 이미 × ratio 적용됨.
   */
  totalPropertyTransferPrice: z.number().int().positive().optional(),
  /** 매매 시 환산취득가 사용 여부 */
  useEstimatedAcquisition: z.boolean().optional(),
  /** 본인 취득일 (YYYY-MM-DD) — 보유기간 산정용 */
  acquisitionDate: z.string().date().optional(),
  /** Round 9 (2026-05-06): 자산-수준 매매계약일 — §99의3 등 13개 매매계약일 기준 조문 시한 판정 */
  assetContractDate: z.string().date().optional(),
  /** 상속 시 피상속인 취득일 (자산별 단기보유 통산용) */
  decedentAcquisitionDate: z.string().date().optional(),
  /** §154⑧3호 상속주택 자체 양도 보유기간 통산 (동일세대 게이트 + 거주·보유 개시일) */
  decedentSameHouseholdBeforeInheritance: z.boolean().optional(),
  decedentCohabitationHoldingStartDate: z.string().date().optional(),
  decedentCohabitationResidenceMonths: z.number().int().nonnegative().optional(),
  /** 증여 시 증여자 취득일 */
  donorAcquisitionDate: z.string().date().optional(),
  /**
   * ⑩⑫ 사용자 수동 세율 오버라이드 — 부수토지 일체과세 자동 분기 무시.
   * 미지정(undefined) 시 landNature 기반 자동 분기.
   *
   * - "shortTermHousing70": 주택 단기보유 70% 강제
   * - "shortTerm60":        1년~2년 주택 세율 60% 강제
   * - "progressive":        일반 누진세율 강제
   *
   * 법령 근거: 소득세법 §89①3호 / 시행령 §154⑦ / §104①후단
   * (기재부 재산-53(2015.1.15), 재산-1354(2022.10.27))
   */
  manualHoldingPeriodOverride: z
    .enum(["shortTermHousing70", "shortTerm60", "progressive"])
    .optional(),
  /**
   * ⑩⑫ 토지 성질 명시 입력 (assetKind === "land" companion 자산).
   * 사용자가 자산 카드에서 선언.
   * - "appurtenant_to_housing": 주택 부수토지 (§89①3호·영§154⑦ 일체과세 대상)
   * - "non_appurtenant": 독립 나대지 (토지 본래 세율 적용)
   */
  landNature: z
    .enum(["appurtenant_to_housing", "non_appurtenant"])
    .optional(),
  /**
   * ⑫ G-2 companion 토지 면적 (㎡) — 부수토지 한도 초과 split 판정용 (영 §154⑦).
   * 신축주택 케이스에서 한도 내/초과분을 분리하기 위해 전달.
   * 미입력 시 split 판정 불가 → 전량 부수토지로 취급.
   */
  areaM2: z.number().positive().optional(),
  /**
   * ⑫ 사례 28 — companion 자산이 신축주택일 때 정착면적(㎡).
   * 사용자가 주택을 companion(자산 2)으로 입력한 경우 부수토지 자동 분기를 위해 필수.
   * primary가 land이고 companion 중 housing이 있으면 housingCtxFromCompanion 빌드 시 사용.
   */
  buildingFootprintArea: z.number().positive().optional(),
  /** @deprecated 사례 28 — companion 자산이 신축주택일 때 도시지역 여부 (영 §154⑦) */
  isUrbanArea: z.boolean().optional(),
  /** 사례 28 — companion 자산이 신축주택일 때 부수토지 한도 zone (영 §154⑦ 3/5/10배 분기) */
  appurtenantLandZone: z
    .enum(["metropolitan_residential", "non_metropolitan_or_green", "non_urban"])
    .optional(),
  /** 사례 28 — companion 신축주택 4시점 (가장 빠른 날 → acquisitionDate 자동 도출) */
  occupancyApprovalDate: z.string().date().optional(),
  approvalCertificateDate: z.string().date().optional(),
  temporaryApprovalDate: z.string().date().optional(),
  actualUseDate: z.string().date().optional(),
  /**
   * ⑫ 배우자등 이월과세 §97의2 — `acquisitionCause === "carryover_gift"` 시 필수
   * (필수 판정은 `transfer-tax-schema.ts`의 컴패니언 superRefine `carryover_gift` arm).
   *
   * 🔴 이 필드가 없던 동안 ④(`buildAssetPayload` → `buildCarryoverPayload`)가 싣던 값이
   *    Zod에서 **조용히 strip**됐다 — 400이 아니라 200 + 컴패니언 취득가액 **0**이었다(D-1).
   *
   * shape은 GB 파트용 `carryoverTaxationEngineShape`를 **재사용**한다. 단건
   * (`transfer-tax-schema.ts`) 인라인 shape과 필드·타입 11개가 전부 일치한다(V-5 기계 대조).
   * ⚠️ `giftTaxAmount`의 **의미**만 소비자마다 다르다 — GB 파트는 「이미 안분된 값」,
   *    컴패니언·단건은 사용자가 영 §163의2②로 산정해 넣은 **자산 전체분**이다.
   */
  carryoverTaxation: carryoverTaxationEngineShape.optional(),
  /**
   * ⑫ §163⑨ 상속·증여 취득가액 — ②(§164④~⑦)·③(의제 전 환산) 운반 (CP-3, 2026-09-30).
   *
   * 🔴 종전에는 없었다 — ⑤·⑧은 컴패니언에서도 ②만 입력하거나 「가목 확인 불가」 선언으로 ③에 가는 것을
   *    허용하는데, 운반 칸이 없어 **컴패니언 취득가액 0**이었다. 주 자산과 **같은 shape**을 spread한다.
   */
  ...sec163_9AcquisitionShape,
});
