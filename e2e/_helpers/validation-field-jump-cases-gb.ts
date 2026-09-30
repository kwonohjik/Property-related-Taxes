/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 3 (gb)**. 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「gb: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: `transfer-tax-validate-gb.ts` · `-gb-carryover.ts` · `-gb-required.ts` · `-gb-sale.ts`.
 */
import { CARRYOVER_DEFAULTS } from "../../lib/stores/calc-wizard-asset-carryover";
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

/** 통과하는 일반건물(매매·실거래가·일괄 취득) — 한 칸씩 비운다 */
const gb = (over: Record<string, unknown> = {}) => () =>
  withPrimary({
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    landAcquisitionDate: "2015-03-01",
    gbLandArea: "200",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "100",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5000000",
    gbTransferBuildingValue: "300000000",
    gbAcqLandPricePerSqm: "2000000",
    gbAcqBuildingValue: "150000000",
    fixedAcquisitionPrice: "500000000",
    ...over,
  });

/**
 * 부담부증여 일반건물 — 부담부증여 검증(`validate-bg.ts`)이 통과하는 값.
 * ⚠️ gb.ts의 부담부증여 분기 중 평가모드·채무액·시가·취득시 기준시가 메시지는 bg 검증이 **먼저** 같은
 *    입력을 요구해 도달하지 않는다(probe 실측) — 케이스를 두지 않는다.
 */
const bgGb = (over: Record<string, unknown> = {}) =>
  gb({
    acquisitionCause: "gift",
    gbBuildingAcquisitionCause: "gift",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgLendingDepositTotal: "100000000",
    bgDonorRelation: "lineal_ascendant",
    ...over,
  });

/** 토지·건물 취득일 다름 — 두 파트 모두 매매·실거래가 */
const sep = (over: Record<string, unknown> = {}) =>
  gb({
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2012-03-01",
    acquisitionDate: "2015-03-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "200000000",
    fixedAcquisitionPrice: "",
    ...over,
  });

/** 상속(토지·건물 모두) — 통과하는 평가액 */
const inh = (over: Record<string, unknown> = {}) =>
  gb({
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    decedentAcquisitionDate: "2005-01-01",
    publishedValueAtInheritance: "300000000",
    gbBuildingInheritedValue: "100000000",
    fixedAcquisitionPrice: "",
    ...over,
  });

/** 이월과세 증여 정보 — 통과하는 값 */
const carry = (c: Record<string, unknown> = {}) => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2020-01-01",
  donorAcquisitionDate: "2010-01-01",
  donorRelation: "spouse",
  giftDateValuation: "300000000",
  donorAcquisitionPrice: "200000000",
  ...c,
});

/** 증축 — 환산 증축분이 통과하는 값 */
const ext = (over: Record<string, unknown> = {}) =>
  gb({
    gbHasExtension: true,
    gbOriginalBuildingArea: "200",
    gbExtensionDate: "2018-01-01",
    gbExtensionArea: "100",
    gbExtensionAcquisitionCause: "newConstruction",
    gbExtensionAcquisitionMode: "estimated",
    gbTransferExtensionBuildingStdPrice: "50000000",
    gbAcquisitionExtensionBuildingStdPrice: "40000000",
    ...over,
  });

/** 환산 + 주택→상가 최초공시 */
const fd = (over: Record<string, unknown> = {}) =>
  gb({
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    fixedAcquisitionPrice: "",
    gbHasFirstDisclosure: true,
    gbFirstDisclosureDate: "2006-04-28",
    gbFirstDisclosurePrice: "200000000",
    gbFirstDisclosureLandPricePerSqm: "2500000",
    gbFirstDisclosureBuildingStdPrice: "120000000",
    ...over,
  });

export const GB_FIELD_JUMP_CASES: FieldJumpCase[] = [
  // ── 기준시가·면적·용도지역 ──
  { name: "gb: gbLandArea", field: "gbLandArea", step: 0, assetIndex: A, message: /^자산: 토지면적을 입력하세요/, form: gb({ gbLandArea: "" }) },
  { name: "gb: gbBuildingFootprintArea", field: "gbBuildingFootprintArea", step: 0, assetIndex: A, message: /^자산: 건축물 바닥면적/, form: gb({ gbBuildingFootprintArea: "" }) },
  { name: "gb: gbZoneType", field: "gbZoneType", step: 0, assetIndex: A, message: /^자산: 용도지역을 선택하세요/, form: gb({ gbZoneType: "" }) },
  { name: "gb: gbTransferLandPricePerSqm", field: "gbTransferLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 양도시 토지 공시지가/, form: gb({ gbTransferLandPricePerSqm: "" }) },
  { name: "gb: gbTransferBuildingValue", field: "gbTransferBuildingValue", step: 0, assetIndex: A, message: /^자산: 양도시 건물기준시가 총액/, form: gb({ gbTransferBuildingValue: "" }) },

  { name: "gb: gbLandArea (부담부증여)", field: "gbLandArea", step: 0, assetIndex: A, message: /^자산: 토지면적을 입력하세요/, form: bgGb({ gbLandArea: "" }) },
  { name: "gb: gbTransferLandPricePerSqm (부담부증여)", field: "gbTransferLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 양도시 토지 공시지가/, form: bgGb({ gbTransferLandPricePerSqm: "" }) },
  { name: "gb: gbTransferBuildingValue (부담부증여)", field: "gbTransferBuildingValue", step: 0, assetIndex: A, message: /^자산: 양도시 건물기준시가 총액/, form: bgGb({ gbTransferBuildingValue: "" }) },
  { name: "gb: gbZoneType (부담부증여)", field: "gbZoneType", step: 0, assetIndex: A, message: /^자산: 용도지역을 선택하세요/, form: bgGb({ gbZoneType: "" }) },

  // ── 상속 ──
  {
    name: "gb: landAcqMode (상속 토지 환산 차단 · 분리 ON)", field: "landAcqMode", step: 0, assetIndex: A, message: /^자산: 상속으로 취득한 토지는/,
    form: inh({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-03-01", landAcqMode: "estimated", buildingAcqMode: "actual" }),
  },
  {
    name: "gb: buildingAcqMode (상속 건물 환산 차단 · 분리 ON)", field: "buildingAcqMode", step: 0, assetIndex: A, message: /^자산: 상속으로 취득한 건물은/,
    form: sep({ gbBuildingAcquisitionCause: "inheritance", buildingAcqMode: "estimated", gbBuildingDecedentAcquisitionDate: "2005-01-01", gbBuildingInheritedValue: "100000000" }),
  },
  {
    name: "gb: hasSeperateLandAcquisitionDate (한쪽만 상속 · 분리 OFF)", field: "hasSeperateLandAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 토지·건물 중 한쪽만 상속으로/,
    form: inh({ gbBuildingAcquisitionCause: "purchase" }),
    unreachableInUi: "세션 복원 마이그레이션 M-2b(`calc-wizard-asset-migrate-phase3.ts`)가 「분리 OFF + 토지·건물 취득원인 불일치」를 분리 ON으로 바꾸고, 화면의 분리 끄기(`setSeparate`)는 건물 취득원인을 토지 원인으로 맞춘다 — E2E 실측: 같은 입력을 세션에 넣으면 분리 ON으로 복원돼 「건물 취득가액」 오류가 뜬다",
  },
  { name: "gb: decedentAcquisitionDate (토지 상속)", field: "decedentAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 피상속인 취득일을 입력하세요/, form: inh({ decedentAcquisitionDate: "" }) },
  {
    name: "gb: gbBuildingDecedentAcquisitionDate (건물만 상속 · 분리 ON)", field: "gbBuildingDecedentAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 건물 피상속인 취득일/,
    form: sep({ gbBuildingAcquisitionCause: "inheritance", gbBuildingInheritedValue: "100000000" }),
  },
  { name: "gb: publishedValueAtInheritance", field: "publishedValueAtInheritance", step: 0, assetIndex: A, message: /^자산: 상속개시일 토지 평가액/, form: inh({ publishedValueAtInheritance: "" }) },
  { name: "gb: gbBuildingInheritedValue", field: "gbBuildingInheritedValue", step: 0, assetIndex: A, message: /^자산: 상속개시일 건물 신고가액/, form: inh({ gbBuildingInheritedValue: "" }) },
  {
    name: "gb: gbAcqLandPricePerSqm (1990 이전 상속 토지)", field: "gbAcqLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 취득시 토지 공시지가를 입력하세요\. 1990\.8\.30\. 개별공시지가 고시 전 상속/,
    form: inh({ acquisitionDate: "1985-06-01", landAcquisitionDate: "1985-06-01", decedentAcquisitionDate: "1980-01-01", gbAcqLandPricePerSqm: "" }),
  },
  {
    name: "gb: gbAcqBuildingValue (기준시가 고시 전 상속 건물)", field: "gbAcqBuildingValue", step: 0, assetIndex: A, message: /^자산: 취득시 건물기준시가 총액을 입력하세요\. 건물 기준시가 고시 전 상속/,
    // 자본적지출 — 이 칸(`GeneralBuildingBlock` ② 취득시)은 `showAcqStdPrice`일 때만 렌더된다. 실거래가 상속은
    // 일괄 가액·자본적지출이 없으면 칸이 없다(별건 결함 — 입력 경로 부재). 칸이 렌더되는 입력으로 둔다.
    form: inh({ acquisitionDate: "1995-06-01", landAcquisitionDate: "1995-06-01", decedentAcquisitionDate: "1990-01-01", gbAcqBuildingValue: "", capitalExpenditure: "1000000" }),
  },

  // ── 증여 ──
  {
    name: "gb: landAcqMode (증여 토지 환산 차단 · 분리 ON)", field: "landAcqMode", step: 0, assetIndex: A, message: /^자산: 증여로 취득한 토지는/,
    form: sep({ acquisitionCause: "gift", landAcqMode: "estimated" }),
  },
  {
    name: "gb: fixedAcquisitionPrice (증여 신고가액 · 분리 OFF)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 증여 신고가액\(취득가액\)을 입력하세요/,
    form: gb({ acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", fixedAcquisitionPrice: "" }),
  },
  {
    name: "gb: hasSeperateLandAcquisitionDate (고시 전 증여 · 분리 OFF)", field: "hasSeperateLandAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 증여일이 기준시가 고시 전이라/,
    form: gb({ acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", acquisitionDate: "1985-06-01", landAcquisitionDate: "1985-06-01" }),
  },
  {
    name: "gb: gbAcqLandPricePerSqm (1990 이전 증여 토지 · 분리 ON)", field: "gbAcqLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 취득시 토지 공시지가를 입력하세요\. 1990\.8\.30\. 개별공시지가 고시 전 증여/,
    form: sep({ acquisitionCause: "gift", landAcquisitionDate: "1985-06-01", gbAcqLandPricePerSqm: "" }),
  },
  {
    name: "gb: gbAcqBuildingValue (고시 전 증여 건물 · 분리 ON)", field: "gbAcqBuildingValue", step: 0, assetIndex: A, message: /^자산: 취득시 건물기준시가 총액을 입력하세요\. 건물 기준시가 고시 전 증여/,
    form: sep({ gbBuildingAcquisitionCause: "gift", landAcquisitionDate: "1995-01-01", acquisitionDate: "1995-06-01", gbAcqBuildingValue: "", capitalExpenditure: "1000000" }),
  },

  // ── 매매 일괄 · 분리 ──
  {
    name: "gb: fixedAcquisitionPrice (일괄 실지거래가액)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 취득가액을 입력하세요\. 토지·건물 일괄/,
    form: gb({ fixedAcquisitionPrice: "" }),
  },
  { name: "gb: landAcquisitionDate (분리)", field: "landAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 토지 취득일을 입력하세요/, form: sep({ landAcquisitionDate: "" }) },
  { name: "gb: acquisitionDate (분리 건물 취득일)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 건물 취득일을 입력하세요/, form: sep({ acquisitionDate: "" }) },
  {
    name: "gb: capitalExpenditure (분리 · 파트 모드 다름)", field: "capitalExpenditure", step: 0, assetIndex: A, message: /^자산: 토지·건물의 취득가액 산정 방식을 따로 정했으면 자본적지출/,
    form: sep({ capitalExpenditure: "10000000" }),
  },
  { name: "gb: landAcquisitionPrice (분리 토지 실가)", field: "landAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 토지 취득가액을 입력하세요/, form: sep({ landAcquisitionPrice: "" }) },
  { name: "gb: buildingAcquisitionPrice (분리 건물 실가)", field: "buildingAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 건물 취득가액을 입력하세요/, form: sep({ buildingAcquisitionPrice: "" }) },
  {
    name: "gb: buildingAcquisitionPrice (분리 건물 증여 신고가액)", field: "buildingAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 건물 증여 신고가액/,
    form: sep({ gbBuildingAcquisitionCause: "gift", buildingAcquisitionPrice: "" }),
  },

  // ── 환산 ──
  {
    name: "gb: gbBuildingArea (환산)", field: "gbBuildingArea", step: 0, assetIndex: A, message: /^자산: 건물 연면적을 입력하세요/,
    form: gb({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "", gbBuildingArea: "" }),
  },
  {
    name: "gb: gbAcqLandPricePerSqm (환산)", field: "gbAcqLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 취득시 토지 공시지가를 입력하세요\.$/,
    form: gb({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "", gbAcqLandPricePerSqm: "" }),
  },
  {
    name: "gb: gbAcqBuildingValue (환산)", field: "gbAcqBuildingValue", step: 0, assetIndex: A, message: /^자산: 취득시 건물기준시가 총액을 입력하세요\.$/,
    form: gb({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "", gbAcqBuildingValue: "" }),
  },
  {
    name: "gb: gbBuildingAcquisitionCause (환산 · 건물 취득원인 없음)", field: "gbBuildingAcquisitionCause", step: 0, assetIndex: A, message: /^자산: 건물 취득원인을 선택하세요/,
    form: gb({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "", gbBuildingAcquisitionCause: "" }),
    unreachableInUi: "세션 복원 마이그레이션 M-2(`calc-wizard-asset-migrate-phase3.ts`)가 빈·무효 건물 취득원인에 토지 원인을 복사하고, 화면의 라디오는 항상 한 값을 쓴다 — E2E 실측: 오류 항목이 뜨지 않음",
  },
  {
    name: "gb: acquisitionDate (환산 · 건물 신축 취득일)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 신축\(자가건축\) 취득원인을 선택했습니다/,
    // 분리 ON이면 「건물 취득일을 입력하세요」(`:356`)가 먼저 걸린다 — 분리 OFF + 환산에서만 닿는다
    form: gb({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "", acquisitionCause: "newConstruction", gbBuildingAcquisitionCause: "newConstruction", acquisitionDate: "" }),
    unreachableInUi: "건물 신축을 고르면 분리가 켜지고(`setUnifiedCause`) 분리 ON에서는 「건물 취득일을 입력하세요」가 먼저 걸린다. 분리 OFF + 건물 신축은 화면에서 만들 수 없다 — E2E 실측: 그 상태를 세션에 넣으면 건물 취득일 칸(앵커) 0개",
  },
  {
    name: "gb: acquisitionDate (건물 취득일 < 토지 취득일)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 건물 취득일은 토지 취득일/,
    form: sep({ gbBuildingAcquisitionCause: "newConstruction", buildingAcqMode: "estimated", acquisitionDate: "2010-01-01" }),
  },

  // ── 실거래가 안분 기준 ──
  {
    name: "gb: gbAcqLandPricePerSqm (실가 안분 기준)", field: "gbAcqLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 취득시 토지 공시지가를 입력하세요 — 취득가액·자본적지출을/,
    form: gb({ gbAcqLandPricePerSqm: "" }),
  },
  {
    name: "gb: gbAcqBuildingValue (실가 안분 기준)", field: "gbAcqBuildingValue", step: 0, assetIndex: A, message: /^자산: 취득시 건물기준시가 총액을 입력하세요 — 취득가액·자본적지출을/,
    form: gb({ gbAcqBuildingValue: "" }),
  },
  { name: "gb: acquisitionDate", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 취득일을 입력하세요/, form: gb({ acquisitionDate: "", landAcquisitionDate: "" }) },
  {
    name: "gb: partialAcqDistinct", field: "partialAcqDistinct", step: 0, assetIndex: A, message: /^자산: 일부 양도 — 「양도분 취득가액이 구분되는가」/,
    form: gb({ areaScenario: "partial" }),
  },

  // ── 증축 ──
  {
    name: "gb: fixedAcquisitionPrice (증축 · 토지·원건물 일괄)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 토지·건물 일괄 취득가액을 입력하세요/,
    form: ext({ fixedAcquisitionPrice: "" }),
  },
  { name: "gb: gbExtensionDate", field: "gbExtensionDate", step: 0, assetIndex: A, message: /^자산: 증축일을 입력하세요/, form: ext({ gbExtensionDate: "" }) },
  { name: "gb: gbExtensionAcquisitionCause", field: "gbExtensionAcquisitionCause", step: 0, assetIndex: A, message: /^자산: 증축 취득원인을 선택하세요/, form: ext({ gbExtensionAcquisitionCause: "" }) },
  {
    name: "gb: gbTransferExtensionBuildingStdPrice (환산)", field: "gbTransferExtensionBuildingStdPrice", step: 0, assetIndex: A, message: /^자산: 양도시 건물2 기준시가 총액\(원\)을 입력하세요\. ㎡당/,
    form: ext({ gbTransferExtensionBuildingStdPrice: "" }),
  },
  {
    name: "gb: gbAcquisitionExtensionBuildingStdPrice", field: "gbAcquisitionExtensionBuildingStdPrice", step: 0, assetIndex: A, message: /^자산: 취득시\(증축시\) 건물2 기준시가/,
    form: ext({ gbAcquisitionExtensionBuildingStdPrice: "" }),
  },
  {
    name: "gb: gbTransferExtensionBuildingStdPrice (실가)", field: "gbTransferExtensionBuildingStdPrice", step: 0, assetIndex: A, message: /^자산: 양도시 건물2 기준시가 총액\(원\)을 입력하세요 — 양도가액을/,
    form: ext({ gbExtensionAcquisitionMode: "actual", gbTransferExtensionBuildingStdPrice: "", gbExtensionActualAcquisitionPrice: "50000000" }),
  },
  {
    name: "gb: gbExtensionActualAcquisitionPrice", field: "gbExtensionActualAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 증축 실거래가/,
    form: ext({ gbExtensionAcquisitionMode: "actual", gbExtensionActualAcquisitionPrice: "" }),
  },
  {
    name: "gb: gbExtensionAcquisitionMode", field: "gbExtensionAcquisitionMode", step: 0, assetIndex: A, message: /^자산: 증축분 취득방식/,
    form: ext({ gbExtensionAcquisitionMode: "bogus" }),
  },
  { name: "gb: gbExtensionDate (취득일 이전)", field: "gbExtensionDate", step: 0, assetIndex: A, message: /^자산: 증축일은 토지·건물1 취득일/, form: ext({ gbExtensionDate: "2014-01-01" }) },
  { name: "gb: gbExtensionDate (양도일 이후)", field: "gbExtensionDate", step: 0, assetIndex: A, message: /^자산: 증축일은 양도일/, form: ext({ gbExtensionDate: "2024-06-01" }) },

  // ── 주택→상가 용도변경 ──
  {
    name: "gb: gbConversionDate", field: "gbConversionDate", step: 0, assetIndex: A, message: /^자산: 주택→상가 용도변경을 선택했습니다/,
    form: gb({ gbHouseToCommercialConversion: true, gbConversionDate: "", gbWasMultiHouseAtConversion: false }),
  },
  {
    name: "gb: gbConversionDate (건물 취득일 이전)", field: "gbConversionDate", step: 0, assetIndex: A, message: /^자산: 용도변경일은 건물 취득일/,
    form: gb({ gbHouseToCommercialConversion: true, gbConversionDate: "2010-01-01", gbWasMultiHouseAtConversion: false }),
  },
  {
    name: "gb: gbConversionDate (양도일 이후)", field: "gbConversionDate", step: 0, assetIndex: A, message: /^자산: 용도변경일은 양도일/,
    form: gb({ gbHouseToCommercialConversion: true, gbConversionDate: "2024-06-01", gbWasMultiHouseAtConversion: false }),
  },
  {
    name: "gb: gbWasMultiHouseAtConversion", field: "gbWasMultiHouseAtConversion", step: 0, assetIndex: A, message: /^자산: 변경 당시 다주택자 여부/,
    form: gb({ gbHouseToCommercialConversion: true, gbConversionDate: "2018-01-01" }),
  },

  // ── 최초공시(§99-164-10) ──
  { name: "gb: gbFirstDisclosurePrice", field: "gbFirstDisclosurePrice", step: 0, assetIndex: A, message: /^자산: 최초공시주택가격을 입력하세요/, form: fd({ gbFirstDisclosurePrice: "" }) },
  {
    name: "gb: gbFirstDisclosureLandPricePerSqm", field: "gbFirstDisclosureLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 최초공시 당시 토지 공시지가/,
    form: fd({ gbFirstDisclosureLandPricePerSqm: "" }),
  },
  {
    name: "gb: gbFirstDisclosureBuildingStdPrice", field: "gbFirstDisclosureBuildingStdPrice", step: 0, assetIndex: A, message: /^자산: 최초공시 당시 건물 기준시가/,
    form: fd({ gbFirstDisclosureBuildingStdPrice: "" }),
  },

  // ── 이월과세 ──
  {
    name: "gb: acquisitionCause (이월과세 관계 그 외 · 토지)", field: "acquisitionCause", step: 0, assetIndex: A, message: /^자산: 이월과세는 배우자 또는 직계존비속/,
    form: gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: carry({ donorRelation: "other" }) }),
  },
  {
    name: "gb: gbBuildingAcquisitionCause (이월과세 관계 그 외 · 건물만)", field: "gbBuildingAcquisitionCause", step: 0, assetIndex: A, message: /^자산: 이월과세는 배우자 또는 직계존비속/,
    // 건물만 이월과세면 사건 정보(관계 포함)는 건물 블록 = `buildingCarryover`에 있다(G1 · `gbCarryoverEventSource`)
    form: sep({ gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: carry({ donorRelation: "other" }) }),
  },
  {
    name: "gb: carryover.donorRelation", field: "carryover.donorRelation", step: 0, assetIndex: A, message: /^자산: 증여자와의 관계를 선택하세요/,
    form: gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: carry({ donorRelation: "", donorDeceased: true }) }),
  },
  {
    name: "gb: carryover.giftRegistryDate", field: "carryover.giftRegistryDate", step: 0, assetIndex: A, message: /^자산: 증여 등기접수일을 입력하세요/,
    form: gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: carry({ giftRegistryDate: "" }) }),
  },
  {
    name: "gb: carryover.donorAcquisitionDate (토지)", field: "carryover.donorAcquisitionDate", step: 0, assetIndex: A, message: /^자산 토지: 증여자의 취득일/,
    form: gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: carry({ donorAcquisitionDate: "" }) }),
  },
  {
    name: "gb: carryover.giftDateValuation (토지)", field: "carryover.giftDateValuation", step: 0, assetIndex: A, message: /^자산 토지: 증여 당시 평가액/,
    form: gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: carry({ giftDateValuation: "" }) }),
  },
  {
    name: "gb: carryover.estimationMode (토지)", field: "carryover.estimationMode", step: 0, assetIndex: A, message: /^자산 토지: 증여자 취득가액의 환산 방식/,
    form: gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: carry({ useEstimatedAcquisition: true }) }),
  },
  {
    name: "gb: carryover.donorStandardPriceAtAcquisition (토지)", field: "carryover.donorStandardPriceAtAcquisition", step: 0, assetIndex: A, message: /^자산 토지: 증여자 취득 당시 기준시가/,
    form: gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: carry({ useEstimatedAcquisition: true, estimationMode: "general" }) }),
  },
  {
    name: "gb: carryover.donorAcquisitionPrice (토지)", field: "carryover.donorAcquisitionPrice", step: 0, assetIndex: A, message: /^자산 토지: 증여자의 취득가액/,
    form: gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: carry({ donorAcquisitionPrice: "" }) }),
  },
  {
    name: "gb: buildingCarryover.donorAcquisitionDate (건물 · 분리 ON)", field: "buildingCarryover.donorAcquisitionDate", step: 0, assetIndex: A, message: /^자산 건물: 증여자의 취득일/,
    form: sep({
      acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", fixedAcquisitionPrice: "",
      carryover: carry(), buildingCarryover: carry({ donorAcquisitionDate: "" }),
    }),
  },
  {
    name: "gb: buildingCarryover.giftDateValuation (건물 · 분리 ON)", field: "buildingCarryover.giftDateValuation", step: 0, assetIndex: A, message: /^자산 건물: 증여 당시 평가액/,
    form: sep({
      acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift",
      carryover: carry(), buildingCarryover: carry({ giftDateValuation: "" }),
    }),
  },
  {
    name: "gb: buildingCarryover.donorAcquisitionPrice (건물 · 분리 ON)", field: "buildingCarryover.donorAcquisitionPrice", step: 0, assetIndex: A, message: /^자산 건물: 증여자의 취득가액/,
    form: sep({
      acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift",
      carryover: carry(), buildingCarryover: carry({ donorAcquisitionPrice: "" }),
    }),
  },
  {
    name: "gb: buildingCarryover.estimationMode (건물 · 분리 ON)", field: "buildingCarryover.estimationMode", step: 0, assetIndex: A, message: /^자산 건물: 증여자 취득가액의 환산 방식/,
    form: sep({
      acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift",
      carryover: carry(), buildingCarryover: carry({ useEstimatedAcquisition: true }),
    }),
  },
  {
    name: "gb: buildingCarryover.donorStandardPriceAtAcquisition (건물 · 분리 ON)", field: "buildingCarryover.donorStandardPriceAtAcquisition", step: 0, assetIndex: A, message: /^자산 건물: 증여자 취득 당시 기준시가/,
    form: sep({
      acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift",
      carryover: carry(), buildingCarryover: carry({ useEstimatedAcquisition: true, estimationMode: "general" }),
    }),
  },

  // ── 양도가액 토지·건물 구분 ──
  {
    name: "gb: buildingAppraisalAtTransfer (감정평가 한쪽만)", field: "buildingAppraisalAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도시 감정평가가액은 토지·건물 양쪽/,
    form: gb({ saleSplitMode: "appraisal", landAppraisalAtTransfer: "500000000" }),
  },
  {
    name: "gb: landAppraisalAtTransfer (감정평가 한쪽만)", field: "landAppraisalAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도시 감정평가가액은 토지·건물 양쪽/,
    form: gb({ saleSplitMode: "appraisal", buildingAppraisalAtTransfer: "500000000" }),
  },
  {
    name: "gb: saleSplitMode (증축 + 감정평가)", field: "saleSplitMode", step: 0, assetIndex: A, message: /^자산: 증축이 있는 건물에서는 감정평가가액으로/,
    form: ext({ saleSplitMode: "appraisal", landAppraisalAtTransfer: "500000000", buildingAppraisalAtTransfer: "300000000" }),
  },
  {
    name: "gb: saleSplitExemptionNote", field: "saleSplitExemptionNote", step: 0, assetIndex: A, message: /^자산: 「소득세법 시행령」 제166조 제8항 예외를 선택했으면/,
    form: gb({ saleSplitMode: "actual", landTransferPrice: "600000000", buildingTransferPrice: "400000000", saleSplitExemption: true, saleSplitExemptionNote: "" }),
  },
];
