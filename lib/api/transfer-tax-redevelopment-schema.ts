/**
 * 재개발/재건축 입력 Zod 스키마 (시행령 §166 본문) — transfer-tax-schema.ts 800줄 정책 분리.
 * propertyType === "redevelopment_apt" 또는 "right_to_move_in" 시 제공.
 * 미정의 시 침묵 stripping 방지를 위해 명시 필수.
 */
import { z } from "zod";

export const redevelopmentSchema = z
  .object({
    subject: z.enum(["right", "apt"]),
    approvalLawBasis: z.enum(["urban_renovation_art_74", "small_housing_art_29"]),
    approvalDate: z.string().date(),
    rightsValue: z.number().int().nonnegative(),
    settlementDirection: z.enum(["pay", "receive"]),
    settlementAmount: z.number().int().nonnegative(),
    settlementSaleDate: z.string().date().optional(),
    preApprovalExpenses: z.number().int().nonnegative(),
    postApprovalExpenses: z.number().int().nonnegative().optional(),
    originalAssetType: z.enum(["land", "housing"]).optional(),
    acquisitionStdPrice: z.number().int().nonnegative().optional(),
    managementDisposalStdPrice: z.number().int().nonnegative().optional(),
    firstDisclosureDate: z.string().date().optional(),
    firstDisclosureHousingPrice: z.number().int().nonnegative().optional(),
    firstDisclosureStdPrice: z.number().int().nonnegative().optional(),
    // PHD 패턴 — Sum_A·Sum_F 산정용 (본문 발동 시 필수)
    landArea: z.number().nonnegative().optional(),
    landPricePerSqmAtAcq: z.number().int().nonnegative().optional(),
    buildingStdPriceAtAcq: z.number().int().nonnegative().optional(),
    landPricePerSqmAtFirst: z.number().int().nonnegative().optional(),
    buildingStdPriceAtFirst: z.number().int().nonnegative().optional(),
    // 단일 라목값
    managementDisposalHousingPrice: z.number().int().nonnegative().optional(),
    acquisitionHousingPrice: z.number().int().nonnegative().optional(),
    acquisitionRounding: z.enum(["floor", "round"]).optional(),
    // 사례 45 — 거주월수 분리 입력 (§154⑧1호 통산 + 사전법령해석재산 2020-386)
    priorHouseResidenceMonths: z.number().int().nonnegative().optional(),
    newHouseResidenceMonths: z.number().int().nonnegative().optional(),
    // 거주기간(입주일·퇴거일, YYYY-MM-DD) — 결과 카드/신고서 양식 표 산정 근거 표시용 pass-through
    priorResidenceStartDate: z.string().date().optional(),
    priorResidenceEndDate: z.string().date().optional(),
    newResidenceStartDate: z.string().date().optional(),
    newResidenceEndDate: z.string().date().optional(),
    // 사례 46 — 청산금 수령분 단독 신고
    receiveOnlyMode: z.boolean().optional(),
    exemptionEligibleAtApproval: z.boolean().optional(),
    // 사례 48 — 승계조합원 신축APT 양도 (관리처분 후 입주권 승계 → 신축APT 양도).
    // 사전-2019-법령해석재산-0649 + 시행령 §162①4호.
    isSuccessorMember: z.boolean().optional(),
    completionDate: z.string().date().optional(),
    // 사례 36 — 1세대1입주권 비과세 C-1 안전장치 (a) 자동 검증용.
    // 인가일 기준 종전주택 보유 월수. 24개월 미만 시 UI 경고 카드 노출 (차단 X — 자기선언 우선).
    // 엔진 계산에는 직접 미사용 (비과세 판단은 exemptionEligibleAtApproval 기준).
    // §89①4호 가목 → §89①3호 가목 보유 2년 요건 참조.
    priorHouseHoldingMonths: z.number().int().nonnegative().optional(),
    // §89①4호 나목 — 「해당 1주택을 취득한 날부터 3년 이내에 해당 조합원입주권을 양도할 것」
    // ★★★ 침묵 stripping 차단: Zod 객체 정의에 없으면 route handler에서 자동 제거된다.
    otherHouseAcquisitionDate: z.string().date().optional(),
    // 사례 37 — 토지 출자 §166③ 환산 (subject="right" + originalAssetType="land")
    // ★★★ 침묵 stripping 차단: Zod 객체 정의에 없으면 route handler에서 자동 제거됨.
    landStdPriceAtAcq: z.number().int().nonnegative().optional(),
    landStdPriceAtApproval: z.number().int().nonnegative().optional(),
    // 사례 38/39 — 단독주택 출자 §166③ 2-point 환산취득가
    // ★★★ 침묵 stripping 차단: Zod 객체 정의에 없으면 route handler에서 자동 제거됨.
    housingStdPriceAtAcq: z.number().int().nonnegative().optional(),
    housingStdPriceAtApproval: z.number().int().nonnegative().optional(),
  })
  .refine(
    // subject="apt"(완공 APT 양도, 사례 46)에서만 settlementSaleDate 필수.
    // subject="right"(입주권 양도, 사례 36 R-5)는 신축 완공 전 권리 양도 — 잔금일(saleDate)이 양도일이므로 불필요.
    (v) => v.subject !== "apt" || v.settlementDirection !== "receive" || v.settlementSaleDate != null,
    { message: "청산금 수령 + 완공 APT 양도(subject='apt') 시 settlementSaleDate(소유권이전 고시일 다음날) 필수" },
  )
  .refine(
    (v) => v.receiveOnlyMode !== true || v.settlementDirection === "receive",
    { message: "receiveOnlyMode=true 인 경우 settlementDirection은 'receive' 이어야 함 (사례 46 정합성)" },
  )
  .refine(
    (v) => v.subject !== "apt" || v.originalAssetType != null,
    { message: "subject='apt' (완공 APT 양도) 시 originalAssetType ('land' | 'housing') 필수" },
  )
  .refine(
    (v) =>
      (v.acquisitionStdPrice == null && v.managementDisposalStdPrice == null) ||
      (v.acquisitionStdPrice != null && v.managementDisposalStdPrice != null),
    { message: "환산 모드: 취득시 기준시가와 관리처분일 기준시가는 함께 입력해야 함" },
  )
  .optional();
