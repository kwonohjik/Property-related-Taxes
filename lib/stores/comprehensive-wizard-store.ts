/**
 * 종합부동산세 계산기 StepWizard 전역 상태 (T-13)
 * zustand + sessionStorage persist — 새로고침 시 입력 데이터 유지
 * result는 partialize 제외 (민감정보 + Date 직렬화 오류 방지)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";

// ============================================================
// 개별 주택 폼 항목 (문자열 기반)
// ============================================================

export interface PropertyEntry {
  id: string;                      // 임시 식별자 (uuid 대신 타임스탬프)
  assessedValue: string;           // 공시가격 (원, 문자열 — CurrencyInput 호환)
  area: string;                    // 전용면적 (㎡)
  landArea: string;                // 토지 과세면적 (㎡) — 서식 표시 전용, 엔진 미전송
  location: "metro" | "non_metro"; // 수도권 여부
  exclusionType: string;           // 합산배제 유형
  // ── §8④ 1세대1주택자 의제 특례 (per-property) ──
  section8para4Type: string;       // none | appurtenant_land_only | temporary_two_house | inherited_house | regional_low_price
  newHouseAcquisitionDate: string; // §8④2호 신규주택 취득일 YYYY-MM-DD (검증용)
  inheritanceOpenDate: string;     // §8④3호 상속개시일 YYYY-MM-DD (검증용)
  inheritanceShareRatio: string;   // §8④3호 상속 지분율 % (검증용)
  // ── 소재지 (공시가격 조회용) ──
  jibun: string;                   // 지번 주소
  road: string;                    // 도로명 주소
  building: string;                // 건물명
  dong: string;                    // 동 (공동주택)
  ho: string;                      // 호수 (공동주택)
  // ── 임대주택 합산배제 상세 ──
  rentalRegistrationType: string;
  rentalRegistrationDate: string;  // YYYY-MM-DD
  rentalStartDate: string;         // YYYY-MM-DD
  currentRent: string;             // 현재 임대료 (원)
  previousRent: string;            // 직전 임대료 (원)
  isInitialContract: boolean;
  actualRentalYears: string;       // 실제 임대 경과 연수 (시행령 §3⑦ 합산, 선택)
  registrationRevokedDate: string; // 임대등록 말소일 YYYY-MM-DD (선택, 입력 시 과세기준일 이전이면 배제 거부)
  // ── 기타 합산배제 상세 ──
  recruitmentNoticeDate: string;   // 미분양: 입주자모집공고일
  acquisitionDate: string;         // 미분양: 취득일
  isFirstSale: boolean;
  hasDaycarePermit: boolean;
  isActuallyUsedAsDaycare: boolean;
  isProvidedToEmployee: boolean;
  rentalFeeRate: string;           // 사원용: 임대료율 (%)
  // ── 지자체 조례 재산세 감면 (T-08 ⑤ UI 시니어 담당, 여기는 타입만) ──
  reductionRate: string;           // 감면율 % (예: "25" → 25% → 0.25). 빈 문자열 = 감면 없음
  // ── 공유지분율 (⑤ UI 시니어 담당, 여기는 타입만) ──
  ownershipRatio: string;          // 지분율 % (예: "70" → 70% → 0.7). 디폴트 "100"(단독)
  // ── 건물·부속토지 소유자 분리 시가표준액 안분 (사례6, ⑤ UI 시니어 담당) ──
  appurtenantSplitEnabled: boolean; // 분리 토글
  appurtenantOwnedPart: string;     // "land" | "building" (디폴트 "land")
  landStdValue: string;             // 당해 토지 시가표준액 (원)
  buildingStdValue: string;         // 당해 건물 시가표준액 (원)
  priorLandStdValue: string;        // 직전 토지 시가표준액 (세부담상한 자동모드용)
  priorBuildingStdValue: string;    // 직전 건물 시가표준액
}

// ============================================================
// 종합합산 토지 폼 항목
// ============================================================

export interface AggregateLandForm {
  totalOfficialValue: string;   // 공시지가 합산 (원)
  propertyTaxBase: string;      // 재산세 과세표준 (원)
  propertyTaxAmount: string;    // 재산세 부과세액 (원)
  previousYearTotalTax: string; // 전년도 세액 (원, 선택)
}

// ============================================================
// 별도합산 토지 폼 항목
// ============================================================

export interface SeparateLandEntry {
  id: string;
  publicPrice: string;       // 개별공시지가 × 면적 (원)
  propertyTaxBase: string;   // 재산세 과세표준 (원)
  propertyTaxAmount: string; // 재산세 부과세액 (원)
}

// ============================================================
// 토지 필지 폼 (납부할세액 카드 — 종합합산·별도합산 공용, 문자열 UI 필드)
// ============================================================

export interface LandParcelForm {
  id: string;
  jurisdiction: string;            // 시군구 (재산세 관내 합산 그룹)
  name: string;                    // 필지명 (선택)
  jibun: string;                   // 지번 주소 (공시지가 조회용, 선택)
  area: string;                    // 총면적 (㎡, decimal)
  shareRatio: string;              // 지분율 (%, decimal — 기본 "100")
  officialPricePerSqm: string;     // 당해 개별공시지가 (원/㎡)
  priorOfficialPricePerSqm: string; // 직전연도 개별공시지가 (원/㎡, 자동 세부담상한용)
}

/** 토지 입력 방식 — summary(집계 직접입력, 기본) | parcels(필지별 자동계산) */
export type LandInputMode = "summary" | "parcels";
/** 직전연도(세부담상한) 서브모드 — none(생략) | auto(직전 공시지가) | direct(총액 직접입력) */
export type LandPriorMode = "none" | "auto" | "direct";

// ============================================================
// 전체 폼 상태
// ============================================================

export interface ComprehensiveFormData {
  // ── Step 1: 기본 정보 ──
  assessmentYear: string;          // 과세연도 (숫자 입력용 문자열)
  /** 납세의무자 유형 (①)
   *  - individual: 개인 (기본)
   *  - corporate_special: §9②3호 — 단일세율·기본공제 0·상한 배제
   *  - corporate_general: §9②1호 — 일반 누진(주택 수 무관)
   *  - corporate_public:  §9②2호 — §9①각호(주택 수 분기) */
  taxpayerType: "individual" | "corporate_special" | "corporate_general" | "corporate_public";
  isOneHouseOwner: boolean;
  /** 부부 공동명의 1주택자 특례 (§10의2) — 개인에만 적용, 법인 시 엔진 무시 */
  isJointOwnershipSpecialCase: boolean;
  birthDate: string;               // 생년월일 YYYY-MM-DD (고령자·신청인 공제용)
  acquisitionDate: string;         // 최초 취득일 YYYY-MM-DD (장기보유·신청인 공제용)

  // ── Step 2: 주택 목록 ──
  properties: PropertyEntry[];

  // ── Step 4: 토지 정보 ──
  hasAggregateLand: boolean;       // 종합합산 토지 보유 여부
  landAggregate: AggregateLandForm;
  hasSeparateLand: boolean;        // 별도합산 토지 보유 여부
  landSeparate: SeparateLandEntry[];
  // 필지 모드 (납부할세액 카드 — 집계 입력과 상호배타)
  landAggregateMode: LandInputMode;      // 기본 "summary"
  landSeparateMode: LandInputMode;       // 기본 "summary"
  landAggregateParcels: LandParcelForm[];
  landSeparateParcels: LandParcelForm[];
  landAggregatePriorMode: LandPriorMode; // 기본 "none"
  landSeparatePriorMode: LandPriorMode;
  landSeparatePreviousYearTotalTax: string; // 별도합산 직전연도 총세액 직접입력 (direct 서브모드)

  // ── Step 5: 세부담 상한 ──
  previousYearTotalTax: string;    // 전년도 종부세+재산세 합계 (원) — 직접입력 모드
  /** 세부담 상한 계산 방식 (3중 패턴) */
  previousYearCapMode: "direct" | "auto"; // "direct"(기본) = 전년도 총세액 직접 입력, "auto" = 공시가격으로 자동 계산
  previousYearAutoAssessedValue: string;  // 자동 모드: 직전연도 공시가격 합산 (원) — 당해 1주택 시
  previousYearAutoIsOneHouse: boolean;    // 자동 모드: 직전연도 1세대1주택 여부
  previousYearAutoHouseValues: string[];  // 자동 모드: 직전연도 주택별 공시가격 (원) — 당해 2주택+ 시 (재산세 주택별 합산)
  previousYearAutoIsMultiAdjusted: boolean; // 자동 모드: 직전연도 조정대상지역 2주택 (중과세율 분기) — 당해 isMultiHouseInAdjustedArea와 별개

  // ── 연도별 세법 (과세연도 < 2023 일 때만 유효) ──
  /** 조정대상지역 2주택 이상 여부 (구 §9①3호·§10② — 2022 귀속 이하에서만 의미 있음)
   *  2023+ 연도에서는 엔진이 무시 (주택 수 3 이상만 중과)
   */
  isMultiHouseInAdjustedArea: boolean;
}

function makeProperty(): PropertyEntry {
  return {
    id: String(Date.now()) + String(Math.random()).slice(2, 6),
    assessedValue: "",
    area: "",
    landArea: "",
    location: "metro",
    exclusionType: "none",
    section8para4Type: "none",
    newHouseAcquisitionDate: "",
    inheritanceOpenDate: "",
    inheritanceShareRatio: "",
    jibun: "",
    road: "",
    building: "",
    dong: "",
    ho: "",
    rentalRegistrationType: "private_purchase_long",
    rentalRegistrationDate: "",
    rentalStartDate: "",
    currentRent: "",
    previousRent: "",
    isInitialContract: true,
    actualRentalYears: "",
    registrationRevokedDate: "",
    recruitmentNoticeDate: "",
    acquisitionDate: "",
    isFirstSale: true,
    hasDaycarePermit: false,
    isActuallyUsedAsDaycare: false,
    isProvidedToEmployee: false,
    rentalFeeRate: "",
    reductionRate: "",  // 지자체 조례 재산세 감면율 % (빈 문자열 = 감면 없음)
    ownershipRatio: "100",  // 공유지분율 % (디폴트 100 = 단독 소유)
    // 사례6: 건물·부속토지 소유자 분리 (디폴트 OFF)
    appurtenantSplitEnabled: false,
    appurtenantOwnedPart: "land",
    landStdValue: "",
    buildingStdValue: "",
    priorLandStdValue: "",
    priorBuildingStdValue: "",
  };
}

const DEFAULT_LAND_AGGREGATE: AggregateLandForm = {
  totalOfficialValue: "",
  propertyTaxBase: "",
  propertyTaxAmount: "",
  previousYearTotalTax: "",
};

const defaultFormData: ComprehensiveFormData = {
  assessmentYear: String(new Date().getFullYear()),
  taxpayerType: "individual",              // ② initial value
  isOneHouseOwner: false,
  isJointOwnershipSpecialCase: false,      // ② initial value
  birthDate: "",
  acquisitionDate: "",
  properties: [makeProperty()],
  hasAggregateLand: false,
  landAggregate: { ...DEFAULT_LAND_AGGREGATE },
  hasSeparateLand: false,
  landSeparate: [],
  landAggregateMode: "summary",
  landSeparateMode: "summary",
  landAggregateParcels: [],
  landSeparateParcels: [],
  landAggregatePriorMode: "none",
  landSeparatePriorMode: "none",
  landSeparatePreviousYearTotalTax: "",
  previousYearTotalTax: "",
  previousYearCapMode: "direct",
  previousYearAutoAssessedValue: "",
  previousYearAutoIsOneHouse: false,
  previousYearAutoHouseValues: [],
  previousYearAutoIsMultiAdjusted: false,
  isMultiHouseInAdjustedArea: false,
};

// ============================================================
// 스토어 인터페이스
// ============================================================

interface ComprehensiveWizardState {
  currentStep: number;
  formData: ComprehensiveFormData;
  result: ComprehensiveTaxResult | null;

  // ── 네비게이션 ──
  setStep: (step: number) => void;

  // ── 폼 전체 업데이트 ──
  updateFormData: (data: Partial<ComprehensiveFormData>) => void;

  // ── 주택 목록 액션 ──
  addProperty: () => void;
  removeProperty: (id: string) => void;
  updateProperty: (id: string, data: Partial<PropertyEntry>) => void;

  // ── 별도합산 토지 목록 액션 ──
  addSeparateLand: () => void;
  removeSeparateLand: (id: string) => void;
  updateSeparateLand: (id: string, data: Partial<SeparateLandEntry>) => void;

  // ── 토지 필지 액션 (kind: aggregate | separate) ──
  addLandParcel: (kind: "aggregate" | "separate") => void;
  removeLandParcel: (kind: "aggregate" | "separate", id: string) => void;
  updateLandParcel: (kind: "aggregate" | "separate", id: string, data: Partial<LandParcelForm>) => void;

  // ── 결과 ──
  setResult: (result: ComprehensiveTaxResult | null) => void;

  // ── 초기화 ──
  reset: () => void;
}

// ============================================================
// 스토어 생성
// ============================================================

export const useComprehensiveWizardStore = create<ComprehensiveWizardState>()(
  persist(
    (set) => ({
      currentStep: 0,
      formData: defaultFormData,
      result: null,

      setStep: (step) => set({ currentStep: step }),

      updateFormData: (data) =>
        set((state) => ({ formData: { ...state.formData, ...data } })),

      addProperty: () =>
        set((state) => ({
          formData: {
            ...state.formData,
            properties: [...state.formData.properties, makeProperty()],
          },
        })),

      removeProperty: (id) =>
        set((state) => ({
          formData: {
            ...state.formData,
            properties: state.formData.properties.filter((p) => p.id !== id),
          },
        })),

      updateProperty: (id, data) =>
        set((state) => ({
          formData: {
            ...state.formData,
            properties: state.formData.properties.map((p) =>
              p.id === id ? { ...p, ...data } : p,
            ),
          },
        })),

      addSeparateLand: () =>
        set((state) => ({
          formData: {
            ...state.formData,
            landSeparate: [
              ...state.formData.landSeparate,
              {
                id: String(Date.now()) + String(Math.random()).slice(2, 5),
                publicPrice: "",
                propertyTaxBase: "",
                propertyTaxAmount: "",
              },
            ],
          },
        })),

      removeSeparateLand: (id) =>
        set((state) => ({
          formData: {
            ...state.formData,
            landSeparate: state.formData.landSeparate.filter((l) => l.id !== id),
          },
        })),

      updateSeparateLand: (id, data) =>
        set((state) => ({
          formData: {
            ...state.formData,
            landSeparate: state.formData.landSeparate.map((l) =>
              l.id === id ? { ...l, ...data } : l,
            ),
          },
        })),

      addLandParcel: (kind) =>
        set((state) => {
          const key = kind === "aggregate" ? "landAggregateParcels" : "landSeparateParcels";
          const newParcel: LandParcelForm = {
            id: String(Date.now()) + String(Math.random()).slice(2, 5),
            jurisdiction: "",
            name: "",
            jibun: "",
            area: "",
            shareRatio: "100",
            officialPricePerSqm: "",
            priorOfficialPricePerSqm: "",
          };
          return {
            formData: { ...state.formData, [key]: [...state.formData[key], newParcel] },
          };
        }),

      removeLandParcel: (kind, id) =>
        set((state) => {
          const key = kind === "aggregate" ? "landAggregateParcels" : "landSeparateParcels";
          return {
            formData: {
              ...state.formData,
              [key]: state.formData[key].filter((p) => p.id !== id),
            },
          };
        }),

      updateLandParcel: (kind, id, data) =>
        set((state) => {
          const key = kind === "aggregate" ? "landAggregateParcels" : "landSeparateParcels";
          return {
            formData: {
              ...state.formData,
              [key]: state.formData[key].map((p) => (p.id === id ? { ...p, ...data } : p)),
            },
          };
        }),

      setResult: (result) => set({ result }),

      reset: () => {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("comprehensive-tax-wizard");
        }
        set({ currentStep: 0, formData: defaultFormData, result: null });
      },
    }),
    {
      name: "comprehensive-tax-wizard",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return sessionStorage;
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      // result는 sessionStorage 제외 — 민감정보 보호 + Date 직렬화 오류 방지
      partialize: (state) => ({
        currentStep: state.currentStep,
        formData: state.formData,
      }),
      // ③ normalize fallback — 구 sessionStorage에 없는 신규 필드 보정
      onRehydrateStorage: () => (state) => {
        if (state && state.formData) {
          state.formData.isMultiHouseInAdjustedArea =
            state.formData.isMultiHouseInAdjustedArea ?? false;
          // taxpayerType: 구 세션 복원 시 undefined → "individual" 폴백 (3중 일치)
          state.formData.taxpayerType =
            state.formData.taxpayerType ?? "individual";
          // isJointOwnershipSpecialCase: 구 세션 복원 시 undefined → false 폴백 (3중 일치)
          state.formData.isJointOwnershipSpecialCase =
            state.formData.isJointOwnershipSpecialCase ?? false;
          // §8④ per-property 신규 필드: 구 세션 복원 시 undefined → 기본값 (3중 일치)
          if (Array.isArray(state.formData.properties)) {
            state.formData.properties = state.formData.properties.map((p) => ({
              ...p,
              section8para4Type: p.section8para4Type ?? "none",
              newHouseAcquisitionDate: p.newHouseAcquisitionDate ?? "",
              inheritanceOpenDate: p.inheritanceOpenDate ?? "",
              inheritanceShareRatio: p.inheritanceShareRatio ?? "",
              // 서식 표시 전용 — 구 세션 누락 시 빈문자열
              landArea: p.landArea ?? "",
              // ③ normalize: 지자체 조례 재산세 감면율 — 구 세션 누락 시 빈문자열 (감면 없음)
              reductionRate: p.reductionRate ?? "",
              ownershipRatio: p.ownershipRatio ?? "100",
              // ③ normalize: 사례6 건물·부속토지 분리 — 구 세션 누락 시 기본값
              appurtenantSplitEnabled: p.appurtenantSplitEnabled ?? false,
              appurtenantOwnedPart: p.appurtenantOwnedPart ?? "land",
              landStdValue: p.landStdValue ?? "",
              buildingStdValue: p.buildingStdValue ?? "",
              priorLandStdValue: p.priorLandStdValue ?? "",
              priorBuildingStdValue: p.priorBuildingStdValue ?? "",
            }));
          }
          // 세부담상한 모드 — 구 세션 누락 시 "direct" (기존 동작 보존)
          state.formData.previousYearCapMode =
            state.formData.previousYearCapMode ?? "direct";
          state.formData.previousYearAutoAssessedValue =
            state.formData.previousYearAutoAssessedValue ?? "";
          state.formData.previousYearAutoIsOneHouse =
            state.formData.previousYearAutoIsOneHouse ?? false;
          state.formData.previousYearAutoHouseValues =
            state.formData.previousYearAutoHouseValues ?? [];
          state.formData.previousYearAutoIsMultiAdjusted =
            state.formData.previousYearAutoIsMultiAdjusted ?? false;
          // 토지 필지 모드 — 구 세션 누락 시 집계 모드 보존 (기존 동작)
          state.formData.landAggregateMode = state.formData.landAggregateMode ?? "summary";
          state.formData.landSeparateMode = state.formData.landSeparateMode ?? "summary";
          state.formData.landAggregateParcels = state.formData.landAggregateParcels ?? [];
          state.formData.landSeparateParcels = state.formData.landSeparateParcels ?? [];
          state.formData.landAggregatePriorMode = state.formData.landAggregatePriorMode ?? "none";
          state.formData.landSeparatePriorMode = state.formData.landSeparatePriorMode ?? "none";
          state.formData.landSeparatePreviousYearTotalTax =
            state.formData.landSeparatePreviousYearTotalTax ?? "";
        }
      },
    },
  ),
);

export { makeProperty };
