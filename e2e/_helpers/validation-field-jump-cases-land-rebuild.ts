/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **구주택 멸실·신축 통산**(해석 (5)). 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「rb: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: `transfer-tax-validate-land-rebuild.ts`(엔진·⑫와 같은 leaf `collectLandRebuildIssues`의 첫 위반을 칸에 붙인다).
 * 호스트 두 곳(신축 + 토지 상속·증여 / 매매 + 취득일 다름) 모두 같은 블록·같은 앵커다. 이동 앵커는 화면에 각 1개씩 있다(`RebuiltHouseLandBlock`) — 토글 앵커(`landRebuildEnabled`)는 호스트가 닫힌 구조 위반 전용이라 UI에서 도달하지 않는다.
 */
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

/** 통과하는 통산 입력 — 신축 2023-01-01(사용승인) · 토지 2018-01-01 상속(피상속인 2005-01-01) · 양도 5억(토지 3억 + 건물 2억) · 멸실 2021-06-30 · 양도일 2024-03-01 */
const rbAsset = (over: Record<string, unknown> = {}) => ({
  assetKind: "housing",
  acquisitionCause: "newConstruction",
  occupancyApprovalDate: "2023-01-01",
  acquisitionDate: "2023-01-01",
  fixedAcquisitionPrice: "150000000",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2018-01-01",
  landAcquisitionCause: "inheritance",
  landCauseHost: "newConstruction",
  landDecedentAcquisitionDate: "2005-01-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "100000000",
  saleSplitMode: "actual",
  landTransferPrice: "300000000",
  buildingTransferPrice: "200000000",
  landStandardPriceAtTransfer: "300000000",
  buildingStandardPriceAtTransfer: "200000000",
  landRebuildEnabled: true,
  landRebuildStartMode: "since_land",
  landRebuildDemolitionDate: "2021-06-30",
  landRebuildFootprintUnchanged: true,
  ...over,
});
const rb = (over: Record<string, unknown> = {}) => () => withPrimary(rbAsset(over));
/** 매매 호스트 — 취득원인 매매 + 「토지·건물 취득일 다름」 · 토지 overlay 없음. 건물 취득일(2023-01-01)이 신축 취득일이다(건물 취득가액은 파트 칸). */
const rbBuy = (over: Record<string, unknown> = {}) => () =>
  withPrimary(
    rbAsset({
      acquisitionCause: "purchase",
      occupancyApprovalDate: "",
      fixedAcquisitionPrice: "",
      buildingAcquisitionPrice: "150000000",
      landAcquisitionCause: "",
      landCauseHost: "",
      landDecedentAcquisitionDate: "",
      ...over,
    }),
  );

export const LAND_REBUILD_FIELD_JUMP_CASES: FieldJumpCase[] = [
  { name: "rb: landRebuildStartMode (미선택)", field: "landRebuildStartMode", step: 0, assetIndex: A, message: /^자산: 구주택이 토지 취득 때부터 있었는지/, form: rb({ landRebuildStartMode: "" }) },
  { name: "rb: landRebuildPriorHouseStartDate (later인데 비움)", field: "landRebuildPriorHouseStartDate", step: 0, assetIndex: A, message: /^자산: 구주택이 토지 취득 뒤에 생겼다면 구주택 취득일/, form: rb({ landRebuildStartMode: "later", landRebuildPriorHouseStartDate: "" }) },
  { name: "rb: landRebuildDemolitionDate (비움)", field: "landRebuildDemolitionDate", step: 0, assetIndex: A, message: /^자산: 구주택 멸실일이 필요합니다/, form: rb({ landRebuildDemolitionDate: "" }) },
  { name: "rb: landRebuildDemolitionDate (신축 취득일 이후)", field: "landRebuildDemolitionDate", step: 0, assetIndex: A, message: /^자산: 날짜 순서가 맞지 않습니다/, form: rb({ landRebuildDemolitionDate: "2023-02-01" }) },
  { name: "rb: landRebuildFootprintUnchanged (정착면적 미확인)", field: "landRebuildFootprintUnchanged", step: 0, assetIndex: A, message: /^자산: 신축주택의 정착면적이 구주택보다 늘어난 경우는 계산하지 않습니다/, form: rb({ landRebuildFootprintUnchanged: false }) },
  // ── 매매 호스트 — 같은 칸 앵커가 매매 블록(날짜 2열 직후)에서도 화면에 있다 ──
  { name: "rb: 매매 호스트 landRebuildStartMode (미선택)", field: "landRebuildStartMode", step: 0, assetIndex: A, message: /^자산: 구주택이 토지 취득 때부터 있었는지/, form: rbBuy({ landRebuildStartMode: "" }) },
  { name: "rb: 매매 호스트 landRebuildDemolitionDate (건물 취득일 이후)", field: "landRebuildDemolitionDate", step: 0, assetIndex: A, message: /^자산: 날짜 순서가 맞지 않습니다/, form: rbBuy({ landRebuildDemolitionDate: "2023-02-01" }) },
  { name: "rb: 매매 호스트 landRebuildFootprintUnchanged (정착면적 미확인)", field: "landRebuildFootprintUnchanged", step: 0, assetIndex: A, message: /^자산: 신축주택의 정착면적이 구주택보다 늘어난 경우는 계산하지 않습니다/, form: rbBuy({ landRebuildFootprintUnchanged: false }) },
];
