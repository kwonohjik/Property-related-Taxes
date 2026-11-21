/**
 * 토지 지목 판정 (§168-7)
 *
 * PDF p.1697 1단계: "사실상 현황에 의한다. 다만 사실상 현황이 불분명한 경우 공부상 등재현황."
 *
 * 입력의 landType을 PDF 카테고리 그룹(farmland/forest/pasture/housing/villa/other_land)
 * 으로 분류. 별도 `registeredLandType` 필드는 향후 확장.
 */

import type { LandCategoryGroup, LandType, NonBusinessLandInput } from "./types";
import { isFarmlandType } from "./types";

export interface LandCategoryResult {
  category: LandType;
  categoryGroup: LandCategoryGroup;
  categoryLabel: string;
  detail: string;
  legalBasis: string;
}

const LAND_TYPE_LABELS: Record<LandType, string> = {
  farmland: "농지",
  paddy: "답(논)",
  field: "전(밭)",
  orchard: "과수원",
  forest: "임야",
  pasture: "목장용지",
  vacant_lot: "나대지",
  building_site: "건물 부수 토지",
  housing_site: "주택 부수 토지",
  villa_land: "별장 부수 토지",
  other_land: "기타토지(나대지·잡종지)",
  miscellaneous: "잡종지",
  other: "기타",
};

export function getLandCategoryGroup(landType: LandType): LandCategoryGroup {
  if (isFarmlandType(landType)) return "farmland";
  if (landType === "forest") return "forest";
  if (landType === "pasture") return "pasture";
  if (landType === "housing_site") return "housing";
  // A-BS-1 정정(2026-08-05) — 건물(비주택) 부수토지는 「지방세법 시행령」 §101①2호 소관이다.
  // 종전에는 housing으로 묶여 「소득세법 시행령」 §168의12(주택) 배율이 적용됐다(22개 조합 중 19개 상이).
  if (landType === "building_site") return "building_site";
  if (landType === "villa_land") return "villa";
  if (
    landType === "other_land" ||
    landType === "vacant_lot" ||
    landType === "miscellaneous"
  ) {
    return "other_land";
  }
  return "unknown";
}

/**
 * 그 지목이 **양도일 의제(§168의14②)를 실제로 소비하는가**.
 *
 * 의제일은 §168의6 **기간기준에만** 작용한다(법문 「해당 날을 양도일로 보아 제168조의6을
 * 적용한다」). 그런데 지목별 judge 중 `getPeriodJudgmentDate`를 부르는 것은
 * 농지·임야·목장·별장·기타토지뿐이고, **주택부수토지·건물부수토지는 부르지 않는다**.
 *
 * ⚠️ NBL2611-V2-C2 — 이것은 **법령 구조가 아니다**. 영 §168의6은 「법 제104조의3제1항 각 호 외의 부분」의
 *    기간기준이라 5호(주택부수토지)에도 걸린다. 주택부수토지가 의제를 받지 않는 것은 **2026-07-31 사용자 방침**
 *    («주택 배율 초과분은 기간요건 판정 없이 일률»)에서 비롯한 현행 구현이다. 그 방침은 Q-3a (나)(2026-11-19)로
 *    **영 §168의14① 유예만 반영**하도록 좁혀졌고(NBL2611-D1), 양도일 의제(§168의14②)는 그 범위 밖이라 여전히 받지 않는다.
 *    건물부수토지도 현행 구현이 배율 판정만 한다.
 *
 * 🔴 이 술어가 없던 동안 `assemble()`은 지목을 보지 않고 `deemedTransfer`를 실었고,
 *    결과 카드가 「…을 양도일로 보아 기간기준(§168의6)을 판정했습니다」라고 **단정**했다.
 *    적용되지 않은 의제를 적용했다고 말한 것이다(F-1).
 *
 * ⚠️ **제외 지목을 열거한다**(소비 지목 열거가 아니라). 잘못 실으면 표시 1줄이 틀리지만
 *    잘못 지우면 실제로 소비하는 지목의 근거가 사라진다 — 보수적 방향은 「덜 지우는」 쪽이다.
 *
 * ⑤ 렌더 게이트와 ⑧ 검증도 이 술어에 위임한다(`lib/calc/nbl-deemed-transfer-scope.ts`).
 * 게이트를 한 곳에서만 바꾸면 같은 병이 재발한다(R11).
 */
export function consumesPeriodJudgmentDate(landType: LandType | "" | undefined): boolean {
  return consumption(landType).deemedTransfer;
}

/**
 * NBL2611-B1 (R05 · V10-PU10 · V8-VL08 · V2-C1) — **지목별 공통 입력 소비 지도** (단일 소스).
 *
 * 도시편입일·부득이한 사유(유예)·양도일 의제·수도권 여부는 지목에 매이지 않는 «공통» 칸이지만 엔진은 지목별 judge가
 * 일부만 읽는다. ⑤ 렌더 · ⑧ 검증 · ④ 전송 · 매퍼 · 엔진 고지가 **같은 표**를 보게 해 «화면에 있는데 판정엔 안 쓰이는 칸»
 * (별장의 도시편입일 · 주택부수토지의 유예 안내 「가산됩니다」)을 한 곳에서 없앤다. 각 칸은 judge 소스에서 실제 호출을 확인했다:
 *
 *   · 도시편입일 `urbanIncorporationDate` — farmland.ts(편입유예·§168의8⑤) · pasture.ts(§168의10⑤) · forest.ts
 *     (시업중·특수산림사업지구일 때만 — 그 조건은 ⑧이 따로 건다. 표에는 «소비 가능»으로 true).
 *   · 유예 `gracePeriods` — farmland · forest · pasture · villa는 `meetsPeriodCriteria`에 넘긴다.
 *     **other_land도 true(NBL2611-B3 · V2-C1)**: 비사업용으로 끝난 잔여분(전량·부분)을 확정하기 직전에 «빈 사업기간 + 유예»로
 *     기간기준을 판정한다(`other-land-merge.ts` `applyGraceToNonBusinessRemainder`). 사업용 분기의 `fullPeriod` 호출에 유예만 얹는 방식은
 *     합집합 증가분이 0이라 효과가 없어 쓰지 않는다.
 *     **housing도 true(NBL2611-D1 · Q-3a (나))**: 배율 초과분(`judgeHousingLand`)에 같은 helper로 유예만 반영한다. building_site는 호출 자체가 없다.
 *   · 양도일 의제 `getPeriodJudgmentDate` — farmland · forest · pasture · villa · other_land. housing·building_site는
 *     부르지 않는다. 주택부수토지는 2026-07-31 사용자 방침(«초과분 기간요건 일률»)을 Q-3a (나)로 «유예만 반영»으로 좁혔을 뿐 의제(§168의14②)는
 *     범위 밖이고, building_site는 현행 구현이 배율 판정만 한다(둘 다 법령 구조가 아니다 — NBL2611-V2-C2).
 *   · 수도권 `isMetropolitanArea` — housing-land.ts만. 별장은 REDIRECT 재분류 뒤 주택부수토지 판정에서 소비한다.
 *
 * `satisfies Record<LandCategoryGroup, …>`가 새 그룹 추가 시 이 표 누락을 컴파일 오류로 만든다.
 */
interface InputConsumption {
  urbanIncorporationDate: boolean;
  gracePeriods: boolean;
  deemedTransfer: boolean;
  metropolitanArea: boolean;
}

const INPUT_CONSUMPTION = {
  farmland:      { urbanIncorporationDate: true,  gracePeriods: true,  deemedTransfer: true,  metropolitanArea: false },
  forest:        { urbanIncorporationDate: true,  gracePeriods: true,  deemedTransfer: true,  metropolitanArea: false },
  pasture:       { urbanIncorporationDate: true,  gracePeriods: true,  deemedTransfer: true,  metropolitanArea: false },
  housing:       { urbanIncorporationDate: false, gracePeriods: true,  deemedTransfer: false, metropolitanArea: true  },
  building_site: { urbanIncorporationDate: false, gracePeriods: false, deemedTransfer: false, metropolitanArea: false },
  villa:         { urbanIncorporationDate: false, gracePeriods: true,  deemedTransfer: true,  metropolitanArea: true  },
  other_land:    { urbanIncorporationDate: false, gracePeriods: true,  deemedTransfer: true,  metropolitanArea: false },
  unknown:       { urbanIncorporationDate: false, gracePeriods: false, deemedTransfer: false, metropolitanArea: false },
} as const satisfies Record<LandCategoryGroup, InputConsumption>;

function consumption(landType: LandType | "" | undefined): InputConsumption {
  if (!landType) return INPUT_CONSUMPTION.unknown;
  return INPUT_CONSUMPTION[getLandCategoryGroup(landType)];
}

/** 도시편입일(편입유예)을 판정에 쓰는 지목 — 농지·임야·목장용지. 별장·주택부수·기타토지에는 입력칸이 의미가 없다. */
export function consumesUrbanIncorporationDate(landType: LandType | "" | undefined): boolean {
  return consumption(landType).urbanIncorporationDate;
}

/** 부득이한 사유 유예기간(영 §168의14①)을 판정에 쓰는 지목 — false인 지목은 입력해도 결과가 바뀌지 않는다(확인 필요 고지 대상). */
export function consumesGracePeriods(landType: LandType | "" | undefined): boolean {
  return consumption(landType).gracePeriods;
}

/** 수도권 여부(영 §168의12 배율)를 판정에 쓰는 지목 — 주택부수토지, 그리고 재분류되는 별장. */
export function consumesMetropolitanArea(landType: LandType | "" | undefined): boolean {
  return consumption(landType).metropolitanArea;
}

export function classifyLandCategory(input: NonBusinessLandInput): LandCategoryResult {
  const category = input.landType;
  const categoryGroup = getLandCategoryGroup(category);
  const categoryLabel = LAND_TYPE_LABELS[category] ?? "기타";
  return {
    category,
    categoryGroup,
    categoryLabel,
    detail: `사실상 지목: ${categoryLabel}`,
    legalBasis: "시행령 §168조의7",
  };
}
