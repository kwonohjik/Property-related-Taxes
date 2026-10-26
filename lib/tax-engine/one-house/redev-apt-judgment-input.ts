/**
 * 재개발 완공 신축주택(`redevelopment_apt` · subject="apt") — **§154① 1세대1주택 판정 입력 번역** (G8-4 leaf)
 * + 완공APT의 **「1주택」 두 축** (G3-2).
 *
 * ## 번역 — 비과세·중과 배제가 같은 입력을 본다
 *
 * `redevelopment_apt`는 이 저장소가 §166 분기 라우팅을 위해 쓰는 **내부 자산종류 태그**이지 법령상 자산
 * 구분이 아니다. 완공된 신축주택은 「소득세법」 §94①1호 「건물」이자 §89①3호가목의 「주택」이므로 1세대1주택
 * 판정(`checkExemption`·`resolveArticle89Clause2`·`meetsOneHouseHoldingResidence`)에는 **housing으로 번역해**
 * 넣는다. 번역은 세 가지다.
 *
 *   ① `propertyType: "housing"` — §89②(「그 **주택**을 양도하는 경우」)·§154①이 주택 양도에만 걸린다
 *   ② 승계조합원이면 취득일 = **준공일** — 「소득세법 시행령」 §162①4호 「자기가 건설한 건축물에 있어서는
 *      …사용승인서 교부일」(+ 사전-2019-법령해석재산-0649). 주택을 출자한 원조합원은 종전주택 취득일이 그대로다 — 보유·거주기간은
 *      §154⑧1호 통산, §155① 「취득한 날」은 기존주택의 연장(부동산납세과-777 · 대법원 2008두16261 심리불속행).
 *   ③ 거주월수 = `resolveAptResidenceMonths`(분리 입력 · 승계는 신축 거주만 — 단 증여자와 계속 같은 세대인 증여 승계는 종전주택 거주를 더한다, 사전-2020-법령해석재산-0691) — 표2와 같은 값
 *   ④ 토지만 출자한 원조합원이면 보유 기산일(`exemptionHoldingStartDate`) = 사용승인일(G3-4) — 취득일은 그대로
 *   ⑥ 승계조합원이면 세대 사실(`giftHouseholdBasis`)은 증여자가 주택을 출자한 원조합원이고 계속 같은 세대일 때만 남긴다
 *      (`successorGiftHouseholdConsolidates` — 부동산거래관리과-1503 · 서면인터넷방문상담4팀-2069). 증여 전 거주 개월은 지운다 — 같은 사실을
 *      종전주택 거주 칸(`priorHouseResidenceMonths` · 사전-2020-법령해석재산-0691)이 받아 ③에 이미 더해진다.
 *   ⑤ 승계조합원·토지만 출자한 원조합원이면 §155① 종전주택 취득일(`temporaryTwoHouse.previousAcquisitionDate`)도 ②와 같은
 *      준공일 — 서면-2022-부동산-0565(승계 입주권으로 취득한 주택의 취득시기 = 사용승인서 교부일) · 토지 출자는 영 §162①4호
 *      문언(사용자 결정 2026-10-25 F-1 Q-3 — 정면 해석례 없이 진행). 계산기 ④는 같은 날짜를 `sellingHousePreviousDateOverride`로
 *      싣는다. API를 직접 불러 입주권 승계일·토지 취득일을 보내도 같은 결론이 나게 여기서도 맞춘다. 세대원 건물 출자 통산(#12)을
 *      선언한 토지 출자는 **세대원 건물 취득일** — 세대가 그 주택을 가진 날이고 #12 보유 기산일과 같다(사용자 결정 2026-10-26
 *      Q-B1 — `household-building-carryover-temp-two-house.plan.md` · 정면 해석례 없음, 확인 필요). 주택을 출자한 원조합원도
 *      맞추지 않는다 — 재건축주택은 기존주택의 연장이라 멸실 전 주택 취득일이 종전주택 취득일이다(부동산납세과-777 · F-1 Q-2).
 *
 * 🔴 종전에는 이 번역이 비과세 판정(`judgeRedevAptOneHouseExemption`)에만 있었다. 중과 STEP 0.5의 ① 요소
 * (§155 의제·§156의2·§156의3 예외)와 ② 요소(§154① 충족)는 번역하지 않은 입력을 읽어, 같은 계산 안에서
 * 비과세는 「§89②로 꺼짐」인데 중과 배제는 「의제 성립」(`not_applicable`)이거나, 비과세는 「준공일 기준 보유
 * 미달」인데 ② 요소는 「충족」(입주권 취득일 기준)이었다(겸용 E-7이 같은 결함을 `propertyType: "housing"`
 * 번역으로 이미 고쳤다 — `transfer-tax-mixed-use-exemption.ts`).
 *
 * ⚠️ 이 번역은 **판정 술어에 넘기는 입력**에만 쓴다. 주택 수 제외(`resolveExemptionHouseCountExclusions`)는
 * 번역 전 원본을 본다 — 상속주택 제외의 E-8(`transfer-inheritance-exclusion.ts`)이 입주권 취득일과 준공일을
 * 따로 받기 때문에, 취득일을 미리 바꿔 넣으면 그 구분이 사라진다.
 */
import { isLandContributedNewBuild, resolveAptResidenceMonths, successorAptMaxResidenceMonths } from "../redevelopment-lthd";
import type { TransferTaxInput } from "../types/transfer.types";

/** 번역 대상인가 — 완공APT(`subject="apt"`)만. 입주권(§89①4호)은 다른 호라 번역하지 않는다. */
function isRedevApt(input: Pick<TransferTaxInput, "propertyType" | "redevelopment">): boolean {
  return input.propertyType === "redevelopment_apt" && input.redevelopment?.subject === "apt";
}

/**
 * 1세대1주택 판정용 「주택 취득일」 — 신축주택 취득시기가 **사용승인서 교부일**인 두 축은 준공일, 그 밖에는 `acquisitionDate`.
 *
 *  · 승계조합원 신축주택 — 준공일 (영 §162①4호 · 사전-2019-법령해석재산-0649)
 *  · 토지만 출자한 원조합원 신축주택 — 준공일 (#12 · 영 §162①4호 — 멸실된 주택이 없어 §154⑧1호 통산 대상이 없다)
 *
 * 이 날짜가 §154① 「취득 당시」 조정대상지역 판정일이고, 주택 취득일을 쓰는 형제 판정(상속주택 특례 §155② 일반주택 취득일 ·
 * 일시적 2주택 · 중과 배제 §167의10①15호)도 같은 번역 입력을 읽는다. 주택을 출자한 원조합원은 종전주택 취득일이 그대로다 — 보유기간은
 * §154⑧1호 통산, 「취득한 날」은 기존주택의 연장(부동산납세과-777 · 대법원 2008두16261 심리불속행).
 */
export function redevAptJudgmentAcquisitionDate(
  input: Pick<TransferTaxInput, "acquisitionDate" | "redevelopment" | "propertyType">,
): Date {
  const redev = input.redevelopment;
  if (redev?.isSuccessorMember === true && redev.completionDate) return redev.completionDate;
  if (isLandContributedOriginalApt(input) && redev?.completionDate) return redev.completionDate;
  return input.acquisitionDate;
}

/**
 * **토지만 출자한 원조합원**의 완공APT인가 — §154① 보유 기산일이 사용승인일인 축 (G3-4).
 *
 * 원조합원이라도 **주택**을 출자했으면 소유권의 연장이라 §154⑧1호 「멸실되어 재건축한 주택인 경우에는 그 멸실된
 * 주택과 재건축한 주택」을 통산한다. 토지만 출자했으면 멸실된 주택이 없어 통산 대상이 없고, 신축주택 취득시기는
 * 사용승인서 교부일(영 §162①4호)이다 — 서면-2022-부동산-1616(2023.09.14.): 「토지를 소유한 조합원이 재개발로
 * 취득한 주택의 보유기간 계산은 사용검사필증교부일부터 양도일까지로 하는 것」.
 */
export function isLandContributedOriginalApt(
  input: Pick<TransferTaxInput, "propertyType" | "redevelopment">,
): boolean {
  return isRedevApt(input) && isLandContributedNewBuild(input.redevelopment!);
}

/**
 * **준공일 입력이 판정에 쓰이는 조건** — 토지 출자 원조합원 완공APT ∧ 1세대 (G3-4 보정).
 *
 * `exemptionHoldingStartDate`는 §154① 비과세 보유 기산일에만 쓰인다. 1세대가 아니면 1세대1주택 판정 자체가 없어
 * 결론에 쓰이지 않는 입력이므로 ⑧·⑫가 그것을 필수로 요구하면 저장 이력 재계산만 막는다. ⑧(`validateRedevelopmentAsset`)·
 * ⑫(`refinePrimaryAcquisitionInputs`)·엔진의 소비 조건이 어긋나지 않게 이 술어 하나를 쓴다(3중 패턴).
 * 청산금 수령 단독신고는 신축주택을 양도하지 않아 제외한다(엔진도 그 판정을 겹치지 않는다).
 */
export function redevCompletionDateRequiredForHolding(f: {
  isOneHousehold?: boolean;
  subject?: string;
  isSuccessorMember?: boolean;
  originalAssetType?: string;
  receiveOnlyMode?: boolean;
}): boolean {
  return (
    f.isOneHousehold === true &&
    f.subject === "apt" &&
    f.isSuccessorMember !== true &&
    f.originalAssetType === "land" &&
    f.receiveOnlyMode !== true
  );
}

/**
 * 완공APT면 1세대1주택 판정 입력으로 번역한 사본, 아니면 입력 그대로(동일 참조).
 *
 * `residencePeriodMonths`는 `resolveAptResidenceMonths`가 정한다 — 재개발 카드의 분리 입력(§154⑧1호 통산)과
 * Step4 거주값 중 어느 쪽을 쓸지의 규칙은 그 함수 주석에 있다(OH-48·OH-50).
 */
export function translateRedevAptForHousingJudgment<T extends TransferTaxInput>(input: T): T {
  if (!isRedevApt(input)) return input;
  const redev = input.redevelopment!;
  const landContributed = isLandContributedOriginalApt(input);
  const carryover = landContributed ? householdBuildingCarryover(redev) : undefined;
  // ⑤ §155① 종전주택 취득일 — 승계조합원·토지 출자 = 준공일, 세대원 건물 통산(#12) = 그 건물 취득일. 통산을 선언했는데
  //   helper가 값을 주지 않으면(건물 취득일 > 인가일 · 준공일 없음) 대체하지 않는다.
  const previousHouseDate =
    redev.isSuccessorMember === true
      ? redev.completionDate
      : landContributed
        ? carryover
          ? carryover.holdingStart
          : redev.householdBuilding
            ? undefined
            : redev.completionDate
        : undefined;
  return {
    ...input,
    propertyType: "housing",
    acquisitionDate: redevAptJudgmentAcquisitionDate(input),
    // ⑥ 승계조합원의 세대 사실 — 통산이 성립하는 증여 승계만 남기고, 증여 전 거주 개월은 지운다(③의 종전주택 거주와 같은 사실).
    ...(redev.isSuccessorMember === true && input.giftHouseholdBasis
      ? {
          giftHouseholdBasis: successorGiftHouseholdConsolidates(redev)
            ? { ...input.giftHouseholdBasis, priorHouseholdResidenceMonths: undefined }
            : undefined,
        }
      : {}),
    // D-6 — 증여 승계의 세대 사실 상태(확인 필요 고지의 문구·게이트). 증여 승계가 아니면 싣지 않는다.
    ...(redev.isSuccessorMember === true && input.acquisitionCause === "gift"
      ? {
          redevSuccessorGift: {
            declinedConsolidation: redev.successorGiftSameHousehold === false || redev.successorGiftDonorHouseMember === false,
          },
        }
      : {}),
    // ⑤ — 종전 주택이 양도 주택일 때만(합가 D8 상대 쪽 짝이면 `previousHouseIsRosterRow` — 명부 행의 취득일이라 그대로 둔다).
    ...(previousHouseDate && input.temporaryTwoHouse && input.temporaryTwoHouse.previousHouseIsRosterRow !== true
      ? { temporaryTwoHouse: { ...input.temporaryTwoHouse, previousAcquisitionDate: previousHouseDate } }
      : {}),
    // §156의2⑥ 신축주택 갈래 — 이 신축주택이 된 입주권의 취득일(승계조합원 = 입주권 승계일 · 토지 출자 = 인가일).
    ...(redevNewBuildRightAcquisitionDate(input) ? { newBuildRightAcquisitionDate: redevNewBuildRightAcquisitionDate(input) } : {}),
    ...(landContributed
      ? {
          // 보유 기산일 = 사용승인일(G3-4). 세대원 건물 출자 통산(#12)이면 그 건물 취득일 — 세대 기준 보유를 이어 센다.
          exemptionHoldingStartDate: carryover?.holdingStart ?? redev.completionDate,
          // #12 — 2017.8.3. 경과규정은 **입주권 전환일 = 관리처분계획 인가일**이 2017.8.2. 이전일 때 면제된다
          //   (서면-2018-법령해석재산-1711 · 서면-2022-법규재산-4321). 원조합원에게는 분양계약일이라는 개념이 없다 —
          //   인가일에 보유 부동산(토지·건물)이 입주권으로 바뀐다(사용자 결정 2026-10-13).
          residenceTransitionAcquisitionDate: redev.approvalDate,
          // 인가일 현재 조정대상지역이 아니면 거주요건 면제 — `describeOneHouseResidenceRequirement`가 읽는다.
          residenceRightConversionDate: redev.approvalDate,
        }
      : {}),
    residencePeriodMonths:
      resolveAptResidenceMonths({
        // 토지만 출자한 원조합원도 보유기간이 사용승인일부터라 신축주택 거주만 센다 — 승계조합원과 같다(준공 전 거주는 보유기간 중 거주가 아니다).
        isSuccessorMember: redev.isSuccessorMember === true || landContributed,
        // 증여 승계의 종전주택 거주 통산(사전-2020-법령해석재산-0691) — 승계조합원만. 토지 출자 원조합원에는 닿지 않는다.
        successorGiftSameHousehold: redev.isSuccessorMember === true ? redev.successorGiftSameHousehold : undefined,
        priorHouseResidenceMonths: redev.priorHouseResidenceMonths,
        newHouseResidenceMonths: redev.newHouseResidenceMonths,
        residencePeriodMonths: input.residencePeriodMonths,
      }) + (carryover?.residenceMonths ?? 0),
  };
}

/**
 * **세대원 건물 출자 통산**(#12) — 토지 출자 원조합원 완공APT가 세대원 건물을 선언했을 때의 비과세 통산 값.
 * 건물 취득일이 사용승인일 뒤면(입력 오류 — ⑧·⑫가 먼저 막는다) 통산하지 않는다. 장기보유특별공제(`redevelopment-lthd.ts`)는 이 값을 읽지 않는다.
 */
export function householdBuildingCarryover(
  redev: Pick<NonNullable<TransferTaxInput["redevelopment"]>, "householdBuilding" | "completionDate" | "approvalDate">,
): { holdingStart: Date; residenceMonths: number } | undefined {
  const b = redev.householdBuilding;
  if (!b || !redev.completionDate || b.acquisitionDate > redev.approvalDate) return undefined;
  return { holdingStart: b.acquisitionDate, residenceMonths: b.residenceMonths ?? 0 };
}

/**
 * 세대원 건물 출자 통산의 거주 개월 수 상한 검사 — 건물 취득일부터 관리처분계획 인가일까지의 개월 수(그 전까지만 건물에서 거주할 수 있다).
 * 넘으면 그 상한, 아니면 null. ⑧(`validateRedevelopmentAsset`)·⑫(`refineRequiredFields`)가 같은 leaf를 쓴다.
 */
export function householdBuildingResidenceOverflow(acquisitionDate: Date, approvalDate: Date, months: number): number | null {
  const max = successorAptMaxResidenceMonths(acquisitionDate, approvalDate);
  return months > max ? max : null;
}

/**
 * **증여받은 종전주택으로 원조합원이 된 완공APT** — 종전주택 입주일이 증여일보다 앞서는가(계획서 `redev-apt-gift-household-fact.plan.md` Q-3 a).
 *
 * 수증자의 보유기간은 증여를 받은 날부터다(영 §162①5호) — 그 전 거주는 §154① 「그 보유기간 중 거주기간」이 아니어서 종전주택 거주로 셀 수 없다.
 * 증여자와 계속 같은 세대였으면 「증여 전 동일세대 거주기간」(`giftHouseholdBasis.priorHouseholdResidenceMonths`)으로 따로 받는다 — 두 칸에 같은
 * 기간을 넣으면 두 번 센다. 관리처분계획 인가 뒤 철거 전까지의 종전주택 거주는 막지 않는다.
 * 승계조합원(증여 승계의 종전주택 거주는 세대 거주다 — 사전-2020-법령해석재산-0691)·토지 출자·청산금 수령 단독신고는 대상이 아니다.
 * ⑧(`validateRedevelopmentAsset`)·⑫(`refinePrimaryAcquisitionInputs`)가 같은 leaf를 쓴다. 날짜는 YYYY-MM-DD라 문자열 비교가 날짜 순서다.
 */
export function redevGiftPriorResidenceBeforeGift(f: {
  acquisitionCause?: string;
  acquisitionDate?: string;
  subject?: string;
  isSuccessorMember?: boolean;
  originalAssetType?: string;
  receiveOnlyMode?: boolean;
  priorResidenceStartDate?: string;
}): boolean {
  return (
    f.acquisitionCause === "gift" &&
    f.subject === "apt" &&
    f.isSuccessorMember !== true &&
    f.originalAssetType !== "land" &&
    f.receiveOnlyMode !== true &&
    !!f.priorResidenceStartDate &&
    !!f.acquisitionDate &&
    f.priorResidenceStartDate < f.acquisitionDate
  );
}

/**
 * **승계조합원 증여 승계에서 증여자 세대의 보유기간을 통산할 수 있는가** — 증여자가 관리처분계획 인가 전부터 종전주택을 보유한
 * 원조합원이고(`successorGiftDonorHouseMember`) 증여일부터 양도일까지 계속 같은 세대(`successorGiftSameHousehold`)인 경우
 * (부동산거래관리과-1503 · 서면인터넷방문상담4팀-2069 — 「입주권 상태에서 동일세대원 간의 증여가 이루어진 경우에는 증여자 및 수증자의
 * 보유기간을 통산」). 증여자가 입주권을 사서 승계했거나 토지만 출자했으면 증여자에게도 준공 전 주택 보유가 없어 통산할 기간이 없다.
 * 엔진 번역(⑥)·⑫(`refinePrimaryAcquisitionInputs`)가 같은 술어를 쓴다.
 */
export function successorGiftHouseholdConsolidates(
  redev: Pick<NonNullable<TransferTaxInput["redevelopment"]>, "successorGiftSameHousehold" | "successorGiftDonorHouseMember">,
): boolean {
  return redev.successorGiftSameHousehold === true && redev.successorGiftDonorHouseMember === true;
}

/**
 * 승계조합원 증여 승계의 **세대 보유 시작일** 검사 — ⑧(`validateRedevelopmentAsset`)·⑫(`refinePrimaryAcquisitionInputs`) 공용 leaf.
 * 세대는 관리처분계획 인가 전부터 종전주택을 보유했어야 한다(인가 뒤에는 종전주택이 입주권으로 바뀐다). 증여자 취득일보다 앞설 수 없고,
 * 증여일보다 앞서야 한다(`giftHouseholdConsolidationStart`와 같은 범위). 날짜는 YYYY-MM-DD라 문자열 비교가 날짜 순서다.
 */
export function successorGiftHouseholdStartIssue(f: {
  householdStartDate?: string;
  donorAcquisitionDate?: string;
  approvalDate?: string;
  giftDate?: string;
}): "missing_start" | "missing_donor_acquisition" | "before_donor_acquisition" | "after_approval" | "not_before_gift" | null {
  if (!f.householdStartDate) return "missing_start";
  if (!f.donorAcquisitionDate) return "missing_donor_acquisition";
  if (f.householdStartDate < f.donorAcquisitionDate) return "before_donor_acquisition";
  if (f.approvalDate && f.householdStartDate > f.approvalDate) return "after_approval";
  if (f.giftDate && f.householdStartDate >= f.giftDate) return "not_before_gift";
  return null;
}

/**
 * 재개발 신축주택이 된 **조합원입주권의 취득일** — 취득일이 준공일로 바뀌는 두 축에서만 값이 있다(#12).
 *   · 승계조합원 — 입주권 승계 취득일(`acquisitionDate` 원값)
 *   · 토지만 출자한 원조합원 — 관리처분계획 인가일(그 전에는 토지만 보유했다)
 * 주택을 출자한 원조합원은 종전주택 취득일이 그대로라(§154⑧1호 통산) `undefined`.
 */
export function redevNewBuildRightAcquisitionDate(
  input: Pick<TransferTaxInput, "acquisitionDate" | "redevelopment" | "propertyType">,
): Date | undefined {
  const redev = input.redevelopment;
  if (!isRedevApt(input) || !redev?.completionDate) return undefined;
  if (redev.isSuccessorMember === true) return input.acquisitionDate;
  if (isLandContributedOriginalApt(input)) return redev.approvalDate;
  return undefined;
}

/**
 * 완공APT **표2·§154① 축** 「1주택」 — **실제 1주택 ∨ §155 의제**.
 *
 * 「소득세법 시행령」 §159의4는 표2 대상을 「1세대가 양도일 현재 국내에 1주택(제155조·제155조의2·제156조의2·
 * 제156조의3 및 그 밖의 규정에 따라 1세대 1주택으로 보는 주택을 포함한다)을 보유하고 보유기간 중 거주기간이
 * 2년 이상인 것」으로 정의한다. 청산금 수령분 비과세의 근거인 §154①도 §155①(「1세대1주택으로 보아 제154조
 * 제1항을 적용한다」)의 적용을 받는다(부동산거래관리과-631 — 청산금을 교부받기 전에 다른 주택을 취득해 §155①
 * 일시적 2주택이 된 경우에도 교부받은 청산금은 §154①을 적용받을 수 있다).
 *
 * 일반 경로 F10(`transfer-tax-lthd.ts` `isOneHouseForTable2`)과 같은 분리다 — **실제 주택 수 축**
 * (`isOneHouseSingle`, §95⑤·12억 판정)은 그대로 두고, 표2 **대상** 축에만 의제를 더한다.
 *
 * @param judgeHousingCount 주택 수 제외(§99의4·§98의9·감면주택·§155②③ 상속주택) **반영 후** 세대 보유 주택 수 —
 *   일반 경로가 장특에 넘기는 `exemptionJudgeInput.householdHousingCount`와 같은 값이다.
 */
export function resolveRedevAptOneHouseTable2Axis(args: {
  isOneHousehold: boolean | undefined;
  judgeHousingCount: number;
  deemedOneHouseBy155: boolean | undefined;
}): boolean {
  return args.isOneHousehold === true && (args.judgeHousingCount === 1 || args.deemedOneHouseBy155 === true);
}
