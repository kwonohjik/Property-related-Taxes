/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 (Phase 1 field 부착 키 전수).
 *
 * 각 케이스 = 「이 입력이면 검증이 그 키의 오류를 내고, 화면이 그 칸을 렌더한다」.
 * 입력이 정말 그 오류를 내는지는 vitest가 먼저 고정한다
 * (`__tests__/lib/calc/transfer-validation-field-jump-cases.test.ts`) — 검증이 바뀌면
 * E2E가 엉뚱한 줄에서 터지기 전에 거기서 이름으로 실패한다.
 *
 * ⚠️ 앱 기본 폼(`createDefaultTransferFormData`)에서 출발한다 — 최소 필드만 손으로 적으면
 *    신규 배열 필드 누락으로 화면이 죽는다.
 */
import { createDefaultTransferFormData } from "../../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

/** 0~2단계를 통과하는 단건 주택 — 3단계(수정신고) 케이스의 바탕 */
const baseAsset = () => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 1-1",
  acquisitionDate: "2015-03-01",
  fixedAcquisitionPrice: "300000000",
  useEstimatedAcquisition: false,
  isAppraisalAcquisition: false,
  actualSalePrice: "500000000",
});

export const validBase = () => ({
  ...createDefaultTransferFormData(),
  assets: [baseAsset()],
  transferDate: "2024-03-01",
  filingDate: "2024-05-31",
  contractTotalPrice: "500000000",
  householdHousingCount: "1",
  isOneHousehold: false,
});

/** 함께 양도 2건 — 둘째 자산을 바꿔 쓴다 */
export const bundle = (second: Record<string, unknown>, formPatch: Record<string, unknown> = {}) => ({
  ...validBase(),
  assets: [baseAsset(), { ...baseAsset(), ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 2-2", acquisitionDate: "2015-03-01", fixedAcquisitionPrice: "100000000", useEstimatedAcquisition: false, isAppraisalAcquisition: false, standardPriceAtTransfer: "100000000", ...second }],
  ...formPatch,
});

export const withPrimary = (patch: Record<string, unknown>, formPatch: Record<string, unknown> = {}) => ({
  ...validBase(),
  assets: [{ ...baseAsset(), ...patch }],
  ...formPatch,
});

/** 중과 한시 유예 칸이 열리는 조건 — 1세대·2채·보유 주택 1행·보유 2년 미만(한시배제 창 밖) */
const graceBase = (gracePeriod: Record<string, unknown>) =>
  withPrimary(
    { acquisitionDate: "2023-06-01" },
    {
      isOneHousehold: true,
      householdHousingCount: "2",
      houses: [
        {
          id: "house_e2e_1",
          region: "capital",
          acquisitionDate: "2020-01-01",
          officialPrice: "300000000",
          isInherited: false,
          isLongTermRental: false,
          isApartment: false,
          isOfficetel: false,
          isUnsoldHousing: false,
          acquisitionPrice: "",
          exclusiveArea: "",
          isUnsoldNewHouse: false,
          completionDate: "",
          isSpouseOwned: false,
          isCoInherited: false,
          decedentSameHouseholdAtInheritance: false,
          isRankingDisqualifiedInheritedHouse: false,
        },
      ],
      gracePeriod: {
        contractDate: "",
        isLandPermitTarget: false,
        permitApplicationDate: undefined,
        permitGranted: false,
        depositReceiptConfirmed: false,
        ...gracePeriod,
      },
    },
  );

export interface FieldJumpCase {
  field: string;
  /** 테스트 이름 — 같은 키를 여러 분기에서 볼 때 구분한다(없으면 field) */
  name?: string;
  /** 검증 단계 0~3 */
  step: 0 | 1 | 3;
  /** 오류 목록에서 누를 항목 (메시지 앞부분) */
  message: RegExp;
  /** 자산 수준이면 그 카드 */
  assetIndex?: number;
  form: () => Record<string, unknown>;
  /**
   * 화면에서 이 오류를 낼 수 없으면 그 사유 — E2E는 건너뛰고 vitest(검증이 field를 붙이는가)만 본다.
   * 「앵커가 있다」가 아니라 「사용자가 그 상태에 도달할 수 없다」일 때만 쓴다.
   */
  unreachableInUi?: string;
  /**
   * 시드 뒤 「다음」 전에 화면에서 할 조작 — 세션 복원 마이그레이션이 지우는 값을 **사용자처럼** 다시 만든다
   * (예: 승계 입주권의 감정가액·매매사례 모드 — `calc-wizard-asset-migrate.ts`가 복원 때 끈다).
   */
  prepare?: (page: import("@playwright/test").Page) => Promise<void>;
}

export const FIELD_JUMP_CASES: FieldJumpCase[] = [
  { field: "filingDate", step: 0, assetIndex: 0, message: /^신고\(예정\)일/, form: () => ({ ...validBase(), filingDate: "2024-01-01" }) },
  {
    field: "assetKind", step: 0, assetIndex: 0, message: /^자산: 자산 유형을 선택하세요/, form: () => withPrimary({ assetKind: "" }),
    unreachableInUi:
      "세션 복원이 빈·미지의 자산 종류를 \"building\"으로 채우고(`calc-wizard-asset-migrate.ts:290`) 화면은 항상 한 종류가 선택돼 있다 — E2E 실측(2026-09-30): 오류 항목 자체가 뜨지 않음",
  },
  { field: "acquisitionDate", step: 0, assetIndex: 0, message: /^자산: 양도일\(2024-03-01\)이 취득일/, form: () => withPrimary({ acquisitionDate: "2025-01-01" }) },
  {
    field: "landAcquisitionDate", step: 0, assetIndex: 0, message: /^자산: 양도일\(2024-03-01\)이 토지 취득일/,
    form: () => withPrimary({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2025-01-01" }),
  },
  { field: "landNature", step: 0, assetIndex: 1, message: /^자산 2: 토지 성격/, form: () => bundle({ assetKind: "land", landNature: undefined }) },
  { field: "ownershipNumerator", step: 0, assetIndex: 0, message: /^자산: 지분율은 0보다 커야 합니다/, form: () => withPrimary({ ownershipNumerator: "0" }) },
  {
    field: "actualSalePrice", step: 0, assetIndex: 1, message: /^자산 2: 계약서상 양도가액을 입력하세요/,
    form: () => bundle({ actualSalePrice: "" }, { bundledSaleMode: "actual", contractTotalPrice: "500000000" }),
  },
  {
    field: "standardPriceAtTransfer", step: 0, assetIndex: 1, message: /^자산 2: 양도시 기준시가를 입력하세요/,
    form: () => bundle({ standardPriceAtTransfer: "" }, { bundledSaleMode: "apportioned" }),
  },
  {
    field: "presaleRights.0.acquisitionDate", step: 1, message: /^분양권·입주권 1: 취득일을 입력하세요/,
    form: () => ({ ...validBase(), presaleRights: [{ id: "presale_e2e", type: "presale_right", acquisitionDate: "", region: "capital" }] }),
  },
  { field: "gracePeriod.contractDate", step: 1, message: /^중과 한시 유예: 매매계약 체결일/, form: () => graceBase({}) },
  {
    field: "gracePeriod.permitApplicationDate", step: 1, message: /^중과 한시 유예\(나목\)/,
    form: () => graceBase({ contractDate: "2023-01-01", isLandPermitTarget: true }),
  },
  { field: "originalDeterminedTax", step: 3, message: /^당초 결정세액을 입력하세요/, form: () => ({ ...validBase(), amendmentMode: true, originalDeterminedTax: "" }) },
  {
    field: "posteriorEventDate", step: 3, message: /^후발적 사유를 안 날/,
    form: () => ({ ...validBase(), amendmentMode: true, originalDeterminedTax: "1000000", correctionKind: "refund_claim", claimReasonType: "posterior", posteriorEventDate: "" }),
  },
  {
    field: "statutoryFilingDeadline", step: 3, message: /^§48② 자동감면 산정을 위해 법정신고기한/,
    form: () => ({ ...validBase(), amendmentMode: true, originalDeterminedTax: "1000000", applyUnderReportingPenalty: true, underReductionMode: "auto_48_2", statutoryFilingDeadline: "", amendedFilingDate: "2024-08-01" }),
  },
  {
    field: "amendedFilingDate", step: 3, message: /^§48② 자동감면 산정을 위해 수정신고일/,
    form: () => ({ ...validBase(), amendmentMode: true, originalDeterminedTax: "1000000", applyUnderReportingPenalty: true, underReductionMode: "auto_48_2", statutoryFilingDeadline: "2024-05-31", amendedFilingDate: "" }),
  },
  {
    field: "amendedPaymentDate", step: 3, message: /^납부지연가산세 산정을 위해 수정신고 납부/,
    form: () => ({ ...validBase(), amendmentMode: true, originalDeterminedTax: "1000000", applyLatePaymentPenalty: true, statutoryFilingDeadline: "2024-05-31", amendedPaymentDate: "" }),
  },
];

/**
 * 후퇴 대조군 — 「field 없는 오류는 자산 카드로 후퇴」를 지키는 입력.
 *
 * 「지분 모드 자산은 단독으로 계산할 수 없습니다」(`transfer-tax-validate-asset.ts`)는 칸 하나가 아니라
 * **조합 오류**(지분율 · 다른 지분 자산 · 「나머지 지분은 타인 소유」)라 field를 달지 않는다.
 * ⚠️ Phase 2 전의 대조군 「자산: 취득일을 입력하세요.」는 Phase 2가 field를 달아 대조군 구실을 잃었다 —
 *    이 입력을 바꿀 때도 **field가 영영 안 붙을 메시지**를 고를 것(계획서 §7-2).
 */
export const fallbackControlForm = () => withPrimary({ ownershipNumerator: "50", ownershipDenominator: "100" });
