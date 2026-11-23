/**
 * I-26 표 — 묶음 F(수집기 밖 고지 · 판정 메뉴 route 단위 · 2026-11-23 표 확장).
 *
 * 결론 불변 셀은 대부분 같은 사실에 **미등기**(`isUnregistered` — 1세대1주택 비과세 배제)를 더한 것이다 — 미확정 사실은 그대로이고
 * 결론은 다른 사유로 과세로 정해진다. 입주권 양도는 미등기 칸이 닿지 않아 관리처분인가일 비과세 요건 「아니오」로 과세를 정한다.
 */
import fs from "node:fs";
import type { PipelineCell, PipelineContractRow } from "./contract-pipeline";
import { INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID, INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID, REVERSE_DOUBLE_MERGE_UNVERIFIED_ID } from "@/lib/tax-engine/one-house/pending";
import { SAME_DAY_RIGHT_UNVERIFIED_ID } from "@/lib/tax-engine/one-house/same-day-right";
import { LAND_ONLY_SAME_HOUSEHOLD_MERGE_ID } from "@/lib/tax-engine/one-house/land-only-verdict";
import { DEMOLISHED_BEFORE_BALANCE_UNVERIFIED_ID } from "@/lib/tax-engine/data/demolished-before-balance-era";
import { MERGE_RENTAL_CARVEOUT_MISSING_ID, MERGE_RENTAL_CARVEOUT_NOTICE_ID } from "@/lib/tax-engine/one-house/merge-rental-carveout";

type Form = PipelineCell["form"];
const unregistered = (c: PipelineCell): PipelineCell => ({ ...c, form: { ...c.form, isUnregistered: true } });
/**
 * 양도일 현재 비거주자(2010.1.1. 이후 양도 · §121② 단서) — 판정 뒤 단계가 비과세를 거둔다. 거둔 판정에서 비과세 전제 고지를 지우는 회수 필터
 * (`revokeOneHouseExemption`)를 지나는 결론 불변 셀이다. 역순 합가·2중첩은 본체가 비과세일 때만 적용 특례를 남겨 미등기 셀로는 그 게이트에 닿지 않는다
 * (`settled` 게이트를 지워도 미등기 셀은 침묵 — 동치 · 2026-11-23 뮤테이션 실측).
 */
const nonResident = (c: PipelineCell): PipelineCell => ({ ...c, form: { ...c.form, transferorNonResident: true } });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** 1주택 + 승계 입주권(2020-07-01) — 2024-06-01 양도는 권리 취득 3년 경과 · 예외 미선언 → §89② 배제(본체는 비과세) */
const THREE_YEAR: PipelineCell = {
  today: "2024-06-02",
  form: {
    isOneHousehold: true, transferDate: "2024-06-01", contractTotalPrice: "500000000",
    asset: { assetKind: "housing", acquisitionDate: "2019-06-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "0" },
    presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: "2020-07-01", region: "capital", memberOrigin: "successor" }],
  } as Form,
};

/** 혼인 2주택 + 입주권 2개(D-41) — 합가 전 보유 구성 미선택 → §156의2⑨ 불성립 */
const MERGED: PipelineCell = {
  today: "2023-10-16",
  form: {
    isOneHousehold: true, transferDate: "2023-10-15", contractTotalPrice: "800000000", marriageDate: "2023-01-10", isFirstTransferredInMerge: true,
    asset: { assetKind: "housing", acquisitionDate: "2020-05-10", addressJibun: "경상북도 구미시 송정동 1", fixedAcquisitionPrice: "500000000" },
    houses: [{ id: "b", region: "non_capital", acquisitionDate: "2021-07-20", acquisitionOrigin: "general", mergeOrigin: "counterpart_side" }],
    presaleRights: [
      { id: "c", type: "redevelopment_right", acquisitionDate: "2022-09-25", region: "non_capital", memberOrigin: "successor", mergeOrigin: "seller_side" },
      { id: "d", type: "redevelopment_right", acquisitionDate: "2022-11-01", region: "non_capital", memberOrigin: "successor", mergeOrigin: "counterpart_side" },
    ],
  } as unknown as Form,
};

/** 주택·입주권 같은 날 취득(D-40 O-3) — 선후를 몰라 §156의2④ 예외 불성립 + 확인 필요 */
const CONFIRM: PipelineCell = {
  today: "2024-06-14",
  form: {
    isOneHousehold: true, transferDate: "2024-06-14", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2021-06-15", residenceInputMode: "direct", residencePeriodMonthsAsset: "36" },
    presaleRights: [{ id: "r", type: "redevelopment_right", acquisitionDate: "2021-06-15", region: "non_capital", memberOrigin: "successor" }],
    rightThreeYearExceptionKind: "new_house", rightNewHouseCompletionDate: "2023-01-02", rightMovedInWithin3Years: true, rightResidedOneYearOrMore: true,
  } as Form,
};

/** 공동상속 소수지분 주택 + 승계 입주권(D-42) — §156의2③ 직접 적용은 한 독법 */
const READING: PipelineCell = {
  today: "2024-06-14",
  form: {
    isOneHousehold: true, transferDate: "2024-06-14", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2018-01-15", residenceInputMode: "direct", residencePeriodMonthsAsset: "30" },
    houses: [{
      id: "co", acquisitionDate: "2015-03-01", region: "non_capital", isInherited: true, inheritedDate: "2015-03-01", isCoInherited: true,
      isLargestCoInheritedShareholder: false, decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, acquisitionOrigin: "general",
    }],
    presaleRights: [{ id: "r", type: "redevelopment_right", acquisitionDate: "2023-03-15", region: "non_capital", memberOrigin: "successor" }],
  } as Form,
};

/** 별도세대 상속 분양권(피상속인 2019 취득 · 평가셋 N-E067) */
const INHERITED_PRESALE: PipelineCell = {
  today: "2023-09-04",
  form: {
    isOneHousehold: true, transferDate: "2024-04-15", contractTotalPrice: "600000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-03-15" },
    presaleRights: [{
      id: "b", type: "presale_right", acquisitionDate: "2021-02-10", region: "capital", isInherited: true, decedentSameHouseholdAtInheritance: false,
      decedentHouseholdSeparate: true, decedentAcquisitionDate: "2019-06-15", decedentOwnedHouseAtDeath: true,
    }],
  } as Form,
};

/** 역순 이중 합가(동거봉양 2018 → 혼인 2019 · D4 M-1) */
const REVERSE_MERGE: PipelineCell = {
  today: "2026-04-11",
  form: {
    isOneHousehold: true, transferDate: "2026-04-10", contractTotalPrice: "800000000",
    marriageDate: "2019-03-01", parentalCareMergeDate: "2018-06-01", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true,
    asset: { assetKind: "housing", acquisitionDate: "2015-04-01" },
    houses: [
      { id: "spouse", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2014-02-01", mergeOrigin: "second_merge_side" },
      { id: "parents", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2005-01-01", mergeOrigin: "counterpart_side" },
    ],
  } as Form,
};

/** 별도세대 상속주택(§155② 제외) + 부득이한 사유 수도권 밖 주택(§155⑧ · 평가셋 E162) — 상속 제외 뒤 ⑧로 비과세 */
const OVERLAP: PipelineCell = {
  today: "2024-04-12",
  form: {
    isOneHousehold: true, transferDate: "2024-04-11", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2010-08-15" },
    houses: [
      { id: "inh", region: "non_capital", acquisitionDate: "1995-01-01", isInherited: true, inheritedDate: "2016-05-01", isCoInherited: false, decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, acquisitionOrigin: "general" },
      { id: "b", region: "non_capital", acquisitionDate: "2017-02-03", oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalUnresolved: true, acquisitionOrigin: "general" },
    ],
  } as Form,
};

/** 일시적 2주택(종전 2015 · 신규 2023) + 양도일 당일 취득한 입주권 — 보유로 세면 2주택 + 1권리로 §89② 배제 */
const SAME_DAY: PipelineCell = {
  today: "2024-06-02",
  form: {
    isOneHousehold: true, transferDate: "2024-06-01", contractTotalPrice: "500000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-03-15" },
    houses: [{ id: "new", region: "non_capital", acquisitionDate: "2023-10-01", acquisitionOrigin: "general" }],
    presaleRights: [{ id: "s", type: "redevelopment_right", acquisitionDate: "2024-06-01", region: "non_capital", memberOrigin: "successor" }],
  } as Form,
};

/** 2008 양도 비거주자 1주택(거주 48개월) — §121② 단서는 2010.1.1. 이후 양도분부터 */
const NON_RESIDENT_PRE2010: PipelineCell = {
  today: "2008-06-20",
  form: {
    isOneHousehold: true, transferDate: "2008-06-19", contractTotalPrice: "500000000", transferorNonResident: true,
    asset: { assetKind: "housing", acquisitionDate: "2003-03-15", residenceInputMode: "direct", residencePeriodMonthsAsset: "48" },
  } as Form,
};

/** 2018 양도 비거주자 입주권(관리처분인가 2016 · 인가일 비과세 요건 충족) — §121② 단서의 §89①4호는 2020.1.1. 이후 */
const nonResidentRight = (eligible: "yes" | "no"): PipelineCell => ({
  today: "2018-06-20",
  form: {
    isOneHousehold: true, transferDate: "2018-06-19", contractTotalPrice: "500000000", transferorNonResident: true,
    asset: { assetKind: "right_to_move_in", acquisitionDate: "2010-05-16", redevSubject: "right", redevExemptionEligibleAtApproval: eligible, redevApprovalDate: "2016-04-28" },
  } as Form,
});

/** 2024 계약 · 잔금 전 매매특약 멸실(결정 #46) — 원칙 토지 양도로 과세 · 주택 양도로 본 결정례가 있어 확인 필요 */
const DEMOLISHED: PipelineCell = {
  today: "2024-06-02",
  form: {
    isOneHousehold: true, transferDate: "2024-06-01", contractTotalPrice: "500000000", demolishedBeforeBalance: true, demolishedBeforeBalanceContractDate: "2024-01-10",
    asset: { assetKind: "housing", acquisitionDate: "2015-03-15" },
  } as Form,
};

/** 평가셋 E0061 — 동거봉양 합가 + 합가 상대 쪽 장기임대주택 1채(사전-2023-법규재산-0061) 성립 */
const E0061 = (() => {
  const d = JSON.parse(fs.readFileSync("__tests__/calc/one-house-rulings/cases/E0061.json", "utf8"));
  return (Array.isArray(d) ? d[0] : d) as { today: string; form: Form };
})();
const MERGE_RENTAL: PipelineCell = { today: E0061.today, form: clone(E0061.form) };
/** 같은 사실에서 ⑳을 선언하지 않고 상대 쪽 임대를 명부 행으로만 둔 화면(D-10) */
const MERGE_RENTAL_MISSING: PipelineCell = (() => {
  const form = clone(E0061.form) as Form & { asset: Record<string, unknown>; houses: Record<string, unknown>[] };
  form.asset.rentalHousingException = { applyException: false };
  form.houses.push({ id: "r", region: "capital", acquisitionDate: "2019-09-26", mergeOrigin: "counterpart_side", isLongTermRental: true, acquisitionOrigin: "general" });
  return { today: E0061.today, form };
})();

const BUNDLED_IN_CALC = "계산기는 §89② 배제 고지를 다른 문장(`article89Clause2Notices`)으로 묶어 낸다 — 게이트는 같은 `coreWouldPass`·중과 배제 축(G5-8 anchor)";
const MENU_ONLY = "판정 메뉴 전용 단계(`judgment-pipeline.ts`) — 계산기에는 이 단계가 없다";

export const ROWS_F: PipelineContractRow[] = [
  {
    id: "89-2-three-year-exception-undeclared",
    decides: THREE_YEAR, decidesWhy: "본체 비과세 — 3년 경과 예외 미선언 배제로만 과세",
    silent: unregistered(THREE_YEAR), silentWhy: "미등기 — 예외를 선언해도 과세",
    calcParitySkip: BUNDLED_IN_CALC,
  },
  {
    id: "89-2-merged-household-composition-undeclared",
    decides: MERGED, decidesWhy: "본체 통과 — 합가 전 구성 미선택 불성립으로만 과세",
    silent: unregistered(MERGED), silentWhy: "미등기 — 구성을 골라도 과세",
    calcParitySkip: BUNDLED_IN_CALC,
  },
  {
    id: "89-2-confirm:*",
    decides: CONFIRM, decidesWhy: "본체 통과 — 취득 선후 모름으로 예외 불성립",
    silent: unregistered(CONFIRM), silentWhy: "미등기 — 선후를 알아도 과세",
    calcParitySkip: BUNDLED_IN_CALC,
  },
  {
    id: "89-2-reading:*",
    decides: READING, decidesWhy: "비과세 — 반대 독법이면 §89② 배제로 과세",
    silent: unregistered(READING), silentWhy: "미등기 — 어느 독법이어도 과세(표 확장이 찾은 결함 · 종전: 고지)",
  },
  {
    id: INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID,
    decides: INHERITED_PRESALE, decidesWhy: "본체 통과 — 상속개시일로 넣은 분양권의 §89② 배제로만 과세",
    silent: unregistered(INHERITED_PRESALE), silentWhy: "미등기 — 분양권을 빼도 과세",
  },
  {
    id: REVERSE_DOUBLE_MERGE_UNVERIFIED_ID,
    decides: REVERSE_MERGE, decidesWhy: "역순 이중 합가 의제로 비과세(서면4팀-598 대칭 독법)",
    silent: nonResident(REVERSE_MERGE), silentWhy: "비거주자(§121②) — 의제가 서도 비과세를 거둔다(회수 필터)",
    calcSilent: unregistered(REVERSE_MERGE),
  },
  {
    id: INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID,
    decides: OVERLAP, decidesWhy: "상속 제외 뒤 §155⑧ 2중첩으로 비과세",
    silent: nonResident(OVERLAP), silentWhy: "비거주자(§121②) — 중첩이 서도 비과세를 거둔다(회수 필터)",
    calcSilent: unregistered(OVERLAP),
  },
  {
    id: SAME_DAY_RIGHT_UNVERIFIED_ID,
    decides: SAME_DAY, decidesWhy: "당일 권리를 보유로 세면 2주택 + 1권리 §89② 배제로 과세",
    silent: unregistered(SAME_DAY), silentWhy: "미등기 — 권리를 어느 쪽으로 세도 과세",
  },
  {
    id: LAND_ONLY_SAME_HOUSEHOLD_MERGE_ID,
    decides: null,
    decidesWhy:
      "route로 닿지 않음 — Zod(⑫)가 토지만 본인 × 같은 세대 건물 소유자에 「처음부터 같은 세대·중간 합가」 답(`buildingOwnerHouseholdMerged`)을 요구하고, " +
      "답이 있으면 `applyLandOnlyHouseholdRule`이 고지를 억제한다(엔진 직접 호출에서만 나온다 · 2026-11-23 실측)",
    silent: null,
    silentWhy: "결론을 가르는 셀이 없다",
  },
  {
    id: "121-2-pre2010-non-resident-unverified",
    decides: NON_RESIDENT_PRE2010, decidesWhy: "거주자 기준 비과세 — 2010 전 양도분의 비거주자 배제 적용 여부가 결론을 가른다",
    silent: unregistered(NON_RESIDENT_PRE2010), silentWhy: "미등기 — 거주자여도 과세",
    calcParitySkip: MENU_ONLY,
  },
  {
    id: "121-2-pre2020-non-resident-right-unverified",
    decides: nonResidentRight("yes"), decidesWhy: "거주자 기준 §89①4호 비과세 — 2020 전 양도분의 비거주자 배제 적용 여부가 결론을 가른다",
    silent: nonResidentRight("no"), silentWhy: "관리처분인가일 비과세 요건 「아니오」 — 거주자여도 과세",
    calcParitySkip: MENU_ONLY,
  },
  {
    id: DEMOLISHED_BEFORE_BALANCE_UNVERIFIED_ID,
    decides: DEMOLISHED, decidesWhy: "주택으로 보면 비과세 — 멸실 특약으로 토지 양도 과세",
    silent: unregistered(DEMOLISHED), silentWhy: "미등기 — 주택으로 봐도 과세",
    calcParitySkip: MENU_ONLY,
  },
  {
    id: MERGE_RENTAL_CARVEOUT_NOTICE_ID,
    decides: MERGE_RENTAL, decidesWhy: "상대 쪽 임대 1채를 빼고 합가 특례로 비과세(0061 적용 근거)",
    silent: unregistered(MERGE_RENTAL), silentWhy: "미등기 — 임대를 빼도 과세",
  },
  {
    id: MERGE_RENTAL_CARVEOUT_MISSING_ID,
    decides: MERGE_RENTAL_MISSING, decidesWhy: "⑳ 미선언 — 임대 요건을 입력하면 0061로 비과세가 될 수 있다",
    silent: unregistered(MERGE_RENTAL_MISSING), silentWhy: "미등기 — 임대 요건을 입력해도 과세",
  },
];
