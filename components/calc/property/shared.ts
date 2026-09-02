import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { getZoneAreaMultiplier } from "@/lib/tax-engine/local-tax-zone-multiplier";
import type { PropertyTaxResult } from "@/lib/tax-engine/types/property.types";

// ============================================================
// 소유 형태 (납세의무자 §107) — 폼 전용 enum
// ============================================================

/**
 * 소유 형태 라디오 선택 (UI 전용 — 엔진 taxpayerInfo 매핑 시 분기)
 * - "sole"        : 단독 소유 (기본, taxpayerInfo 미전송)
 * - "co"          : 공유 (coOwnershipShares 배열)
 * - "trust"       : 신탁 (isTrust=true + settlor)
 * - "inherit"     : 상속 미등기 (isInheritanceUnregistered + heirs)
 * - "clan"        : 종중재산 미신고 §107②3호 → registered_owner(공부상 소유자, isClanProperty=true)
 * - "installment" : 연부 매수계약자 §107②4호 → installment_buyer
 * - "project"     : 환지 체비지·보류지 사업시행자 §107②6호 → project_operator
 * - "import"      : 외국인 항공기·선박 수입자 §107②7호 → importer
 * - "bankruptcy"  : 파산재단 §107②8호 → registered_owner(공부상 소유자, isBankruptcyEstate=true)
 * - "unclear"     : 소유권 귀속 불명 시 사용자 §107③ → ownershipUnclearUser
 * - "house_split" : 주택 건물·부속토지 소유자 분리 §107①2호 → isHouseSplit=true (주택 전용)
 */
export type OwnershipType =
  | "sole"
  | "co"
  | "trust"
  | "inherit"
  | "clan"
  | "installment"
  | "project"
  | "import"
  | "bankruptcy"
  | "unclear"
  | "house_split";

/** 공유 지분 항목 (UI 입력용) */
export interface CoOwnerItem {
  id: string;        // 공유자 식별자 (성명·등록번호 등)
  ratio: string;     // 지분율 (소수점 문자열, "0.5" = 50%)
}

/** 상속인 항목 (UI 입력용 — §107②2호 주된 상속자 판정: 지분 최대 → 동률 시 연장자) */
export interface HeirItem {
  name: string;       // 상속인 성명
  shareRatio: string; // 민법상 상속지분 (소수점 문자열 "0.5", 선택 — 미입력 시 첫 상속인 fallback)
  birthDate: string;  // 생년월일 "YYYY-MM-DD" (동률 시 연장자 판정, 선택)
}

// ============================================================
// 상수
// ============================================================

export const OBJECT_TYPE_LABELS: [string, string][] = [
  ["housing", "주택 (아파트·단독·연립·다세대)"],
  ["building", "건축물 (비주거용)"],
  ["land", "토지"],
  ["vessel", "선박"],
  ["aircraft", "항공기"],
];

export const BUILDING_TYPE_LABELS: [string, string][] = [
  ["general", "일반 건축물 (0.25%)"],
  ["golf_course", "골프장 (4%)"],
  ["luxury", "고급오락장 (4%)"],
  ["factory", "공장 (0.5%)"],
];

export const VESSEL_TYPE_LABELS: [string, string][] = [
  ["general", "일반선박 (0.3%)"],
  ["luxury", "고급선박 (5%)"],
];

/** 화재위험 건축물 등급 — 소방분 지역자원시설세 중과 (지방세법 §146③2호·2의2호, 시행령 §138) */
export const FIRE_HAZARD_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "none", label: "일반", description: "화재위험 건축물 아님 (중과 없음)" },
  {
    value: "fire_hazard",
    label: "화재위험 건축물 (소방분 ×2)",
    description:
      "주거용 아닌 4~10층·학원·극장·유흥장·숙박·공장·창고·주유소·위험물시설 등 (시행령 §138①)",
  },
  {
    value: "large_fire_hazard",
    label: "대형 화재위험 건축물 (소방분 ×3)",
    description:
      "주거용 아닌 11층↑·대형마트·백화점·호텔·복합상영관·3만㎡↑ 복합건축물 등. 대형 요건 충족 시 선택 (시행령 §138②)",
  },
];

/**
 * 용도지역 선택지 — 「지방세법 시행령」 제101조 제2항 [표] 구분.
 *
 * 배율이 갈리므로 주거지역은 전용·일반·준주거를 반드시 나눠 받는다
 * (종전에는 "주거지역" 하나만 있어 일반주거·준주거도 전용주거의 5배로 계산됐다).
 * 값은 `lib/tax-engine/local-tax-zone-multiplier.ts` 정본 키와 일치해야 한다.
 */
export const ZONING_DISTRICT_LABELS: [string, string][] = [
  ["exclusive_residential", "전용주거지역 (5배)"],
  ["general_residential", "일반주거지역 (4배)"],
  ["semi_residential", "준주거지역 (3배)"],
  ["commercial", "상업지역 (3배)"],
  ["industrial", "공업지역 (4배)"],
  ["green", "녹지지역 (7배)"],
  ["unplanned", "미계획지역 (4배)"],
  ["management", "관리지역 (7배)"],
  ["agricultural", "농림지역 (7배)"],
  ["nature_preserve", "자연환경보전지역 (7배)"],
];

export const SEPARATED_TYPE_OPTIONS: { value: string; label: string; rate: string; hint?: string }[] = [
  { value: "farmland",     label: "자경 농지",                              rate: "0.07%" },
  { value: "livestock",    label: "축산용지",                               rate: "0.07%" },
  { value: "forest",       label: "공익용 보전산지·임업후계림",               rate: "0.07%" },
  { value: "factory",      label: "공장용지 (산업단지·지정 공업지역)",         rate: "0.2%", hint: "입지 유형 추가 선택 필요" },
  { value: "saltfield",    label: "염전",                                   rate: "0.2%" },
  { value: "terminal",     label: "여객·화물터미널 / 공영주차장",              rate: "0.2%" },
  { value: "golf_member",  label: "회원제 골프장",                           rate: "4%"   },
  { value: "entertainment",label: "고급오락장 (카지노·유흥주점 등)",           rate: "4%"   },
];
// 대중형·간이 골프장 부속토지는 분리과세 대상이 아님 (§106①3호 다목 — 회원제만 해당)
// → 별도합산과세대상으로 입력 안내 (Step2Separated 하단 카드)

// ============================================================
// 폼 상태
// ============================================================

export interface FormState {
  jibun: string;
  road: string;
  building: string;
  /** 선택한 동(예: "201동") — 공동주택 공시가격 조회 세대 식별용 (UI 전용, 엔진 미전송) */
  dong: string;
  /** 선택한 호(예: "3204") — 공동주택 공시가격 조회 세대 식별용 (UI 전용, 엔진 미전송) */
  ho: string;
  /** 소재지 PNU(19자리) — 건축물 시가표준액 ETAX 조회용 (UI 전용, 엔진·API·이력 미전송) */
  pnu: string;
  objectType: string;
  publishedPrice: string;
  /** 직전연도 공시가격 — 주택 과세표준상한제(§110③) 계산용 (주택 전용·선택) */
  priorYearPublishedPrice: string;
  /** 주택 건축물 부분 시가표준액 — 주택 건물분 소방분(§146④ 단서) 과세표준 (주택 전용·선택) */
  housingBuildingValue: string;
  isOneHousehold: boolean;
  isUrbanArea: boolean;
  buildingType: string;
  /** 선박 유형 — objectType==="vessel" 전용. "general"(일반 0.3%) | "luxury"(고급선박 5%, §111①4호 가목·§13⑤5호) */
  vesselType: "general" | "luxury";
  /** 화재위험 건축물 등급 — 소방분 중과(§146③2호·2의2호) (건축물 전용) */
  fireHazardClass: string;
  previousYearTax: string;
  /** 직전연도 과세표준 (원) — recompute 모드(§118 본문, 비주택 building·vessel·aircraft·종합합산) */
  previousYearTaxBase: string;
  /** 세부담상한 모드 — "direct"(직전 세액 직접입력) | "recompute"(직전 과세표준 재산정) */
  taxCapMode: "direct" | "recompute";
  /** 주택 세부담상한 경과조치(부칙 제15조) 적용 토글 — 노출제어 (주택 전용) */
  housingTaxCapEnabled: boolean;
  /** 직전연도 주택 재산세 본세 — 부칙 제15조 경과조치 직접입력 (주택 전용) */
  housingPreviousYearTax: string;
  /** 직전연도 주택 도시지역분 — 부칙 제15조 v2 도시지역분 세부담상한(§118 본문) 직접입력 (주택+도시지역 전용) */
  housingPreviousUrbanTax: string;
  landTaxType: "comprehensive_aggregate" | "separate_aggregate" | "separated" | "";
  saZoningDistrict: string;
  saLandArea: string;
  saBuildingFloorArea: string;
  saIsFactory: boolean;
  saFactoryStandardArea: string;
  saDemolished: boolean;
  saDemolishedDate: string;
  stSeparatedType: string;
  stFactoryLocation: string;
  // 공장용지 면적 한도 (「지방세법 시행령」 §102①1호 · 시행규칙 §50 [별표6])
  // 목장용지 면적 한도 (「지방세법 시행령」 §102①3호 [표])
  stPastureTotalLandArea: string;
  stPastureLivestockType: string;
  stPastureLivestockCount: string;
  stPastureHasFacility: boolean;
  stPastureHasGrassland: boolean;
  stPastureHasFodder: boolean;
  stPastureIsUrbanArea: boolean;
  stPastureOwnedBefore1990: boolean;
  stFactoryTotalLandArea: string;
  stFactoryFloorArea: string;
  stFactoryAreaRatePercent: string;
  stFactoryIsRestrictedZone: boolean;
  stFactoryAdditionalRecognizedArea: string;
  /** 별표6 3호바 비고 2-가 — 그 사업장에 근무하는 종업원 수 */
  stFactorySportsEmployeeCount: string;
  /** 별표6 3호바 비고 2-나 — 「50명 이하인 **법인**」만 코트면적만 인정 */
  stFactorySportsEntityType: string;
  /** 실외체육시설 — 운동장 용지 면적 (㎡) */
  stFactorySportsPlaygroundArea: string;
  /** 실외체육시설 — 테니스·정구코트 용지 면적 (㎡) */
  stFactorySportsCourtArea: string;
  /** 실내체육시설 **건축물 바닥면적** (㎡) — 비고 2-다·라 */
  stFactorySportsIndoorFloorArea: string;
  /** 비고 2-라 — 실내체육시설 부속토지에 곱할 「지방세법 시행령」 §101② 용도지역 */
  stFactorySportsZoningDistrict: string;
  stFactoryIsUnpermitted: boolean;

  // ── 납세의무자(§107) 입력 — 선택 섹션 ──
  /**
   * 소유 형태 라디오.
   * "sole"=단독(기본, taxpayerInfo 미전송), "co"=공유, "trust"=신탁, "inherit"=상속미등기.
   * undefined = 섹션 접힘(미입력, taxpayerInfo 미전송).
   */
  ownershipType: OwnershipType | undefined;
  /** 공부상 소유자 성명/식별자 (registeredOwner) */
  registeredOwner: string;
  /** 사실상 소유자 — 공부와 불일치 시 입력 (actualOwner) */
  actualOwner: string;
  /** 위탁자 성명/식별자 (신탁재산, §107②5호) */
  settlor: string;
  /** 공유자 목록 (3-state: undefined=OFF / []=ON빈 / [...]=데이터) */
  coOwners: CoOwnerItem[] | undefined;
  /** 상속인 목록 (§107②2호 주된 상속자 판정 — 성명·지분·생년 행 기반) */
  heirs: HeirItem[];
  /** 연부 매수계약자 성명/식별자 (§107②4호) */
  installmentBuyer: string;
  /** 환지 체비지·보류지 사업시행자 성명/식별자 (§107②6호) */
  projectOperator: string;
  /** 외국인 항공기·선박 수입자 성명/식별자 (§107②7호) */
  importer: string;
  /** 소유권 귀속 불명 시 사용자 성명/식별자 (§107③) */
  unclearUser: string;

  // ── §107①2호: 주택 건물·부속토지 소유자 분리 (house_split 모드 전용) ──
  /** 건물 소유자 성명/식별자 (§107①2호, house_split 모드) */
  buildingOwner: string;
  /** 부속토지 소유자 성명/식별자 (§107①2호, house_split 모드) */
  landOwner: string;
  /** 부속토지 시가표준액 문자열 (원, §4① 개별공시지가 × 면적 — house_split 모드) */
  landStdValue: string;
  // ※ 건축물 시가표준액은 기존 housingBuildingValue 필드 재사용 (단일 필드 양방향 read/write)
}

export const INITIAL_FORM: FormState = {
  jibun: "",
  road: "",
  building: "",
  dong: "",
  ho: "",
  pnu: "",
  objectType: "housing",
  publishedPrice: "",
  priorYearPublishedPrice: "",
  housingBuildingValue: "",
  isOneHousehold: false,
  isUrbanArea: false,
  buildingType: "general",
  vesselType: "general",
  fireHazardClass: "none",
  previousYearTax: "",
  previousYearTaxBase: "",
  taxCapMode: "direct",
  housingTaxCapEnabled: false,
  housingPreviousYearTax: "",
  housingPreviousUrbanTax: "",
  landTaxType: "",
  saZoningDistrict: "",
  saLandArea: "",
  saBuildingFloorArea: "",
  saIsFactory: false,
  saFactoryStandardArea: "",
  saDemolished: false,
  saDemolishedDate: "",
  stSeparatedType: "",
  stFactoryLocation: "",
  stPastureTotalLandArea: "",
  stPastureLivestockType: "",
  stPastureLivestockCount: "",
  stPastureHasFacility: false,
  stPastureHasGrassland: false,
  stPastureHasFodder: false,
  stPastureIsUrbanArea: false,
  stPastureOwnedBefore1990: false,
  stFactoryTotalLandArea: "",
  stFactoryFloorArea: "",
  stFactoryAreaRatePercent: "",
  stFactoryIsRestrictedZone: false,
  stFactoryAdditionalRecognizedArea: "",
  stFactorySportsEmployeeCount: "",
  stFactorySportsEntityType: "",
  stFactorySportsPlaygroundArea: "",
  stFactorySportsCourtArea: "",
  stFactorySportsIndoorFloorArea: "",
  stFactorySportsZoningDistrict: "",
  stFactoryIsUnpermitted: false,
  // 납세의무자(§107) 초기값 — 섹션 접힘(미입력)
  ownershipType: undefined,
  registeredOwner: "",
  actualOwner: "",
  settlor: "",
  coOwners: undefined,
  heirs: [],
  installmentBuyer: "",
  projectOperator: "",
  importer: "",
  unclearUser: "",
  // §107①2호 house_split 초기값
  buildingOwner: "",
  landOwner: "",
  landStdValue: "",
};

// ============================================================
// 유효성 검사
// ============================================================

export function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.objectType) return "물건 유형을 선택하세요.";
    if (!form.publishedPrice || parseAmount(form.publishedPrice) === null)
      return "공시가격을 입력하세요.";
    // 직전연도 공시가격: 선택 입력 — 입력 시 형식만 검증, 미입력은 통과(상한 미적용)
    if (
      form.objectType === "housing" &&
      form.priorYearPublishedPrice &&
      parseAmount(form.priorYearPublishedPrice) === null
    )
      return "직전연도 공시가격을 올바른 금액으로 입력하세요.";
    // 주택 건축물 부분 시가표준액: 선택 입력 — 입력 시 형식만 검증, 미입력 통과(소방분 미산출)
    if (
      form.objectType === "housing" &&
      form.housingBuildingValue &&
      parseAmount(form.housingBuildingValue) === null
    )
      return "주택 건축물 부분 시가표준액을 올바른 금액으로 입력하세요.";

    // ── 소유 형태(§107) 일관성 검증 — ownershipType 입력 시에만 (미입력=납세의무자 판정 생략, 차단 아님) ──
    if (form.ownershipType && form.ownershipType !== "sole") {
      // 공부상 소유자는 필수 (house_split 제외 — 건물주·토지주가 대체)
      if (form.ownershipType !== "house_split" && !form.registeredOwner.trim())
        return "소유 형태를 입력할 때는 공부상 소유자 성명을 입력하세요.";

      if (form.ownershipType === "co") {
        // 공유: coOwners 배열 ON이면 최소 1명, 지분합 ≤ 1
        if (form.coOwners !== undefined) {
          if (form.coOwners.length === 0)
            return "공유자 목록을 추가하거나 소유 형태를 단독으로 변경하세요.";
          const totalRatio = form.coOwners.reduce((s, c) => {
            const r = parseFloat(c.ratio);
            return s + (isNaN(r) ? 0 : r);
          }, 0);
          if (totalRatio > 1 + 1e-9)
            return `공유 지분 합계(${(totalRatio * 100).toFixed(2)}%)가 100%를 초과합니다.`;
          const hasInvalid = form.coOwners.some(
            (c) => !c.id.trim() || isNaN(parseFloat(c.ratio)) || parseFloat(c.ratio) <= 0,
          );
          if (hasInvalid) return "공유자 식별자와 지분율을 모두 입력하세요.";
        }
      }

      if (form.ownershipType === "trust") {
        // 신탁: 위탁자 입력 권장 (경고만, 차단 아님 — API에서 경고 포함)
        // UI 통과↔validate 차단 모순 금지 → 차단하지 않음
      }

      if (form.ownershipType === "inherit") {
        // 상속 미등기: 상속인 미입력 시 경고만 (API에서 경고 포함, 차단 아님).
        // 지분은 전원 입력 시에만 합계 검증 — 일부/전부 미입력은 주된 상속자 fallback 대상(§3.4).
        const named = form.heirs.filter((h) => h.name.trim());
        const allHaveShare =
          named.length > 0 && named.every((h) => h.shareRatio.trim() && !isNaN(parseFloat(h.shareRatio)));
        if (allHaveShare) {
          if (named.some((h) => parseFloat(h.shareRatio) <= 0))
            return "상속 지분율은 0보다 커야 합니다.";
          const total = named.reduce((s, h) => s + parseFloat(h.shareRatio), 0);
          if (total > 1 + 1e-9)
            return `상속 지분 합계(${(total * 100).toFixed(2)}%)가 100%를 초과합니다.`;
        }
      }

      // ── §107①2호: 건물·부속토지 소유자 분리 — 시가표준액 안분 필수 차단 ──
      // 기타 6종 fallback과 달리, house_split 안분 비율은 두 시가표준액이 없으면 계산 불가.
      if (form.ownershipType === "house_split") {
        if (!form.buildingOwner.trim())
          return "건물 소유자 성명을 입력하세요.";
        if (!form.landOwner.trim())
          return "부속토지 소유자 성명을 입력하세요.";
        const bldgVal = parseAmount(form.housingBuildingValue);
        if (!bldgVal || bldgVal <= 0)
          return "건축물 시가표준액을 입력하세요 (§107①2호 안분 필수).";
        const landVal = parseAmount(form.landStdValue);
        if (!landVal || landVal <= 0)
          return "부속토지 시가표준액을 입력하세요 (§107①2호 안분 필수).";
      }

      // 기타 6종(clan·installment·project·import·bankruptcy·unclear) —
      // 식별자 필드(installmentBuyer 등) 미입력 시 경고만, 차단 아님.
      // 엔진이 fallback=공부상 소유자 처리 → UI 통과↔validate 차단 모순 금지.
      // registeredOwner 필수 검증은 위에서 공통 처리됨.
    }
  }
  if (step === 1 && form.objectType === "land") {
    if (!form.landTaxType) return "토지 과세 유형을 선택하세요.";
  }
  if (step === 2) {
    if (form.landTaxType === "separate_aggregate") {
      if (!form.saZoningDistrict) return "용도지역을 선택하세요.";
      const landArea = parseDecimal(form.saLandArea);
      if (!landArea || landArea <= 0) return "토지 면적(㎡)을 입력하세요.";
      // 공장용지도 별도합산 기준면적은 §101①1호 본칙(바닥면적 × 배율)이다 —
      // 공장입지기준면적(§102①1호 분리과세 한도)으로 대체할 수 없다(2026-08-05 정정).
      const bfa = parseDecimal(form.saBuildingFloorArea);
      if (!bfa || bfa <= 0) return "건물 바닥면적(㎡)을 입력하세요.";
      if (form.saDemolished && !form.saDemolishedDate) return "철거일을 입력하세요.";
    }
    if (form.landTaxType === "separated") {
      if (!form.stSeparatedType) return "분리과세 토지 유형을 선택하세요.";
      // §102①3호은 "가축별 기준면적으로 계산한 토지면적의 **범위에서**"로 한정한다 —
      // 범위를 모르면 대상 판정이 불가능하다. 엔진도 던지므로 여기서 먼저 막는다(⑧).
      if (form.stSeparatedType === "livestock") {
        if (form.stPastureIsUrbanArea && !form.stPastureOwnedBefore1990)
          return "도시지역 목장용지는 1989년 12월 31일 이전부터 소유한 것만 분리과세 대상입니다 (「지방세법 시행령」 §102⑨1호).";
        const total = parseDecimal(form.stPastureTotalLandArea);
        if (!total || total <= 0) return "목장용지 전체 면적(㎡)을 입력하세요.";
        if (!form.stPastureLivestockType) return "축종을 선택하세요.";
        const cnt = parseDecimal(form.stPastureLivestockCount);
        if (!cnt || cnt <= 0) return "가축 마릿수를 입력하세요 (직전 연도 연중 최고 마릿수).";
      }
      if (form.stSeparatedType === "factory" && !form.stFactoryLocation)
        return "공장 입지 유형을 선택하세요.";
      // 「지방세법 시행령」 §102①1호는 §101①1호 각 목(읍·면·산업단지·공업지역)으로 한정한다.
      // 그 밖의 시지역 공장용지는 §101①1호 본문 → 별도합산이다(2026-08-06 정정).
      // 엔진도 이 경우 분리과세 비해당으로 throw한다 — 여기서 먼저 막아 같은 판정을 유지한다.
      if (form.stSeparatedType === "factory" && form.stFactoryLocation === "urban")
        return "그 밖의 시지역 공장용지는 분리과세가 아닙니다 — 「토지 과세 유형」을 별도합산으로 선택하세요.";
      // §102①1호은 "공장입지기준면적 **범위의** 토지"로 한정한다 — 범위를 모르면 대상 판정이
      // 불가능하다. 엔진도 미입력 시 던지므로 여기서 먼저 막아 같은 판정을 유지한다(⑧).
      // 단서(허가·사용승인 미이행)에 해당하면 면적과 무관하게 제외이므로 면적을 묻지 않는다.
      if (
        form.stSeparatedType === "factory" &&
        form.stFactoryLocation &&
        form.stFactoryLocation !== "urban" &&
        !form.stFactoryIsUnpermitted
      ) {
        const total = parseDecimal(form.stFactoryTotalLandArea);
        if (!total || total <= 0) return "공장 전체 부속토지 면적(㎡)을 입력하세요.";
        const floor = parseDecimal(form.stFactoryFloorArea);
        if (!floor || floor <= 0) return "공장건축물 연면적(㎡)을 입력하세요. 바닥면적이 아닙니다.";
        const rate = parseDecimal(form.stFactoryAreaRatePercent);
        if (!rate || rate <= 0) return "업종별 기준공장면적률(%)을 입력하세요.";

        /**
         * 별표6 3호바 종업원용 체육시설 — 표를 적용하려면 종업원수가 필수다 (비고 2-가).
         * 없으면 엔진이 표 기준면적을 산출할 수 없어 **인정면적이 통째로 0**이 된다
         * (기준면적 과소 → 종합합산 전환 과대). 자동 fallback 금지 원칙상 계산 전에 차단한다.
         */
        const sportsAreas =
          (parseDecimal(form.stFactorySportsPlaygroundArea) ?? 0) +
          (parseDecimal(form.stFactorySportsCourtArea) ?? 0) +
          (parseDecimal(form.stFactorySportsIndoorFloorArea) ?? 0);
        if (sportsAreas > 0) {
          const emp = parseDecimal(form.stFactorySportsEmployeeCount);
          if (!emp || emp <= 0)
            return "종업원용 체육시설용지를 입력했습니다 — 종업원수를 입력하세요 (「지방세법 시행규칙」 [별표 6] 3호바 비고 2-가).";
          // 비고 2-나는 「50명 이하인 **법인**」에만 적용된다. 개인사업자에 적용하면 코트면적만
          // 인정돼 법 근거 없이 불리해지므로 명시 선택을 요구한다.
          if (emp <= 50 && !form.stFactorySportsEntityType)
            return "종업원 50명 이하입니다 — 사업주체(법인/개인)를 선택하세요. 법인이면 코트면적만 기준면적으로 인정됩니다 ([별표 6] 3호바 비고 2-나).";
        }
      }
    }
  }
  // Step3: recompute 모드 직전 과세표준 — 입력 시 형식만 검증, 미입력은 통과(상한 미적용 경고는 엔진)
  if (step === 3 && form.objectType !== "housing" && form.taxCapMode === "recompute") {
    if (form.previousYearTaxBase && parseAmount(form.previousYearTaxBase) === null)
      return "직전연도 과세표준을 올바른 금액으로 입력하세요.";
  }
  // Step3(주택): 부칙 제15조 경과조치 토글 ON 시 직전본세 필수 (자동 안분 fallback 금지 — 미입력 차단)
  if (step === 3 && form.objectType === "housing" && form.housingTaxCapEnabled) {
    const prev = parseAmount(form.housingPreviousYearTax);
    if (prev === null || prev <= 0)
      return "세부담상한 경과조치 적용 시 직전연도 재산세 본세를 입력하세요.";
    // 도시지역 주택은 도시지역분도 본세와 별개로 세부담상한 대상(§118 본문) — 직전 도시지역분 필수
    if (form.isUrbanArea) {
      const prevUrban = parseAmount(form.housingPreviousUrbanTax);
      if (prevUrban === null || prevUrban <= 0)
        return "도시지역 주택은 도시지역분 세부담상한 적용을 위해 직전연도 도시지역분을 입력하세요.";
    }
  }
  return null;
}

// ============================================================
// API 호출
// ============================================================

/** 폼 상태 → API 요청 본문 변환 (순수 함수 — 테스트 anchor 대상) */
export function buildPropertyTaxRequestBody(form: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {
    objectType: form.objectType,
    publishedPrice: parseAmount(form.publishedPrice) ?? 0,
    isOneHousehold: form.isOneHousehold,
    isUrbanArea: form.isUrbanArea,
  };

  // 주택 과세표준상한제(§110③) — 직전연도 공시가격 (주택 + 값>0 시에만 전송)
  if (form.objectType === "housing") {
    const priorPrice = parseAmount(form.priorYearPublishedPrice);
    if (priorPrice !== null && priorPrice > 0) {
      body.priorYearPublishedPrice = priorPrice;
    }
    // 주택 건물분 소방분(§146④ 단서) — 건축물 부분 시가표준액 (값>0 시에만 전송)
    const bldgValue = parseAmount(form.housingBuildingValue);
    if (bldgValue !== null && bldgValue > 0) {
      body.housingBuildingValue = bldgValue;
    }
    // 주택 세부담상한 경과조치(부칙 제15조) — 토글 ON + 직전본세 값>0 시에만 전송 (게이트=필드 존재 → 종부세 호출 불변)
    if (form.housingTaxCapEnabled) {
      const prevHousingTax = parseAmount(form.housingPreviousYearTax);
      if (prevHousingTax !== null && prevHousingTax > 0) {
        body.previousYearHousingBaseTax = prevHousingTax;
      }
      // v2 도시지역분 세부담상한(§118 본문) — 도시지역 + 직전 도시지역분 값>0 시에만 전송
      if (form.isUrbanArea) {
        const prevUrban = parseAmount(form.housingPreviousUrbanTax);
        if (prevUrban !== null && prevUrban > 0) {
          body.previousYearHousingUrbanTax = prevUrban;
        }
      }
    }
  }

  if (form.objectType === "building") {
    body.buildingType = form.buildingType;
    // 화재위험 중과 (§146③2호·2의2호) — building + ≠none 만 전송
    if (form.fireHazardClass && form.fireHazardClass !== "none") {
      body.fireHazardClass = form.fireHazardClass;
    }
  }

  // 선박 유형 — §111①4호 가목 고급선박(5%) / 나목 일반선박(0.3%)
  if (form.objectType === "vessel") {
    body.vesselType = form.vesselType;
  }

  if (form.objectType === "land" && form.landTaxType) {
    body.landTaxType = form.landTaxType;

    if (form.landTaxType === "separate_aggregate") {
      const landArea = parseDecimal(form.saLandArea);
      const publishedTotal = parseAmount(form.publishedPrice) ?? 0;
      const officialLandPrice = landArea > 0 ? Math.floor(publishedTotal / landArea) : 0;

      body.separateAggregateItem = {
        id: "parcel-1",
        jurisdictionCode: "000000",
        landArea,
        officialLandPrice,
        zoningDistrict: form.saZoningDistrict,
        ...(form.saIsFactory
          ? {
              isFactory: true,
            }
          : {
              buildingFloorArea: parseDecimal(form.saBuildingFloorArea) || undefined,
            }),
        ...(form.saDemolished
          ? { demolished: true, demolishedDate: form.saDemolishedDate || undefined }
          : {}),
      };
    }

    if (form.landTaxType === "separated") {
      const st: Record<string, unknown> = {};
      switch (form.stSeparatedType) {
        case "farmland":      st.isFarmland = true; break;
        case "livestock":
          st.isLivestockFarm = true;
          // §102①3호 면적 한도 — 미입력은 엔진이 던진다(추정 금지). validate가 먼저 막는다.
          st.pastureTotalLandArea = parseDecimal(form.stPastureTotalLandArea) ?? undefined;
          st.pastureLivestockType = form.stPastureLivestockType || undefined;
          st.pastureLivestockCount = parseDecimal(form.stPastureLivestockCount) ?? undefined;
          st.pastureHasFacility = form.stPastureHasFacility;
          st.pastureHasGrassland = form.stPastureHasGrassland;
          st.pastureHasFodder = form.stPastureHasFodder;
          st.pastureIsUrbanArea = form.stPastureIsUrbanArea;
          st.pastureOwnedBefore1990 = form.stPastureOwnedBefore1990;
          break;
        case "forest":        st.isProtectedForest = true; break;
        case "factory": {
          st.isFactoryLand = true;
          if (form.stFactoryLocation) st.factoryLocation = form.stFactoryLocation;
          // §102①1호 면적 한도 — 미입력은 엔진이 던진다(추정 금지). validate가 먼저 막는다.
          st.factoryTotalLandArea = parseDecimal(form.stFactoryTotalLandArea) ?? undefined;
          st.factoryFloorArea = parseDecimal(form.stFactoryFloorArea) ?? undefined;
          st.factoryAreaRatePercent = parseDecimal(form.stFactoryAreaRatePercent) ?? undefined;
          st.factoryIsRestrictedZone = form.stFactoryIsRestrictedZone;
          st.factoryAdditionalRecognizedArea =
            parseDecimal(form.stFactoryAdditionalRecognizedArea) ?? undefined;
          // 별표6 3호바 — 표(비고 2-나·다·라)와 10% 상한은 엔진이 산출한다 (E4-06).
          st.factoryEmployeeSportsFacility = {
            employeeCount: parseDecimal(form.stFactorySportsEmployeeCount) ?? undefined,
            entityType:
              form.stFactorySportsEntityType === "corporation" ||
              form.stFactorySportsEntityType === "individual"
                ? form.stFactorySportsEntityType
                : undefined,
            playgroundArea: parseDecimal(form.stFactorySportsPlaygroundArea) ?? undefined,
            tennisCourtArea: parseDecimal(form.stFactorySportsCourtArea) ?? undefined,
            indoorFloorArea: parseDecimal(form.stFactorySportsIndoorFloorArea) ?? undefined,
            indoorZoneMultiplier: form.stFactorySportsZoningDistrict
              ? getZoneAreaMultiplier(form.stFactorySportsZoningDistrict)?.multiplier
              : undefined,
          };
          st.factoryIsUnpermitted = form.stFactoryIsUnpermitted;
          break;
        }
        case "saltfield":     st.isSaltField = true; break;
        case "terminal":      st.isTerminalOrParking = true; break;
        case "golf_member":   st.isGolfCourse = true; st.golfCourseType = "member"; break;
        case "entertainment": st.isHighClassEntertainment = true; break;
      }
      body.separateTaxationItem = st;
    }
  }

  // 주택은 세부담상한 미적용 (지방세법 §122 단서) — 전년도 세액 미전송 (엔진·UI 동기화)
  if (form.objectType !== "housing") {
    // recompute(§118 본문) 대상: 건축물·선박·항공기·종합합산 토지
    const isRecomputeTarget =
      form.objectType === "building" ||
      form.objectType === "vessel" ||
      form.objectType === "aircraft" ||
      (form.objectType === "land" && form.landTaxType === "comprehensive_aggregate");
    if (form.taxCapMode === "recompute" && isRecomputeTarget) {
      const prevBase = parseAmount(form.previousYearTaxBase);
      if (prevBase !== null && prevBase > 0) {
        body.taxCapMode = "recompute";
        body.previousYearTaxBase = prevBase;
      }
    } else {
      const prevTax = parseAmount(form.previousYearTax);
      if (prevTax !== null && prevTax > 0) {
        body.previousYearTax = prevTax;
      }
    }
  }

  // ── 납세의무자(§107) — ownershipType 입력 시에만 전송 ──
  // 미입력(undefined / "sole") → taxpayerInfo 미포함 → 엔진 납세의무자 판정 생략
  if (form.ownershipType && form.ownershipType !== "sole") {
    // ── §107①2호: 건물·부속토지 소유자 분리 (house_split 전용 분기) ──
    if (form.ownershipType === "house_split") {
      const buildingOwner = form.buildingOwner.trim();
      const landOwner = form.landOwner.trim();
      if (buildingOwner || landOwner) {
        body.taxpayerInfo = {
          registeredOwner: buildingOwner || landOwner, // 형식 충족 (대표는 엔진이 시가표준액으로 판정)
          isHouseSplit: true,
          buildingOwner: buildingOwner || undefined,
          landOwner: landOwner || undefined,
          landStdValue: parseAmount(form.landStdValue) ?? undefined,
        };
        // 건축물 시가표준액 — 기존 housingBuildingValue 재사용 (§146④와 동일 필드)
        const bldgValue = parseAmount(form.housingBuildingValue);
        if (bldgValue !== null && bldgValue > 0) {
          body.housingBuildingValue = bldgValue;
        }
      }
    } else {
    const registeredOwner = form.registeredOwner.trim();
    if (registeredOwner) {
      const info: Record<string, unknown> = { registeredOwner };

      if (form.ownershipType === "co" && form.coOwners && form.coOwners.length > 0) {
        info.coOwnershipShares = form.coOwners
          .filter((c) => c.id.trim() && !isNaN(parseFloat(c.ratio)) && parseFloat(c.ratio) > 0)
          .map((c) => ({ ownerId: c.id.trim(), shareRatio: parseFloat(c.ratio) }));
      }

      if (form.ownershipType === "trust") {
        info.isTrust = true;
        const settlor = form.settlor.trim();
        if (settlor) info.settlor = settlor;
      }

      if (form.ownershipType === "inherit") {
        info.isInheritanceUnregistered = true;
        // 행 기반 → {name, shareRatio?, birthDate?}[] (빈 필드 생략). 엔진 selectMainHeir가 §53 판정.
        const heirs = form.heirs
          .filter((h) => h.name.trim())
          .map((h) => {
            const heir: { name: string; shareRatio?: number; birthDate?: string } = {
              name: h.name.trim(),
            };
            const share = parseFloat(h.shareRatio);
            if (!isNaN(share) && share > 0) heir.shareRatio = share;
            if (h.birthDate.trim()) heir.birthDate = h.birthDate.trim();
            return heir;
          });
        if (heirs.length > 0) info.heirs = heirs;
      }

      // ── 기타 6종 §107 ──
      if (form.ownershipType === "clan") {
        // 종중재산 미신고 §107②3호 — 공부상 소유자가 납세의무자 (isClanProperty=true)
        info.isClanProperty = true;
      }

      if (form.ownershipType === "installment") {
        // 연부 매수계약자 §107②4호
        const buyer = form.installmentBuyer.trim();
        if (buyer) info.installmentBuyer = buyer;
      }

      if (form.ownershipType === "project") {
        // 환지 체비지·보류지 사업시행자 §107②6호
        const operator = form.projectOperator.trim();
        if (operator) info.projectOperator = operator;
      }

      if (form.ownershipType === "import") {
        // 외국인 항공기·선박 수입자 §107②7호
        const imp = form.importer.trim();
        if (imp) info.importer = imp;
      }

      if (form.ownershipType === "bankruptcy") {
        // 파산재단 §107②8호 — 공부상 소유자가 납세의무자 (isBankruptcyEstate=true)
        info.isBankruptcyEstate = true;
      }

      if (form.ownershipType === "unclear") {
        // 소유권 귀속 불명 시 사용자 §107③
        const unclear = form.unclearUser.trim();
        if (unclear) info.ownershipUnclearUser = unclear;
      }

      // 사실상 소유자 불일치
      const actualOwner = form.actualOwner.trim();
      if (actualOwner && actualOwner !== registeredOwner) {
        info.actualOwner = actualOwner;
      }

      body.taxpayerInfo = info;
    }
    } // end else (house_split 이외)
  }

  return body;
}

export async function callPropertyTaxAPI(form: FormState): Promise<PropertyTaxResult> {
  const body = buildPropertyTaxRequestBody(form);

  const res = await fetch("/api/calc/property", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.error?.message ?? `서버 오류 (${res.status})`);
  }

  return json.data as PropertyTaxResult;
}
