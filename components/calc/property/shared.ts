import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
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

export const ZONING_DISTRICT_LABELS: [string, string][] = [
  ["residential", "주거지역"],
  ["commercial", "상업지역"],
  ["industrial", "공업지역"],
  ["green", "녹지지역"],
  ["management", "관리지역"],
  ["agricultural", "농림지역"],
  ["nature_preserve", "자연환경보전지역"],
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
  objectType: string;
  publishedPrice: string;
  /** 직전연도 공시가격 — 주택 과세표준상한제(§110③) 계산용 (주택 전용·선택) */
  priorYearPublishedPrice: string;
  /** 주택 건축물 부분 시가표준액 — 주택 건물분 소방분(§146④ 단서) 과세표준 (주택 전용·선택) */
  housingBuildingValue: string;
  isOneHousehold: boolean;
  isUrbanArea: boolean;
  buildingType: string;
  /** 화재위험 건축물 등급 — 소방분 중과(§146③2호·2의2호) (건축물 전용) */
  fireHazardClass: string;
  previousYearTax: string;
  /** 직전연도 과세표준 (원) — recompute 모드(§118 본문, 비주택 building·vessel·aircraft·종합합산) */
  previousYearTaxBase: string;
  /** 세부담상한 모드 — "direct"(직전 세액 직접입력) | "recompute"(직전 과세표준 재산정) */
  taxCapMode: "direct" | "recompute";
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
  /** 상속인 목록 (쉼표 구분 단일 텍스트, 편의 입력) */
  heirsText: string;
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
  objectType: "housing",
  publishedPrice: "",
  priorYearPublishedPrice: "",
  housingBuildingValue: "",
  isOneHousehold: false,
  isUrbanArea: false,
  buildingType: "general",
  fireHazardClass: "none",
  previousYearTax: "",
  previousYearTaxBase: "",
  taxCapMode: "direct",
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
  // 납세의무자(§107) 초기값 — 섹션 접힘(미입력)
  ownershipType: undefined,
  registeredOwner: "",
  actualOwner: "",
  settlor: "",
  coOwners: undefined,
  heirsText: "",
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
        // 상속 미등기: 상속인 텍스트 비어있으면 경고만 (API에서 경고 포함)
        // 차단하지 않음 (UI 통과↔validate 차단 모순 금지)
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
      if (form.saIsFactory) {
        const fsa = parseDecimal(form.saFactoryStandardArea);
        if (!fsa || fsa <= 0) return "공장입지기준면적(㎡)을 입력하세요.";
      } else {
        const bfa = parseDecimal(form.saBuildingFloorArea);
        if (!bfa || bfa <= 0) return "건물 바닥면적(㎡)을 입력하세요.";
      }
      if (form.saDemolished && !form.saDemolishedDate) return "철거일을 입력하세요.";
    }
    if (form.landTaxType === "separated") {
      if (!form.stSeparatedType) return "분리과세 토지 유형을 선택하세요.";
      if (form.stSeparatedType === "factory" && !form.stFactoryLocation)
        return "공장 입지 유형을 선택하세요.";
    }
  }
  // Step3: recompute 모드 직전 과세표준 — 입력 시 형식만 검증, 미입력은 통과(상한 미적용 경고는 엔진)
  if (step === 3 && form.objectType !== "housing" && form.taxCapMode === "recompute") {
    if (form.previousYearTaxBase && parseAmount(form.previousYearTaxBase) === null)
      return "직전연도 과세표준을 올바른 금액으로 입력하세요.";
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
  }

  if (form.objectType === "building") {
    body.buildingType = form.buildingType;
    // 화재위험 중과 (§146③2호·2의2호) — building + ≠none 만 전송
    if (form.fireHazardClass && form.fireHazardClass !== "none") {
      body.fireHazardClass = form.fireHazardClass;
    }
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
              factoryStandardArea: parseDecimal(form.saFactoryStandardArea) || undefined,
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
        case "livestock":     st.isLivestockFarm = true; break;
        case "forest":        st.isProtectedForest = true; break;
        case "factory":
          st.isFactoryLand = true;
          if (form.stFactoryLocation) st.factoryLocation = form.stFactoryLocation;
          break;
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
        const heirs = form.heirsText
          .split(/[,，、]/)
          .map((h) => h.trim())
          .filter(Boolean);
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
