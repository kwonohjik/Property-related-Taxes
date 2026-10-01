/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 4 (reduction)**. 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「reduction: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: 「감면·공제」(2단계) — `lib/calc/transfer-tax-validate-reductions.ts`. 한 메시지 = 한 케이스.
 *
 * ⚠️ 2단계 감면 검증은 **첫 오류 1건만** 돌려준다(`validateStep2Reductions`). 그래서 각 케이스는
 *    「통과하는 입력(ok)」에서 **그 칸 하나만** 비운 폼이다 — 다른 칸이 비면 그 오류가 먼저 나와 항목을 못 찾는다.
 *
 * 키는 `reduction.<조문 타입>.<속성>` — 감면 그룹 라디오는 category 안에서만 배타라 PHD를 가진 두 조문이
 * 동시에 열릴 수 있어, 타입으로 구분해야 오류가 **그 조문의** 입력칸으로 간다.
 */
import { getReductionDefault, getStandaloneDefault, type StandaloneReductionType } from "../../components/calc/transfer/UnifiedReductionPanel-defaults";
import type { TransferReductionId } from "../../lib/tax-engine/transfer-reductions";
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

/** 감면 행이 아니라 **자산** 값이라 조문 타입으로 한정하지 않는 키 — 매매계약일은 감면 펼침 영역 상단의 자산-수준 칸이다 */
const ASSET_LEVEL = "assetContractDate";

type Row = {
  /** 케이스 이름 꼬리 */
  name: string;
  /** `reduction.<type>.` 뒤의 속성 — 전체 키(점이 들어 있으면)이거나 자산-수준 키(`ASSET_LEVEL`) */
  prop: string;
  message: RegExp;
  /** ok에서 덮어쓸 감면 행 값 */
  patch?: Record<string, unknown>;
  /** 자산 값 덮어쓰기 */
  asset?: Record<string, unknown>;
  unreachableInUi?: string;
};

/**
 * 세션 복원(`calc-wizard-asset-migrate-rental-split.ts` `normalizeRentalAndSplitFields`)이 §97 시리즈 감면의
 * `hasVacancyOverGrace`를 **항상 null로 되돌린다** — 화면에서 고른 값도 새로고침하면 사라진다(별건, 보고).
 * 그래서 「공실 여부」 뒤에 나오는 메시지는 시드로 만들 수 없고, 화면에서 그 값을 고른 뒤에야 닿는다.
 * 그런 케이스는 메인 spec이 건너뛰고(`unreachableInUi`), 보조 spec
 * `e2e/transfer-validation-field-jump-reduction-rental.spec.ts`가 같은 입력으로 화면 조작 후 검증한다.
 */
export const VACANCY_RESET_REASON =
  "세션 복원이 §97 시리즈 감면의 `hasVacancyOverGrace`를 null로 되돌려 시드로 만들 수 없다 — 보조 spec(`transfer-validation-field-jump-reduction-rental.spec.ts`)이 화면에서 그 값을 고른 뒤 검증한다";

/** 화면에서 「공실 여부」를 고른 뒤에야 닿는 케이스 — 보조 spec이 읽는다 */
export const REDUCTION_VACANCY_PREPARED: { case: FieldJumpCase; type: string; vacancy: "no" | "yes" }[] = [];

/** 한 조문의 케이스 묶음 — `ok`(감면 행) · `assetOk`(자산)에서 `row`만큼만 어긋나게 만든다. */
function table(
  type: string,
  base: () => Record<string, unknown>,
  ok: Record<string, unknown>,
  assetOk: Record<string, unknown>,
  rows: Row[],
  /** 행 이름 → 보조 spec이 먼저 고를 「공실 여부」 */
  vacancyFirst: Record<string, "no" | "yes"> = {},
): FieldJumpCase[] {
  return rows.map((r) => {
    const vacancy = vacancyFirst[r.name];
    const c: FieldJumpCase = {
      name: `reduction: ${type} ${r.name}`,
      field: r.prop.includes(".") || r.prop === ASSET_LEVEL ? r.prop : `reduction.${type}.${r.prop}`,
      step: 2 as const,
      assetIndex: A,
      message: r.message,
      unreachableInUi: r.unreachableInUi ?? (vacancy ? VACANCY_RESET_REASON : undefined),
      form: () => withPrimary({ ...assetOk, ...r.asset, reductions: [{ ...base(), ...ok, ...r.patch }] }),
    };
    if (vacancy) REDUCTION_VACANCY_PREPARED.push({ case: c, type, vacancy });
    return c;
  });
}

const hybrid = (id: TransferReductionId) => () => getReductionDefault(id) as unknown as Record<string, unknown>;
const standalone = (id: StandaloneReductionType) => () => getStandaloneDefault(id) as unknown as Record<string, unknown>;

/** 5년 경과 양도(취득 2015-03 → 양도 2024-03)라 취득시·5년 시점 기준시가를 요구하는 조문의 공통 ok 값 */
const std5 = (sfx: string) => ({
  [`standardPriceAtAcquisition${sfx}`]: "100000000",
  [`standardPriceAt5Years${sfx}`]: "150000000",
});

/** PHD 환산 ON — 입력은 모두 비움 → 첫 빈 칸(최초공시 공동주택가격) */
const phdRow = (label: string, phdMode: string): Row => ({
  name: "PHD 환산 모드(최초공시 가격)", prop: "phdFirstDisclosurePrice", message: new RegExp(`^${label} PHD 환산 모드`), patch: { [phdMode]: true },
});

// ── §99의3 ────────────────────────────────────────────────────────────────
const n993Ok = { acquisitionType993: "from_builder", standardPriceAtAcquisition993: "100000000", exclusiveAreaSqm993: "84", standardPriceAt5Years: "150000000", standardPriceAtTransfer993: "300000000" };
const n993Asset = { assetContractDate: "2002-01-01" };
/** PHD 환산 ON + 일부 칸만 채운 상태 — 비어 있는 첫 칸으로 간다 */
const phdFilled = (upto: number) =>
  Object.fromEntries(
    ([["phdFirstDisclosurePrice993", "300000000"], ["phdLandAreaSqm993", "100"], ["phdLandPricePerSqmAtAcq993", "500000"], ["phdLandPricePerSqmAtFirst993", "600000"], ["phdBuildingStdAtAcq993", "50000000"]] as const).slice(0, upto),
  );

const NEW_99_3 = table("new_99_3", hybrid("new_99_3"), n993Ok, n993Asset, [
  { name: "자기건설 사용승인일", prop: "usageApprovalDate993", message: /^§99의3 2호 적용: 사용승인일/, patch: { acquisitionType993: "self_built", usageApprovalDate993: "" } },
  { name: "매매계약일(자산 입력칸)", prop: "assetContractDate", message: /^§99의3 1호 적용: 매매계약일/, asset: { assetContractDate: "" } },
  phdRow("§99의3", "phdMode993"),
  { name: "PHD 환산 모드(토지면적)", prop: "phdLandAreaSqm", message: /^§99의3 PHD 환산 모드/, patch: { phdMode993: true, ...phdFilled(1) } },
  { name: "PHD 환산 모드(취득시 공시지가)", prop: "phdLandPricePerSqmAtAcq", message: /^§99의3 PHD 환산 모드/, patch: { phdMode993: true, ...phdFilled(2) } },
  { name: "PHD 환산 모드(최초공시시 공시지가)", prop: "phdLandPricePerSqmAtFirst", message: /^§99의3 PHD 환산 모드/, patch: { phdMode993: true, ...phdFilled(3) } },
  { name: "PHD 환산 모드(최초공시시 건물 기준시가)", prop: "phdBuildingStdAtFirst", message: /^§99의3 PHD 환산 모드/, patch: { phdMode993: true, ...phdFilled(5) } },
  { name: "취득시 기준시가", prop: "standardPriceAtAcquisition", message: /^§99의3 적용: 취득시 기준시가를 입력하세요/, patch: { standardPriceAtAcquisition993: "" } },
  { name: "전용면적", prop: "exclusiveAreaSqm993", message: /^§99의3 적용: 전용면적/, patch: { exclusiveAreaSqm993: "" } },
  { name: "5년 시점 기준시가", prop: "standardPriceAt5Years", message: /^§99의3 적용: 5년 시점 기준시가를/, patch: { standardPriceAt5Years: "" } },
  { name: "종전주택 기준시가", prop: "previousHouseStdPrice993", message: /^§99의3 적용: 재개발·재건축 신축주택은 종전주택/, patch: { isRedevelopedNewHouse993: true, previousHouseStdPrice993: "" } },
  { name: "양도시 기준시가(재개발 변형)", prop: "standardPriceAtTransfer993", message: /^§99의3 적용: 재개발·재건축 신축주택 변형은/, patch: { isRedevelopedNewHouse993: true, previousHouseStdPrice993: "100000000", standardPriceAtTransfer993: "" } },
  { name: "양도시 기준시가(5년 경과)", prop: "standardPriceAtTransfer993", message: /^§99의3 적용: 취득 후 5년 경과 양도는 양도시 기준시가/, patch: { standardPriceAtTransfer993: "" } },
]);

// ── §99 ───────────────────────────────────────────────────────────────────
const n99Ok = { acquisitionType99: "from_builder", contractDate99: "2000-01-01", standardPriceAtAcquisition99: "100000000", exclusiveAreaSqm99: "84" };
const NEW_99 = table("new_99", hybrid("new_99"), n99Ok, {}, [
  { name: "자기건설 사용승인일", prop: "usageApprovalDate99", message: /^§99 적용: 자기건설 주택의 사용승인일/, patch: { acquisitionType99: "self_built", usageApprovalDate99: "" } },
  { name: "매매계약일", prop: "contractDate99", message: /^§99 적용: 매매계약일을 입력하세요/, patch: { contractDate99: "" } },
  phdRow("§99", "phdMode99"),
  { name: "취득시 기준시가", prop: "standardPriceAtAcquisition", message: /^§99 적용: 취득시 기준시가를 입력하세요/, patch: { standardPriceAtAcquisition99: "" } },
  { name: "전용면적", prop: "exclusiveAreaSqm", message: /^§99 적용: 전용면적/, patch: { exclusiveAreaSqm99: "" } },
  { name: "종전주택 기준시가", prop: "previousHouseStdPrice99", message: /^§99 적용: 재개발·재건축 신축주택은 종전주택/, patch: { isRedevelopedNewHouse99: true, previousHouseStdPrice99: "" } },
]);

// ── §98의8 ────────────────────────────────────────────────────────────────
const u988Ok = { contractDate988: "2014-01-01", acquisitionPrice988: "300000000", exclusiveAreaSqm988: "84", rentalContractDate988: "2015-06-01", rentalStartDate988: "2015-07-01" };
const UNSOLD_98_8 = table("unsold_98_8", hybrid("unsold_98_8"), u988Ok, {}, [
  { name: "매매계약일(자산 입력칸)", prop: "assetContractDate", message: /^§98의8 적용: 최초 매매계약일/, patch: { contractDate988: "" } },
  { name: "취득가액", prop: "acquisitionPrice988", message: /^§98의8 적용: 취득가액/, patch: { acquisitionPrice988: "" } },
  { name: "연면적", prop: "exclusiveAreaSqm988", message: /^§98의8 적용: 연면적/, patch: { exclusiveAreaSqm988: "" } },
  { name: "임대계약 체결일", prop: "rentalContractDate988", message: /^§98의8 적용: 임대계약 체결일/, patch: { rentalContractDate988: "" } },
  { name: "임대개시일", prop: "rentalStartDate988", message: /^§98의8 적용: 임대개시일/, patch: { rentalStartDate988: "" } },
]);

// ── §98의3 ────────────────────────────────────────────────────────────────
const u983Ok = { houseType983: "purchased", contractDate983: "2010-01-01", ...std5("983") };
const UNSOLD_98_3 = table("unsold_98_3", hybrid("unsold_98_3"), u983Ok, {}, [
  { name: "착공일", prop: "constructionStartDate983", message: /^§98의3 적용: 자기건설 주택의 착공일과 사용승인일/, patch: { houseType983: "self_built", constructionStartDate983: "", usageApprovalDate983: "" } },
  { name: "사용승인일", prop: "usageApprovalDate983", message: /^§98의3 적용: 자기건설 주택의 착공일과 사용승인일/, patch: { houseType983: "self_built", constructionStartDate983: "2009-06-01", usageApprovalDate983: "" } },
  { name: "매매계약일", prop: "contractDate983", message: /^§98의3 적용: 최초 매매계약일/, patch: { contractDate983: "" } },
  { name: "대지면적", prop: "landAreaSqm983", message: /^§98의3 적용: 수도권과밀억제권역 주택은 대지면적/, patch: { isOverconcentration983: true, landAreaSqm983: "", floorAreaSqm983: "100" } },
  { name: "연면적", prop: "floorAreaSqm983", message: /^§98의3 적용: 수도권과밀억제권역 주택은 연면적/, patch: { isOverconcentration983: true, landAreaSqm983: "500", floorAreaSqm983: "" } },
  phdRow("§98의3", "phdMode983"),
  { name: "취득시 기준시가(5년 경과)", prop: "standardPriceAtAcquisition", message: /^§98의3 적용: 취득 후 5년 경과 양도는 취득시 기준시가/, patch: { standardPriceAtAcquisition983: "" } },
  { name: "5년 시점 기준시가", prop: "standardPriceAt5Years", message: /^§98의3 적용: 취득 후 5년 경과 양도는 취득 5년 시점/, patch: { standardPriceAt5Years983: "" } },
]);

// ── §98의5 ────────────────────────────────────────────────────────────────
const u985Ok = { contractDate985: "2010-06-01", priceReductionRatePct985: "5", ...std5("985") };
const UNSOLD_98_5 = table("unsold_98_5", hybrid("unsold_98_5"), u985Ok, {}, [
  { name: "매매계약일", prop: "contractDate985", message: /^§98의5 적용: 최초 매매계약일/, patch: { contractDate985: "" } },
  { name: "인하율", prop: "priceReductionRatePct985", message: /^§98의5 적용: 분양가격 인하율\(%\)을 입력하세요/, patch: { priceReductionRatePct985: "" } },
  {
    name: "인하율 음수", prop: "priceReductionRatePct985", message: /^§98의5 적용: 분양가격 인하율은 음수일 수 없습니다/, patch: { priceReductionRatePct985: "-1" },
    unreachableInUi: "`DecimalInput`이 「-」를 지운다(음수를 입력할 수 없다) — 화면에서 도달 불가, vitest만",
  },
  phdRow("§98의5", "phdMode985"),
  { name: "취득시 기준시가(5년 경과)", prop: "standardPriceAtAcquisition", message: /^§98의5 적용: 취득 후 5년 경과 양도는 취득시 기준시가/, patch: { standardPriceAtAcquisition985: "" } },
  { name: "5년 시점 기준시가", prop: "standardPriceAt5Years", message: /^§98의5 적용: 취득 후 5년 경과 양도는 취득 5년 시점/, patch: { standardPriceAt5Years985: "" } },
]);

// ── §98의6 ────────────────────────────────────────────────────────────────
const u986Ok = { hoType986: "seller_rented", stdPriceSumAtBase986: "400000000", floorAreaSqm986: "84", rentalContractDate986: "2011-06-01", rentalStartDate986: "2011-07-01", ...std5("986") };
const UNSOLD_98_6 = table("unsold_98_6", hybrid("unsold_98_6"), u986Ok, {}, [
  { name: "기준시가 합계", prop: "stdPriceSumAtBase986", message: /^§98의6 적용: 주택과 부수토지의 기준시가 합계/, patch: { stdPriceSumAtBase986: "" } },
  { name: "연면적", prop: "floorAreaSqm986", message: /^§98의6 적용: 연면적/, patch: { floorAreaSqm986: "" } },
  { name: "임대계약 체결일", prop: "rentalContractDate986", message: /^§98의6 2호 적용: 임대계약 체결일/, patch: { hoType986: "buyer_rented", rentalContractDate986: "" } },
  { name: "임대개시일", prop: "rentalStartDate986", message: /^§98의6 2호 적용: 임대개시일/, patch: { hoType986: "buyer_rented", rentalStartDate986: "" } },
  phdRow("§98의6", "phdMode986"),
  { name: "취득시 기준시가(5년 경과)", prop: "standardPriceAtAcquisition", message: /^§98의6 적용: 취득 후 5년 경과 양도는 취득시 기준시가/, patch: { standardPriceAtAcquisition986: "" } },
  { name: "5년 시점 기준시가", prop: "standardPriceAt5Years", message: /^§98의6 적용: 취득 후 5년 경과 양도는 취득 5년 시점/, patch: { standardPriceAt5Years986: "" } },
]);

// ── §98의7 ────────────────────────────────────────────────────────────────
const u987Ok = { contractDate987: "2012-10-01", acquisitionPrice987: "500000000", ...std5("987") };
const UNSOLD_98_7 = table("unsold_98_7", hybrid("unsold_98_7"), u987Ok, {}, [
  { name: "매매계약일", prop: "contractDate987", message: /^§98의7 적용: 최초 매매계약일/, patch: { contractDate987: "" } },
  { name: "취득가액", prop: "acquisitionPrice987", message: /^§98의7 적용: 취득가액/, patch: { acquisitionPrice987: "" } },
  phdRow("§98의7", "phdMode987"),
  { name: "취득시 기준시가(5년 경과)", prop: "standardPriceAtAcquisition", message: /^§98의7 적용: 취득 후 5년 경과 양도는 취득시 기준시가/, patch: { standardPriceAtAcquisition987: "" } },
  { name: "5년 시점 기준시가", prop: "standardPriceAt5Years", message: /^§98의7 적용: 취득 후 5년 경과 양도는 취득 5년 시점/, patch: { standardPriceAt5Years987: "" } },
]);

// ── §99의2 ────────────────────────────────────────────────────────────────
const u992Ok = { houseType992: "new_or_unsold", contractDate992: "2013-06-01", acquisitionPrice992: "500000000", exclusiveAreaSqm992: "84", ...std5("992") };
const UNSOLD_99_2 = table("unsold_99_2", hybrid("unsold_99_2"), u992Ok, {}, [
  { name: "자기건설 사용승인일", prop: "usageApprovalDate992", message: /^§99의2 적용: 자기건설 주택의 사용승인/, patch: { houseType992: "self_built", usageApprovalDate992: "" } },
  { name: "매매계약일", prop: "contractDate992", message: /^§99의2 적용: 최초 매매계약일/, patch: { contractDate992: "" } },
  { name: "취득가액", prop: "acquisitionPrice992", message: /^§99의2 적용: 실거래 취득가액/, patch: { acquisitionPrice992: "" } },
  { name: "연면적", prop: "exclusiveAreaSqm992", message: /^§99의2 적용: 연면적/, patch: { exclusiveAreaSqm992: "" } },
  phdRow("§99의2", "phdMode992"),
  { name: "취득시 기준시가(5년 경과)", prop: "standardPriceAtAcquisition", message: /^§99의2 적용: 취득 후 5년 경과 양도는 취득시 기준시가/, patch: { standardPriceAtAcquisition992: "" } },
  { name: "5년 시점 기준시가", prop: "standardPriceAt5Years", message: /^§99의2 적용: 취득 후 5년 경과 양도는 취득 5년 시점/, patch: { standardPriceAt5Years992: "" } },
]);

// ── 장기임대 §97 시리즈 ─────────────────────────────────────────────────────
/** 공통(임대료 증액 · 공실) 케이스 — 폼 5개가 `RentalCommonFields`를 공유하므로 조문마다 한 번씩 배선을 본다 */
const commonRows = (label: string, grace: string): Row[] => [
  { name: "임대료 증액 위반 여부", prop: "rentIncreaseViolationMode", message: new RegExp(`^${label} 적용: 임대료 5% 증액 위반 이력 여부`), patch: { rentIncreaseViolationMode: "" } },
  { name: "공실 여부", prop: "hasVacancyOverGrace", message: new RegExp(`^${label} 적용: ${grace}을 초과하는 공실 여부`), patch: { hasVacancyOverGrace: null } },
];
/** 증액 위반 이력·공실 구간 — 한 조문에서 목록형 칸 배선을 본다 */
const listRows = (label: string): Row[] => [
  { name: "임대료 이력 목록", prop: "rentHistory", message: new RegExp(`^${label} 적용: 위반 이력 "있음" 선택 시 계약별`), patch: { rentIncreaseViolationMode: "has_violation", rentHistory: [] } },
  { name: "공실 구간 목록", prop: "vacancyPeriods", message: new RegExp(`^${label} 적용: 공실 "있음" 선택 시 공실 구간을 1건`), patch: { hasVacancyOverGrace: true, vacancyPeriods: [] } },
  { name: "공실 구간 날짜", prop: "vacancyPeriods", message: new RegExp(`^${label} 적용: 공실 구간의 시작일·종료일`), patch: { hasVacancyOverGrace: true, vacancyPeriods: [{ startDate: "", endDate: "" }] } },
];
const rentalBase = { registrationDate: "2019-06-01", isTaxRegistered: true, rentalStartDate: "2019-06-01", rentIncreaseViolationMode: "none", hasVacancyOverGrace: false };
const dateRows = (label: string): Row[] => [
  { name: "임대개시일", prop: "rentalStartDate", message: new RegExp(`^${label} 적용: 임대개시일을 입력하세요`), patch: { rentalStartDate: "" } },
  { name: "등록일", prop: "registrationDate", message: new RegExp(`^${label} 적용: 임대사업자 등록일`), patch: { registrationDate: "" } },
];

const r973Ok = { ...rentalBase, isNationalHousingScale: true, officialPriceAtStart: "300000000", rentalContinuesToTransfer: true, stdPriceAtAcquisition: "100000000", stdPriceAtTransfer: "300000000" };
const RENTAL_97_3 = table("rental_97_3", hybrid("rental_97_3"), r973Ok, {}, [
  ...dateRows("§97의3"),
  ...commonRows("§97의3", "3개월"),
  ...listRows("§97의3"),
  { name: "민간건설임대(2021~ 등록)", prop: "isPrivateConstructionRental", message: /^§97의3 적용: 민간건설임대주택이 아닌 임대주택\(민간매입임대\)의 등록 시한/, patch: { registrationDate: "2021-06-01", rentalStartDate: "2021-06-01", isPrivateConstructionRental: false } },
  { name: "민간건설임대(2023~ 등록)", prop: "isPrivateConstructionRental", message: /^§97의3 적용: 2023\.1\.1 이후 등록분은 민간건설임대주택/, patch: { registrationDate: "2023-06-01", rentalStartDate: "2023-06-01", isPrivateConstructionRental: false } },
  { name: "국민주택규모", prop: "isNationalHousingScale", message: /^§97의3 적용: 국민주택규모 이하 요건/, patch: { isNationalHousingScale: false } },
  { name: "임대개시 당시 기준시가", prop: "officialPriceAtStart", message: /^§97의3 적용: 임대개시일 당시 기준시가\(주택\+부속토지 합계\)/, patch: { officialPriceAtStart: "" } },
  { name: "임대 계속 여부", prop: "rentalContinuesToTransfer", message: /^§97의3 적용: 임대가 양도일까지 계속되었는지/, patch: { rentalContinuesToTransfer: null } },
  { name: "임대 종료일 기준시가", prop: "stdPriceAtRentalEnd", message: /^§97의3 적용: 임대 종료일 당시 기준시가/, patch: { rentalContinuesToTransfer: false, stdPriceAtRentalEnd: "" } },
  { name: "안분 취득 당시 기준시가", prop: "stdPriceAtAcquisition", message: /^§97의3 적용: 안분 산식의 취득 당시·양도 당시 기준시가/, patch: { stdPriceAtAcquisition: "" } },
  { name: "안분 양도 당시 기준시가", prop: "stdPriceAtTransfer", message: /^§97의3 적용: 안분 산식의 취득 당시·양도 당시 기준시가/, patch: { stdPriceAtTransfer: "" } },
], {
  "민간건설임대(2021~ 등록)": "no",
  "민간건설임대(2023~ 등록)": "no",
  "국민주택규모": "no",
  "임대개시 당시 기준시가": "no",
  "임대 계속 여부": "no",
  "임대 종료일 기준시가": "no",
  "안분 취득 당시 기준시가": "no",
  "안분 양도 당시 기준시가": "no",
  "공실 구간 목록": "yes",
  "공실 구간 날짜": "yes",
});

const r974Ok = { ...rentalBase, rental974Category: "purchase_a", officialPriceAtStart: "300000000", region: "capital" };
const RENTAL_97_4 = table("rental_97_4", hybrid("rental_97_4"), r974Ok, {}, [
  ...dateRows("§97의4"),
  ...commonRows("§97의4", "3개월"),
  { name: "임대주택 유형", prop: "rental974Category", message: /^§97의4 적용: 장기임대주택 유형/, patch: { rental974Category: "" } },
  { name: "임대개시 당시 기준시가", prop: "officialPriceAtStart", message: /^§97의4 적용: 임대개시일 당시 기준시가\(주택\+부수토지 합계\)를 입력/, patch: { officialPriceAtStart: "" } },
  { name: "기준시가 한도 초과", prop: "officialPriceAtStart", message: /^§97의4 적용: 임대개시일 당시 기준시가 합계가 한도/, patch: { officialPriceAtStart: "700000000" } },
], {
  "임대주택 유형": "no",
  "임대개시 당시 기준시가": "no",
  "기준시가 한도 초과": "no",
});

const r975Ok = { ...rentalBase, isNationalHousingScale: true, officialPriceAtStart: "300000000", rentalContinuesToTransfer: true, stdPriceAtAcquisition: "100000000", stdPriceAtTransfer: "300000000" };
const RENTAL_97_5 = table("rental_97_5", hybrid("rental_97_5"), r975Ok, {}, [
  ...dateRows("§97의5"),
  ...commonRows("§97의5", "6개월"),
  { name: "국민주택규모", prop: "isNationalHousingScale", message: /^§97의5 적용: 국민주택규모 이하 요건/, patch: { isNationalHousingScale: false } },
  { name: "임대개시 당시 기준시가", prop: "officialPriceAtStart", message: /^§97의5 적용: 임대개시일 당시 기준시가\(주택\+부속토지 합계\)/, patch: { officialPriceAtStart: "" } },
  { name: "임대 계속 여부", prop: "rentalContinuesToTransfer", message: /^§97의5 적용: 임대가 양도일까지 계속되었는지/, patch: { rentalContinuesToTransfer: null } },
], {
  "국민주택규모": "no",
  "임대개시 당시 기준시가": "no",
  "임대 계속 여부": "no",
});

const rMainOk = { rentalStartDate: "2000-01-01", constructionYear: "1995", rentIncreaseViolationMode: "none", hasVacancyOverGrace: false, hasMin5RentalUnits: true, belowMin5UnitsPeriods: [] };
const RENTAL_97_MAIN = table("rental_97_main", hybrid("rental_97_main"), rMainOk, {}, [
  { name: "임대개시일", prop: "rentalStartDate", message: /^§97 본문 적용: 임대개시일을 입력하세요/, patch: { rentalStartDate: "" } },
  ...commonRows("§97 본문", "3개월"),
  { name: "신축 연도", prop: "constructionYear", message: /^§97 본문 적용: 신축 연도를 입력하세요/, patch: { constructionYear: "" } },
  { name: "5호 이상 임대 여부", prop: "hasMin5RentalUnits", message: /^§97 본문 적용: 임대주택 5호 이상 임대 여부/, patch: { hasMin5RentalUnits: null } },
  { name: "5호 미만 임대 기간", prop: "belowMin5UnitsPeriods", message: /^§97 본문 적용: 5호 미만 임대 기간의 시작일·종료일/, patch: { belowMin5UnitsPeriods: [{ startDate: "", endDate: "" }] } },
  { name: "공동주택 여부(1985 이전)", prop: "isMultiUnitHousing", message: /^§97 본문 적용: 공동주택 여부를 선택하세요 \(조특법 §97①2호\)/, patch: { constructionYear: "1980", isMultiUnitHousing: null, isUnoccupiedAt1986: null } },
  { name: "1986.1.1 입주 사실", prop: "isUnoccupiedAt1986", message: /^§97 본문 적용: 1986\.1\.1 현재 입주 사실/, patch: { constructionYear: "1980", isMultiUnitHousing: true, isUnoccupiedAt1986: null } },
], {
  "신축 연도": "no",
  "5호 이상 임대 여부": "no",
  "5호 미만 임대 기간": "no",
  "공동주택 여부(1985 이전)": "no",
  "1986.1.1 입주 사실": "no",
});

const rProvisoOk = { provisoCase: "a_construction", rentalStartDate: "2000-01-01", constructionYear: "1995", rentIncreaseViolationMode: "none", hasVacancyOverGrace: false, hasMin5RentalUnits: true, belowMin5UnitsPeriods: [] };
const RENTAL_97_PROVISO = table("rental_97_proviso", hybrid("rental_97_proviso"), rProvisoOk, {}, [
  { name: "단서 유형", prop: "provisoCase", message: /^§97 단서 적용: 단서 유형/, patch: { provisoCase: "" } },
  { name: "취득 당시 입주 사실(나목)", prop: "isUnoccupiedAtAcquisition", message: /^§97 단서 적용: 취득 당시 입주 사실 여부를 선택하세요 \(조특법 §97① 단서 나목\)/, patch: { provisoCase: "b_purchase", isUnoccupiedAtAcquisition: null } },
  { name: "임대료 증액 위반 여부", prop: "rentIncreaseViolationMode", message: /^§97 단서 적용: 임대료 5% 증액 위반 이력 여부/, patch: { rentIncreaseViolationMode: "" } },
], {
  "단서 유형": "no",
  "취득 당시 입주 사실(나목)": "no",
});

const r972Ok = { rentalStartDate: "2005-06-01", registrationDate: "2005-06-01", rental972Type: "construction", hasNewRentalPlus2Units: true, rentIncreaseViolationMode: "none", hasVacancyOverGrace: false, isUnoccupiedAtAcquisition: true };
const RENTAL_97_2 = table("rental_97_2", hybrid("rental_97_2"), r972Ok, {}, [
  { name: "임대개시일", prop: "rentalStartDate", message: /^§97의2 적용: 임대개시일을 입력하세요/, patch: { rentalStartDate: "" } },
  ...commonRows("§97의2", "3개월"),
  { name: "공동주택 여부(1999.8.20 전 건설임대)", prop: "isMultiUnitHousing972", message: /^§97의2 적용: 공동주택 여부를 선택하세요 \(조특법 §97의2①1호 나목\)/, asset: { acquisitionDate: "1999-01-01" }, patch: { isMultiUnitHousing972: null, isUnoccupiedAt19990820: null } },
  { name: "1999.8.20 입주 사실", prop: "isUnoccupiedAt19990820", message: /^§97의2 적용: 1999\.8\.20 현재 입주 사실/, asset: { acquisitionDate: "1999-01-01" }, patch: { isMultiUnitHousing972: true, isUnoccupiedAt19990820: null } },
  { name: "취득 당시 입주 사실(매입임대)", prop: "isUnoccupiedAtAcquisition", message: /^§97의2 적용: 취득 당시 입주 사실 여부를 선택하세요 \(조특법 §97의2①2호\)/, patch: { rental972Type: "purchase", isUnoccupiedAtAcquisition: null } },
  { name: "신축임대 2호 이상", prop: "hasNewRentalPlus2Units", message: /^§97의2 적용: 신축임대주택 1호 이상을 포함한 2호/, patch: { hasNewRentalPlus2Units: null } },
  { name: "건설/매입 유형", prop: "rental972Type", message: /^§97의2 적용: 건설임대\(1호\)\/매입임대\(2호\) 유형/, patch: { rental972Type: "" } },
], {
  "공동주택 여부(1999.8.20 전 건설임대)": "no",
  "1999.8.20 입주 사실": "no",
  "취득 당시 입주 사실(매입임대)": "no",
  "신축임대 2호 이상": "no",
  "건설/매입 유형": "no",
});

// ── 개별 감면(자경농지 · 수용 · 개발제한구역 · 대토보상) ───────────────────────
const SELF_FARMING = table("self_farming", standalone("self_farming"), { farmingYears: "10" }, { assetKind: "land" }, [
  {
    name: "피상속인 경작기간 합산 요건", prop: "heirContinuedFarming1Year", message: /^자경농지: 피상속인 경작기간을 합산하려면/,
    asset: { acquisitionCause: "inheritance" }, patch: { farmingYears: "3", decedentFarmingYears: "5", heirContinuedFarming1Year: false, meetsDecedentAggregationAlt: false },
  },
  {
    name: "편입 농지 소재지", prop: "selfFarmingIncorporationLocation", message: /^자경농지 편입: 양도일 현재 농지 소재지/,
    patch: { useSelfFarmingIncorporation: true, selfFarmingIncorporationDate: "2010-01-01", selfFarmingIncorporationLocation: "" },
  },
  {
    name: "편입 3점(취득시)", prop: "selfFarmingStandardPriceAtAcquisition", message: /^편입일 부분감면\(조특령 §66⑦\)/,
    patch: { useSelfFarmingIncorporation: true, selfFarmingIncorporationDate: "2023-06-01", selfFarmingIncorporationLocation: "metro_or_city" },
  },
  {
    name: "편입 3점(편입시)", prop: "selfFarmingStandardPriceAtIncorporation", message: /^편입일 부분감면\(조특령 §66⑦\)/,
    patch: { useSelfFarmingIncorporation: true, selfFarmingIncorporationDate: "2023-06-01", selfFarmingIncorporationLocation: "metro_or_city", selfFarmingStandardPriceAtAcquisition: "50000000" },
  },
  {
    name: "편입 3점(양도시)", prop: "selfFarmingStandardPriceAtTransfer", message: /^편입일 부분감면\(조특령 §66⑦\)/,
    patch: { useSelfFarmingIncorporation: true, selfFarmingIncorporationDate: "2023-06-01", selfFarmingIncorporationLocation: "metro_or_city", selfFarmingStandardPriceAtAcquisition: "50000000", selfFarmingStandardPriceAtIncorporation: "80000000" },
  },
]);

const PUBLIC_EXPROPRIATION = table("public_expropriation", standalone("public_expropriation"), { expropriationCash: "100000000", expropriationApprovalDate: "2020-01-01" }, {}, [
  { name: "보상액", prop: "expropriationCash", message: /^현금 또는 채권 보상액/, patch: { expropriationCash: "0" } },
  { name: "사업인정고시일", prop: "expropriationApprovalDate", message: /^사업인정고시일을 선택하세요\.$/, patch: { expropriationApprovalDate: "" } },
  { name: "고시일 ≥ 양도일", prop: "expropriationApprovalDate", message: /^사업인정고시일은 양도일보다 이전/, patch: { expropriationApprovalDate: "2024-06-01" } },
]);

const gbOk = { gbBranch: "in_zone", gbPurchaseRoute: "negotiated", gbDesignationDate: "1990-01-01", gbTriggerDate: "2015-01-01" };
const GB_DESIGNATED = table("gb_designated_land", standalone("gb_designated_land"), gbOk, {}, [
  { name: "매수 경로", prop: "gbPurchaseRoute", message: /^개발제한구역 매수 경로/, patch: { gbPurchaseRoute: "" } },
  { name: "매수청구는 토지분만", prop: "gbPurchaseRoute", message: /^토지매수 청구\(개발제한구역법 §17\)/, patch: { gbPurchaseRoute: "claim" } },
  { name: "지정일", prop: "gbDesignationDate", message: /^개발제한구역 지정일/, patch: { gbDesignationDate: "" } },
  { name: "매수·협의매수일", prop: "gbTriggerDate", message: /^매수청구·협의매수일을 선택하세요/, patch: { gbTriggerDate: "" } },
  { name: "사업인정고시일(해제 후)", prop: "gbTriggerDate", message: /^사업인정고시일을 선택하세요\.$/, patch: { gbBranch: "released", gbTriggerDate: "" } },
  { name: "해제일", prop: "gbReleasedDate", message: /^개발제한구역 해제일/, patch: { gbBranch: "released", gbTriggerDate: "2018-01-01", gbReleasedDate: "" } },
]);

const REPLACEMENT_LAND = table("replacement_land_comp", standalone("replacement_land_comp"), { rlLandComp: "100000000" }, {}, [
  { name: "대토 보상액", prop: "rlLandComp", message: /^대토\(토지\) 보상액/, patch: { rlLandComp: "0" } },
]);

export const REDUCTION_FIELD_JUMP_CASES: FieldJumpCase[] = [
  ...NEW_99_3,
  ...NEW_99,
  ...UNSOLD_98_8,
  ...UNSOLD_98_3,
  ...UNSOLD_98_5,
  ...UNSOLD_98_6,
  ...UNSOLD_98_7,
  ...UNSOLD_99_2,
  ...RENTAL_97_3,
  ...RENTAL_97_4,
  ...RENTAL_97_5,
  ...RENTAL_97_MAIN,
  ...RENTAL_97_PROVISO,
  ...RENTAL_97_2,
  ...SELF_FARMING,
  ...PUBLIC_EXPROPRIATION,
  ...GB_DESIGNATED,
  ...REPLACEMENT_LAND,
];
