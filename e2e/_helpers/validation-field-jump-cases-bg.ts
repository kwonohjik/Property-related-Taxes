/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 3 (bg)**. 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「bg: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: `lib/calc/transfer-tax-validate-bg.ts`(부담부증여 — 소령 §159). 한 메시지 = 한 케이스.
 */
import { CARRYOVER_DEFAULTS } from "../../lib/stores/calc-wizard-asset-carryover";
import { bundle, withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

/** 0~3단계를 통과하는 부담부증여 주택(기준시가 모드) — probe 실측 */
const bgAsset = (patch: Record<string, unknown> = {}) => ({
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_standard",
  bgLendingDepositTotal: "100000000",
  bgDonorRelation: "lineal_descendant",
  standardPriceAtAcq: "100000000",
  standardPriceAtTransfer: "300000000",
  ...patch,
});
const bg = (patch: Record<string, unknown> = {}) => () => withPrimary(bgAsset(patch));
/** 시가 모드 — 양도시 시가 + 취득가액 산정방식 */
const market = (patch: Record<string, unknown> = {}) =>
  bg({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200000000", ...patch });
/** 이월과세(당초 증여자) — 부담부증여 검증이 당초 증여자 취득 당시 값을 먼저 요구한다 */
const carry = (patch: Record<string, unknown> = {}) =>
  bg({
    acquisitionCause: "carryover_gift",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2014-01-01", donorAcquisitionDate: "2010-01-01", donorRelation: "spouse", giftDateValuation: "300000000", donorAcquisitionPrice: "200000000" },
    ...patch,
  });
const priorRow = (patch: Record<string, unknown>) => ({ giftDate: "2020-01-01", giftAmount: "100000000", giftTaxPaid: "", computedTax: "5000000", giftTaxBase: "50000000", ...patch });

export const BG_FIELD_JUMP_CASES: FieldJumpCase[] = [
  { name: "bg: 평가 유형", field: "bgValuationMode", step: 0, assetIndex: A, message: /^자산: 부담부증여 평가 유형/, form: bg({ bgValuationMode: "" }) },
  { name: "bg: 인수 채무액", field: "bgLendingDepositTotal", step: 0, assetIndex: A, message: /^자산: 부담부증여 인수 채무액\(임대보증금 \+ 담보차입금\)을 입력하세요\.$/, form: bg({ bgLendingDepositTotal: "" }) },
  {
    name: "bg: 인수 채무액 (함께 부담부증여)", field: "bgLendingDepositTotal", step: 0, assetIndex: 0, message: /^자산 1: 부담부증여 인수 채무액.*여러 물건을/,
    form: () => {
      const f = bundle(bgAsset({ bgLendingDepositTotal: "" }));
      return { ...f, assets: [{ ...f.assets[0], ...bgAsset({ bgLendingDepositTotal: "" }) }, f.assets[1]] };
    },
  },
  { name: "bg: 시가 모드 양도시 시가", field: "bgMarketValueAtTransfer", step: 0, assetIndex: A, message: /^자산: 부담부증여 시가 모드 — 양도시 시가/, form: market({ bgMarketValueAtTransfer: "" }) },
  { name: "bg: 시가 모드 취득가액 산정방식", field: "bgAcquisitionMethod", step: 0, assetIndex: A, message: /^자산: 부담부증여 시가 모드 — 취득가액 산정방식/, form: market({ bgAcquisitionMethod: "" }) },
  { name: "bg: 실지취득가액 (주택)", field: "bgActualAcquisitionTotal", step: 0, assetIndex: A, message: /^자산: 부담부증여 실지취득가액 안분 — 실지취득가액을/, form: market({ bgActualAcquisitionTotal: "" }) },
  {
    name: "bg: 실지취득가액 (토지)", field: "bgActualAcquisitionLand", step: 0, assetIndex: A, message: /^자산: 부담부증여 실지취득가액 안분 — 토지 실지취득가액/,
    form: market({ assetKind: "land", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "" }),
  },
  {
    name: "bg: 실지취득가액 (일반건물)", field: "bgActualAcquisitionLand", step: 0, assetIndex: A, message: /^자산: 부담부증여 실지취득가액 안분 — 토지 또는 건물/,
    form: market({ assetKind: "general_building", bgActualAcquisitionTotal: "" }),
  },
  {
    name: "bg: 상속 자산 환산 불가", field: "bgAcquisitionMethod", step: 0, assetIndex: A, message: /^자산: 상속받은 자산은 상속개시일 현재/,
    form: market({ acquisitionCause: "inheritance", bgAcquisitionMethod: "converted" }),
  },
  { name: "bg: 증여자-수증자 관계", field: "bgDonorRelation", step: 0, assetIndex: A, message: /^자산: 부담부증여 — 증여자-수증자 관계/, form: bg({ bgDonorRelation: "" }) },
  {
    name: "bg: 일반건물 취득시 토지 공시지가", field: "gbAcqLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 부담부증여 — 취득시 토지 ㎡당 공시지가/,
    form: bg({ assetKind: "general_building", gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "50000000" }),
  },
  {
    name: "bg: 일반건물 취득시 건물 기준시가", field: "gbAcqBuildingValue", step: 0, assetIndex: A, message: /^자산: 부담부증여 — 취득시 건물 기준시가/,
    form: bg({ assetKind: "general_building", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "" }),
  },
  { name: "bg: 기준시가 모드 취득시 기준시가 (주택)", field: "standardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 부담부증여 기준시가 모드 — 「② 양도정보」의 취득시 기준시가/, form: bg({ standardPriceAtAcq: "" }) },
  {
    name: "bg: 기준시가 모드 취득시 기준시가 (토지)", field: "standardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 부담부증여 기준시가 모드 — 취득시 기준시가\(또는/,
    form: bg({ assetKind: "land", standardPriceAtAcq: "", standardPricePerSqmAtAcq: "" }),
  },
  {
    name: "bg: 입주권 조합원권리가액", field: "bgRightMemberRightsValue", step: 0, assetIndex: A, message: /^자산: 조합원입주권 증여재산 평가 — 조합원권리가액/,
    form: bg({ assetKind: "right_to_move_in", bgRightMemberRightsValue: "", redevRightsValue: "" }),
  },
  {
    name: "bg: 입주권 종전 부동산 실지취득가액", field: "bgActualAcquisitionTotal", step: 0, assetIndex: A, message: /^자산: 조합원입주권 부담부증여 — 종전 부동산의 실지취득가액/,
    form: bg({ assetKind: "right_to_move_in", bgRightMemberRightsValue: "300000000", bgActualAcquisitionTotal: "" }),
  },
  { name: "bg: 사전증여 가액", field: "bgPriorGifts.0.giftAmount", step: 0, assetIndex: A, message: /^자산: 사전증여 #1 — 증여일이 입력되었으나/, form: bg({ bgPriorGifts: [priorRow({ giftAmount: "" })] }) },
  { name: "bg: 사전증여 증여일", field: "bgPriorGifts.0.giftDate", step: 0, assetIndex: A, message: /^자산: 사전증여 #1 — 증여재산가액이 입력되었으나/, form: bg({ bgPriorGifts: [priorRow({ giftDate: "" })] }) },
  { name: "bg: 사전증여 산출세액", field: "bgPriorGifts.0.computedTax", step: 0, assetIndex: A, message: /^자산: 사전증여 #1 — §58 기납부세액공제/, form: bg({ bgPriorGifts: [priorRow({ computedTax: "" })] }) },
  { name: "bg: 사전증여 과세표준", field: "bgPriorGifts.0.giftTaxBase", step: 0, assetIndex: A, message: /^자산: 사전증여 #1 — §58 한도 산정/, form: bg({ bgPriorGifts: [priorRow({ giftTaxBase: "" })] }) },
  { name: "bg: 당초 증여자 토지 기준시가", field: "bgCoDonorLandStdPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 이월과세가 적용되므로 「당초 증여자」.*취득 당시 토지·건물 기준시가/, form: carry() },
  {
    name: "bg: 당초 증여자 건물 기준시가", field: "bgCoDonorBuildingStdPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 이월과세가 적용되므로 「당초 증여자」.*취득 당시 토지·건물 기준시가/,
    form: carry({ bgCoDonorLandStdPriceAtAcq: "50000000" }),
  },
  {
    name: "bg: 당초 증여자 실지취득가액 (주택)", field: "bgCoDonorActualAcquisitionTotal", step: 0, assetIndex: A, message: /^자산: 이월과세가 적용되므로 「당초 증여자」.*실지취득가액/,
    form: carry({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200000000" }),
  },
  {
    name: "bg: 당초 증여자 시가 평가액", field: "bgCoDonorMarketValueAtAcquisition", step: 0, assetIndex: A, message: /^자산: 이월과세가 적용되므로 「당초 증여자」.*취득 당시 시가 평가액/,
    form: carry({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgAcquisitionMethod: "" }),
  },
];
