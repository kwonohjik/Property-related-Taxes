import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { PropertyTaxResult } from "@/lib/tax-engine/types/property.types";

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
  { value: "golf_public",  label: "대중·간이 골프장",                        rate: "0.2%" },
  { value: "entertainment",label: "고급오락장 (카지노·유흥주점 등)",           rate: "4%"   },
  { value: "other",        label: "기타 분리과세 토지",                       rate: "0.2%" },
];

// ============================================================
// 폼 상태
// ============================================================

export interface FormState {
  jibun: string;
  road: string;
  building: string;
  objectType: string;
  publishedPrice: string;
  isOneHousehold: boolean;
  isUrbanArea: boolean;
  buildingType: string;
  previousYearTax: string;
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
}

export const INITIAL_FORM: FormState = {
  jibun: "",
  road: "",
  building: "",
  objectType: "housing",
  publishedPrice: "",
  isOneHousehold: false,
  isUrbanArea: false,
  buildingType: "general",
  previousYearTax: "",
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
};

// ============================================================
// 유효성 검사
// ============================================================

export function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.objectType) return "물건 유형을 선택하세요.";
    if (!form.publishedPrice || parseAmount(form.publishedPrice) === null)
      return "공시가격을 입력하세요.";
  }
  if (step === 1 && form.objectType === "land") {
    if (!form.landTaxType) return "토지 과세 유형을 선택하세요.";
  }
  if (step === 2) {
    if (form.landTaxType === "separate_aggregate") {
      if (!form.saZoningDistrict) return "용도지역을 선택하세요.";
      const landArea = parseAmount(form.saLandArea);
      if (!landArea || landArea <= 0) return "토지 면적(㎡)을 입력하세요.";
      if (form.saIsFactory) {
        const fsa = parseAmount(form.saFactoryStandardArea);
        if (!fsa || fsa <= 0) return "공장입지기준면적(㎡)을 입력하세요.";
      } else {
        const bfa = parseAmount(form.saBuildingFloorArea);
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
  return null;
}

// ============================================================
// API 호출
// ============================================================

export async function callPropertyTaxAPI(form: FormState): Promise<PropertyTaxResult> {
  const body: Record<string, unknown> = {
    objectType: form.objectType,
    publishedPrice: parseAmount(form.publishedPrice) ?? 0,
    isOneHousehold: form.isOneHousehold,
    isUrbanArea: form.isUrbanArea,
  };

  if (form.objectType === "building") {
    body.buildingType = form.buildingType;
  }

  if (form.objectType === "land" && form.landTaxType) {
    body.landTaxType = form.landTaxType;

    if (form.landTaxType === "separate_aggregate") {
      const landArea = parseAmount(form.saLandArea) ?? 0;
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
              factoryStandardArea: parseAmount(form.saFactoryStandardArea) ?? undefined,
            }
          : {
              buildingFloorArea: parseAmount(form.saBuildingFloorArea) ?? undefined,
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
        case "golf_public":   st.isGolfCourse = true; st.golfCourseType = "public"; break;
        case "entertainment": st.isHighClassEntertainment = true; break;
      }
      body.separateTaxationItem = st;
    }
  }

  const prevTax = parseAmount(form.previousYearTax);
  if (prevTax !== null && prevTax > 0) {
    body.previousYearTax = prevTax;
  }

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
