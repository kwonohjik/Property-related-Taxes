/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 3 (redev)**. 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「redev: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: `transfer-tax-validate-redev.ts`(재개발·재건축 §166) · `-successor-right.ts`(승계조합원 입주권 §97①1호 가목)
 * · `transfer-tax-validate-acquisition.ts`의 재개발 분기 「취득일을 입력하세요」.
 */
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

/** 원조합원 완공 APT 양도 — 주택 출자 · 청산금 납부 · 실가. 통과하는 입력에서 한 칸씩 바꾼다. */
const apt = (patch: Record<string, unknown> = {}, formPatch: Record<string, unknown> = {}) => () =>
  withPrimary(
    {
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
      redevApprovalLawBasis: "urban_renovation_art_74",
      redevOriginalAssetType: "housing",
      redevSettlementDirection: "pay",
      redevSettlementAmount: "50000000",
      acquisitionDate: "2015-03-01",
      redevApprovalDate: "2018-03-01",
      redevRightsValue: "300000000",
      redevPreApprovalExpenses: "0",
      redevActualAcquisitionPrice: "200000000",
      useEstimatedAcquisition: false,
      ...patch,
    },
    formPatch,
  );

/** 조합원입주권(원조합원) 양도 */
const right = (patch: Record<string, unknown> = {}) =>
  apt({ assetKind: "right_to_move_in", redevSubject: "right", ...patch });

/** 토지 출자 */
const land = (patch: Record<string, unknown> = {}) => apt({ redevOriginalAssetType: "land", ...patch });

/** 완공 APT + 환산 — 최초공시일 이후 취득(§164⑦ 미발동) */
const est = (patch: Record<string, unknown> = {}) =>
  apt({
    useEstimatedAcquisition: true,
    redevManagementDisposalHousingPrice: "300000000",
    redevAcquisitionHousingPrice: "150000000",
    ...patch,
  });

/** 완공 APT + 환산 + §164⑦ 본문 발동(취득일 < 최초공시일) */
const phd = (patch: Record<string, unknown> = {}) =>
  est({
    acquisitionDate: "2000-03-01",
    redevFirstDisclosureDate: "2005-04-30",
    redevFirstDisclosureHousingPrice: "100000000",
    redevLandArea: "100",
    redevLandPricePerSqmAtAcq: "500000",
    redevBuildingStdPriceAtAcq: "20000000",
    redevLandPricePerSqmAtFirst: "600000",
    redevBuildingStdPriceAtFirst: "25000000",
    ...patch,
  });

/** 승계조합원 완공 APT(②-a 승계조합원 모드) — 매매 */
const successorApt = (patch: Record<string, unknown> = {}) =>
  apt({
    redevIsSuccessorMember: "yes",
    acquisitionDate: "2019-03-01",
    redevCompletionDate: "2021-03-01",
    redevSettlementAmount: "0",
    fixedAcquisitionPrice: "400000000",
    ...patch,
  });

/** 승계조합원 입주권(① 기본정보 「조합원 유형」=승계) — §97①1호 가목 */
const successorRight = (patch: Record<string, unknown> = {}) => () =>
  withPrimary({
    assetKind: "right_to_move_in",
    isSuccessorRightToMoveIn: true,
    redevSubject: "right",
    acquisitionDate: "2020-05-01",
    redevApprovalDate: "2018-10-23",
    successorRightAcqPrice: "350000000",
    successorRightAddedContribution: "",
    useEstimatedAcquisition: false,
    ...patch,
  });

/** 1세대1주택 — 거주기간·사실상 주거용 카드의 렌더 조건(폼 전역 `isOneHouseSingle`) */
const ONE_HOUSE = { isOneHousehold: true, householdHousingCount: "1" };

const NEGATIVE =
  "금액 칸(`CurrencyInput`)은 `allowNegative` 없이 쓰여 「-」를 지운다 — 사용자가 음수를 넣을 수 없다";
const MONTHS =
  "개월 수 칸(`DecimalInput`)은 숫자·소수점 외 문자를 지운다 — 음수·비숫자를 넣을 수 없다";

export const REDEV_FIELD_JUMP_CASES: FieldJumpCase[] = [
  // ── 재개발 분기의 취득일(acquisition.ts) ──
  { name: "redev: acquisitionDate (재개발 취득일)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 취득일을 입력하세요/, form: apt({ acquisitionDate: "" }) },

  // ── §163⑨ 증여 + 환산 ──
  {
    name: "redev: useEstimatedAcquisition (증여 종전자산 환산 차단)", field: "useEstimatedAcquisition", step: 0, assetIndex: A,
    message: /^자산: 증여 취득 종전자산은 환산취득가를/, form: apt({ acquisitionCause: "gift", useEstimatedAcquisition: true }),
  },
  // ── 입주권 · 청산금 수령 ──
  {
    name: "redev: redevSettlementAmount (입주권 수령액)", field: "redevSettlementAmount", step: 0, assetIndex: A,
    message: /^자산: 청산금 수령 방향인 경우 청산금 수령액/, form: right({ redevSettlementDirection: "receive", redevSettlementAmount: "" }),
  },
  // ── 인가일 이후 사실상 주거용 사용 ──
  {
    name: "redev: redevPostApprovalHousingUseEndDate (미입력)", field: "redevPostApprovalHousingUseEndDate", step: 0, assetIndex: A,
    message: /^자산: 인가일 이후 사실상 주거용 사용을 선택했으면/,
    form: apt({ redevSettlementDirection: "receive", redevSettlementSaleDate: "2021-06-01", redevPostApprovalHousingUse: "yes", redevPostApprovalHousingUseEndDate: "" }, ONE_HOUSE),
  },
  {
    name: "redev: redevPostApprovalHousingUseEndDate (인가일 이전)", field: "redevPostApprovalHousingUseEndDate", step: 0, assetIndex: A,
    message: /^자산: 사실상 주거용 사용 종료일은 관리처분계획인가일 이후/,
    form: apt({ redevSettlementDirection: "receive", redevSettlementSaleDate: "2021-06-01", redevPostApprovalHousingUse: "yes", redevPostApprovalHousingUseEndDate: "2017-01-01" }, ONE_HOUSE),
  },

  // ── 토지 출자 ──
  {
    name: "redev: useEstimatedAcquisition (토지+입주권+수령+환산 미지원)", field: "useEstimatedAcquisition", step: 0, assetIndex: A,
    message: /^자산: 토지 출자 \+ 입주권 양도 \+ 청산금 수령/,
    form: land({ assetKind: "right_to_move_in", redevSubject: "right", redevSettlementDirection: "receive", useEstimatedAcquisition: true }),
  },
  {
    name: "redev: redevSettlementSaleDate (토지 출자)", field: "redevSettlementSaleDate", step: 0, assetIndex: A,
    message: /^자산: 청산금 수령 시 소유권이전 고시일/, form: land({ redevSettlementDirection: "receive", redevSettlementSaleDate: "" }),
  },
  {
    name: "redev: redevActualAcquisitionPrice (토지 출자)", field: "redevActualAcquisitionPrice", step: 0, assetIndex: A,
    message: /^자산: 실가 모드 — 종전 자산 취득가액/, form: land({ redevActualAcquisitionPrice: "" }),
  },
  { name: "redev: redevLandArea (토지 출자 §166③)", field: "redevLandArea", step: 0, assetIndex: A, message: /^자산: 토지면적\(㎡\)을 입력하세요/, form: land({ useEstimatedAcquisition: true }) },
  {
    name: "redev: redevLandPricePerSqmAtAcq (토지 출자 §166③ 분자)", field: "redevLandPricePerSqmAtAcq", step: 0, assetIndex: A,
    message: /^자산: 취득당시 토지 ㎡당 단가/, form: land({ useEstimatedAcquisition: true, redevLandArea: "100" }),
  },
  {
    name: "redev: redevLandPricePerSqmAtApproval (토지 출자 §166③ 분모)", field: "redevLandPricePerSqmAtApproval", step: 0, assetIndex: A,
    message: /^자산: 관리처분 직전 토지 ㎡당 단가/, form: land({ useEstimatedAcquisition: true, redevLandArea: "100", redevLandPricePerSqmAtAcq: "500000" }),
  },

  // ── 일정 ──
  { name: "redev: redevApprovalDate (미입력)", field: "redevApprovalDate", step: 0, assetIndex: A, message: /^자산: 관리처분\/사업시행계획 인가일/, form: apt({ redevApprovalDate: "" }) },
  {
    name: "redev: redevApprovalDate (취득일 이전)", field: "redevApprovalDate", step: 0, assetIndex: A,
    message: /^자산: 인가일은 취득일 이후여야 합니다/, form: apt({ acquisitionDate: "2019-01-01" }),
  },

  // ── 승계조합원 모드(완공 APT) ──
  { name: "redev: redevCompletionDate (승계 준공일)", field: "redevCompletionDate", step: 0, assetIndex: A, message: /^자산: 승계조합원 모드 — 준공일/, form: successorApt({ redevCompletionDate: "" }) },
  {
    name: "redev: redevCompletionDate (인가일 이전)", field: "redevCompletionDate", step: 0, assetIndex: A,
    message: /^자산: 준공일은 관리처분 인가일 이후/, form: successorApt({ redevCompletionDate: "2017-01-01" }),
  },
  {
    name: "redev: acquisitionDate (승계 인가 전 취득)", field: "acquisitionDate", step: 0, assetIndex: A,
    message: /^자산: 승계조합원 모드는 관리처분 인가일 이후 입주권 취득/, form: successorApt({ acquisitionDate: "2016-01-01" }),
  },
  {
    name: "redev: acquisitionCause (승계 취득원인)", field: "acquisitionCause", step: 0, assetIndex: A,
    message: /^자산: 승계조합원은 취득원인이 매매·증여·상속/, form: successorApt({ acquisitionCause: "newConstruction" }),
  },
  {
    name: "redev: fixedAcquisitionPrice (승계 매매 취득가액)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A,
    message: /^자산: 승계조합원 — 입주권을 매매로 승계취득한 취득가액/, form: successorApt({ fixedAcquisitionPrice: "" }),
  },

  // ── 금액 ──
  { name: "redev: redevRightsValue", field: "redevRightsValue", step: 0, assetIndex: A, message: /^자산: 권리가액을 입력하세요/, form: apt({ redevRightsValue: "" }) },
  {
    name: "redev: redevSettlementAmount (음수)", field: "redevSettlementAmount", step: 0, assetIndex: A,
    message: /^자산: 청산금 금액을 입력하세요/, form: apt({ redevSettlementAmount: "-1" }), unreachableInUi: NEGATIVE,
  },
  {
    name: "redev: redevPreApprovalExpenses (음수)", field: "redevPreApprovalExpenses", step: 0, assetIndex: A,
    message: /^자산: 인가전 분 필요경비를 입력하세요/, form: apt({ redevPreApprovalExpenses: "-1" }), unreachableInUi: NEGATIVE,
  },
  {
    name: "redev: redevSettlementSaleDate (완공 APT 수령)", field: "redevSettlementSaleDate", step: 0, assetIndex: A,
    message: /^자산: 청산금 수령 시 소유권이전 고시일/, form: apt({ redevSettlementDirection: "receive", redevSettlementSaleDate: "" }),
  },
  {
    name: "redev: redevActualAcquisitionPrice (주택 출자)", field: "redevActualAcquisitionPrice", step: 0, assetIndex: A,
    message: /^자산: 실가 모드 — 인가전 분 종전 주택 취득가액/, form: apt({ redevActualAcquisitionPrice: "" }),
  },

  // ── 환산 — 단독주택 출자 §166③ 2-point(주택+입주권+수령+환산) ──
  {
    name: "redev: redevHousingStdPriceAtAcq", field: "redevHousingStdPriceAtAcq", step: 0, assetIndex: A,
    message: /^자산: 단독주택 출자 환산취득가 — 취득당시 개별주택가격/,
    form: right({ redevSettlementDirection: "receive", redevSettlementAmount: "30000000", useEstimatedAcquisition: true }),
  },
  {
    name: "redev: redevHousingStdPriceAtApproval", field: "redevHousingStdPriceAtApproval", step: 0, assetIndex: A,
    message: /^자산: 단독주택 출자 환산취득가 — 인가당시 개별주택가격/,
    form: right({ redevSettlementDirection: "receive", redevSettlementAmount: "30000000", useEstimatedAcquisition: true, redevHousingStdPriceAtAcq: "100000000" }),
  },

  // ── 환산 — 일반(§166③ + §164⑦) ──
  { name: "redev: redevManagementDisposalHousingPrice", field: "redevManagementDisposalHousingPrice", step: 0, assetIndex: A, message: /^자산: 환산 모드 — D\(관리처분/, form: est({ redevManagementDisposalHousingPrice: "" }) },
  { name: "redev: redevFirstDisclosureHousingPrice", field: "redevFirstDisclosureHousingPrice", step: 0, assetIndex: A, message: /^자산: §164⑦ 본문 — A\(최초공시 주택가격\)/, form: phd({ redevFirstDisclosureHousingPrice: "" }) },
  { name: "redev: redevLandArea (§164⑦)", field: "redevLandArea", step: 0, assetIndex: A, message: /^자산: §164⑦ 본문 — 토지면적/, form: phd({ redevLandArea: "" }) },
  { name: "redev: redevLandPricePerSqmAtAcq (§164⑦)", field: "redevLandPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: §164⑦ 본문 — 취득시 토지 ㎡당 단가/, form: phd({ redevLandPricePerSqmAtAcq: "" }) },
  {
    name: "redev: redevBuildingStdPriceAtAcq (음수)", field: "redevBuildingStdPriceAtAcq", step: 0, assetIndex: A,
    message: /^자산: §164⑦ 본문 — 취득시 건물 기준시가/, form: phd({ redevBuildingStdPriceAtAcq: "-1" }), unreachableInUi: NEGATIVE,
  },
  { name: "redev: redevLandPricePerSqmAtFirst (§164⑦)", field: "redevLandPricePerSqmAtFirst", step: 0, assetIndex: A, message: /^자산: §164⑦ 본문 — 최초공시 당시 토지/, form: phd({ redevLandPricePerSqmAtFirst: "" }) },
  {
    name: "redev: redevBuildingStdPriceAtFirst (음수)", field: "redevBuildingStdPriceAtFirst", step: 0, assetIndex: A,
    message: /^자산: §164⑦ 본문 — 최초공시 당시 건물/, form: phd({ redevBuildingStdPriceAtFirst: "-1" }), unreachableInUi: NEGATIVE,
  },
  { name: "redev: redevAcquisitionHousingPrice", field: "redevAcquisitionHousingPrice", step: 0, assetIndex: A, message: /^자산: 환산 모드 — 취득당시 개별주택공시가격/, form: est({ redevAcquisitionHousingPrice: "" }) },
  {
    name: "redev: redevFirstDisclosureDate (A만 있고 최초공시일 없음)", field: "redevFirstDisclosureDate", step: 0, assetIndex: A,
    message: /^자산: A 또는 PHD 단가를 입력하셨다면 최초공시일/, form: est({ redevFirstDisclosureHousingPrice: "100000000" }),
  },

  // ── 거주월수·거주기간(사례 45) ──
  {
    name: "redev: redevPriorHouseResidenceMonths (음수)", field: "redevPriorHouseResidenceMonths", step: 0, assetIndex: A,
    message: /^자산: 종전주택 거주개월수는 0 이상/, form: apt({ redevPriorHouseResidenceMonths: "-1" }), unreachableInUi: MONTHS,
  },
  {
    name: "redev: redevNewHouseResidenceMonths (음수)", field: "redevNewHouseResidenceMonths", step: 0, assetIndex: A,
    message: /^자산: 신축주택 거주개월수는 0 이상/, form: apt({ redevNewHouseResidenceMonths: "-1" }), unreachableInUi: MONTHS,
  },
  {
    name: "redev: redevPriorResidenceEndDate (퇴거일만 빔)", field: "redevPriorResidenceEndDate", step: 0, assetIndex: A,
    message: /^자산: 종전주택 거주기간은 입주일과 퇴거일을 모두/, form: apt({ redevPriorResidenceStartDate: "2015-03-01" }, ONE_HOUSE),
  },
  {
    name: "redev: redevNewResidenceStartDate (입주일만 빔)", field: "redevNewResidenceStartDate", step: 0, assetIndex: A,
    message: /^자산: 신축주택 거주기간은 입주일과 퇴거일을 모두/, form: apt({ redevNewResidenceEndDate: "2023-03-01" }, ONE_HOUSE),
  },
  {
    name: "redev: redevPriorResidenceStartDate (날짜 형식)", field: "redevPriorResidenceStartDate", step: 0, assetIndex: A,
    message: /^자산: 종전주택 거주기간 날짜 형식/, form: apt({ redevPriorResidenceStartDate: "2015-13-45", redevPriorResidenceEndDate: "2017-01-01" }),
    unreachableInUi: "날짜 칸(`DateInput`)은 월 1~12·일은 그 달 말일로 자른다(`clampDay`) — 형식이 틀린 날짜를 넣을 수 없다",
  },
  {
    name: "redev: redevPriorResidenceStartDate (입주일 > 퇴거일)", field: "redevPriorResidenceStartDate", step: 0, assetIndex: A,
    message: /^자산: 종전주택 입주일이 퇴거일보다 이후/, form: apt({ redevPriorResidenceStartDate: "2017-06-01", redevPriorResidenceEndDate: "2016-01-01" }, ONE_HOUSE),
  },

  // ── 승계조합원 입주권(§97①1호 가목) ──
  { name: "redev: acquisitionDate (승계 입주권)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 조합원입주권 승계취득일을 입력하세요/, form: successorRight({ acquisitionDate: "" }) },
  {
    name: "redev: isSuccessorRightToMoveIn (인가일 > 취득일)", field: "isSuccessorRightToMoveIn", step: 0, assetIndex: A,
    message: /^자산: 관리처분계획 인가일이 취득일보다 나중/, form: successorRight({ redevApprovalDate: "2021-01-01" }),
  },
  { name: "redev: successorRightAcqPrice", field: "successorRightAcqPrice", step: 0, assetIndex: A, message: /^자산: 조합원입주권 승계취득가액을 입력하세요/, form: successorRight({ successorRightAcqPrice: "" }) },
  {
    name: "redev: successorRightAddedContribution (음수)", field: "successorRightAddedContribution", step: 0, assetIndex: A,
    message: /^자산: 취득 후 납입한 추가분담금은 0 이상/, form: successorRight({ successorRightAddedContribution: "-1" }), unreachableInUi: NEGATIVE,
  },
  {
    name: "redev: successorRightStdPaidAtAcq (추계 취득당시 기준시가)", field: "successorRightStdPaidAtAcq", step: 0, assetIndex: A,
    message: /^자산: 추계 취득가액을 쓰려면 취득당시 기준시가/, form: successorRight({ useEstimatedAcquisition: true }),
  },
  {
    name: "redev: successorRightStdPaidAtTransfer (환산 양도당시 기준시가)", field: "successorRightStdPaidAtTransfer", step: 0, assetIndex: A,
    message: /^자산: 환산취득가액을 쓰려면 양도당시 기준시가/, form: successorRight({ useEstimatedAcquisition: true, successorRightStdPaidAtAcq: "200000000" }),
  },
  {
    name: "redev: fixedAcquisitionPrice (승계 입주권 감정가액)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A,
    message: /^자산: 감정가액을 입력하세요\. \(소득세법 시행령 §176의2③2호/,
    form: successorRight({ isAppraisalAcquisition: true, successorRightStdPaidAtAcq: "200000000", fixedAcquisitionPrice: "" }),
  },
  {
    name: "redev: similarSalesValue (승계 입주권 매매사례)", field: "similarSalesValue", step: 0, assetIndex: A,
    message: /^자산: 매매사례가액을 입력하세요\. \(소득세법 시행령 §176의2③1호/,
    form: successorRight({ isSalesCaseAcquisition: true, successorRightStdPaidAtAcq: "200000000", similarSalesValue: "" }),
  },
];
