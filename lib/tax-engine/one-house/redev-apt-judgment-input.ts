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
 *      …사용승인서 교부일」(+ 사전-2019-법령해석재산-0649). 원조합원은 종전주택 취득일이 그대로다(§154⑧1호 통산).
 *   ③ 거주월수 = `resolveAptResidenceMonths`(분리 입력 · 승계는 신축 거주만) — 표2와 같은 값
 *   ④ 토지만 출자한 원조합원이면 보유 기산일(`exemptionHoldingStartDate`) = 사용승인일(G3-4) — 취득일은 그대로
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
import { isLandContributedNewBuild, resolveAptResidenceMonths } from "../redevelopment-lthd";
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
 * 일시적 2주택 · 중과 배제 §167의10①15호)도 같은 번역 입력을 읽는다. 주택을 출자한 원조합원은 종전주택 취득일이 그대로다(§154⑧1호 통산).
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
  const conversion = landContributed ? redevRightConversion(redev) : undefined;
  return {
    ...input,
    propertyType: "housing",
    acquisitionDate: redevAptJudgmentAcquisitionDate(input),
    // §156의2⑥ 신축주택 갈래 — 이 신축주택이 된 입주권의 취득일(승계조합원 = 입주권 승계일 · 토지 출자 = 인가일).
    ...(redevNewBuildRightAcquisitionDate(input) ? { newBuildRightAcquisitionDate: redevNewBuildRightAcquisitionDate(input) } : {}),
    ...(landContributed
      ? {
          // 보유 기산일 = 사용승인일(G3-4).
          exemptionHoldingStartDate: redev.completionDate,
          // #12 — 2017.8.3. 경과규정은 **입주권 전환 완료일**(인가일·분양계약일 중 늦은 날)이 2017.8.2. 이전일 때만 면제된다
          //   (서면-2018-법령해석재산-1711 · 서면-2022-법규재산-4321). 분양계약일을 모르면 전환 완료일을 알 수 없어 면제하지 않는다 —
          //   사용승인일을 경과규정 기준일로 둔다(사용승인일이 2017.8.2. 이전이면 그 자체로 면제).
          residenceTransitionAcquisitionDate: conversion ?? redev.completionDate,
          // 전환 완료일 현재 조정대상지역이 아니면 거주요건 면제 — `describeOneHouseResidenceRequirement`가 읽는다.
          residenceRightConversionDate: conversion,
        }
      : {}),
    residencePeriodMonths: resolveAptResidenceMonths({
      // 토지만 출자한 원조합원도 보유기간이 사용승인일부터라 신축주택 거주만 센다 — 승계조합원과 같다(준공 전 거주는 보유기간 중 거주가 아니다).
      isSuccessorMember: redev.isSuccessorMember === true || landContributed,
      priorHouseResidenceMonths: redev.priorHouseResidenceMonths,
      newHouseResidenceMonths: redev.newHouseResidenceMonths,
      residencePeriodMonths: input.residencePeriodMonths,
    }),
  };
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
 * 토지 출자 원조합원 완공APT의 **입주권 전환 완료일** — 관리처분계획 인가일과 분양계약일 중 늦은 날 (#12).
 * 분양계약일을 입력하지 않았으면 `undefined`(전환 완료일을 알 수 없다 — 면제 예외 불성립).
 */
export function redevRightConversion(
  redev: Pick<NonNullable<TransferTaxInput["redevelopment"]>, "approvalDate" | "rightContractDate">,
): Date | undefined {
  if (!redev.rightContractDate) return undefined;
  return redev.rightContractDate > redev.approvalDate ? redev.rightContractDate : redev.approvalDate;
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
