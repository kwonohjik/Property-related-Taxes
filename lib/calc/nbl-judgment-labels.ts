/**
 * 비사업용 토지 판정 메뉴 — 지목·용도지역 한국어 라벨 (사이드바·결과 전제 요약용 · 표시 전용).
 *
 * `NblSectionContainer`의 옵션 표(`LAND_TYPE_OPTIONS`·`ZONE_TYPE_OPTIONS`)는 컨테이너 안 비공개 상수다. 컨테이너를 export로 바꾸면 다른 세션이
 * 만지는 NBL 파일을 더 건드리게 되므로 **사본**을 두고, anchor(`nbl-judgment-summary.anchor.test.ts`)가 컨테이너 소스의 옵션 value 집합과 대조한다
 * (한쪽만 늘리면 테스트가 막는다 · UV-12).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type LandType = Exclude<AssetForm["nblLandType"], "">;

/** 키를 `satisfies`로 묶는다 — 지목이 늘면 컴파일이 여기서 막는다. */
export const NBL_LAND_TYPE_LABEL = {
  farmland: "농지 (전·답·과수원)",
  forest: "임야",
  pasture: "목장용지",
  housing_site: "주택 부수 토지",
  villa_land: "별장 부수 토지",
  other_land: "기타 토지 (나대지·잡종지)",
} as const satisfies Record<LandType, string>;

export const NBL_ZONE_TYPE_LABEL: Record<string, string> = {
  exclusive_residential: "전용주거지역",
  general_residential: "일반주거지역",
  semi_residential: "준주거지역",
  commercial: "상업지역",
  industrial: "공업지역",
  green: "녹지지역 (생산·자연)",
  conservation_green: "보전녹지지역",
  management: "관리지역",
  agriculture_forest: "농림지역",
  natural_env: "자연환경보전지역",
  undesignated: "미지정",
};

export function nblLandTypeLabel(v: string | undefined): string | undefined {
  return v ? (NBL_LAND_TYPE_LABEL as Record<string, string>)[v] : undefined;
}

export function nblZoneTypeLabel(v: string | undefined): string | undefined {
  return v ? NBL_ZONE_TYPE_LABEL[v] : undefined;
}

/** 취득원인 한국어 라벨 — 날짜 칸 라벨이 원인에 따라 달라진다(메뉴 ① · 사이드바 · 결과 전제 요약이 같은 표를 쓴다). */
export const NBL_ACQUISITION_CAUSE_LABEL = {
  purchase: "매매",
  inheritance: "상속",
  gift: "증여",
  carryover_gift: "이월과세(배우자·직계존비속 증여)",
} as const;

/** 취득원인별 취득일 칸 라벨 — 「취득일」 문구를 남긴다(`InheritanceWithin3YearsNotice`·`UnconditionalExemptionSection`이 「취득일 칸」을 가리킨다). */
export function nblAcquisitionDateLabel(cause: string | undefined): string {
  if (cause === "inheritance") return "취득일 (상속개시일)";
  if (cause === "gift") return "취득일 (증여 등기접수일)";
  return "취득일";
}
