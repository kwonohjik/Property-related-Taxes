/**
 * 임야 판정 (§168-9, PDF p.1700~1701 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 3-1   재촌기간 기간기준 (주민등록 필수)
 *   Step 3-1-1 공익·산림보호·사업관련 임야 기간기준 (§168-9 ①·③)
 *   Step 3-2   산림법 시업중·특수산림사업지구? → No면 사업용 (지역기준 미적용)
 *   Step 3-2-1 시업중/특수지구: 도시지역 밖? → Yes 사업용
 *   Step 3-2-2 도시지역 內 시업중: 편입유예 → 사업용/비사업용
 */

import { addYears, differenceInDays } from "date-fns";
import { NBL } from "../legal-codes";
import type {
  CategoryJudgeResult,
  DateInterval,
  JudgmentStep,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
} from "./types";
import {
  checkForestIncorporationGrace,
  getPeriodJudgmentDate,
  meetsPeriodCriteria,
  type PeriodCriteriaResult,
} from "./period-criteria";
import { computeResidencePeriods } from "./residence";
import { isUrbanForForest } from "./urban-area";
import { getOwnershipStart } from "./utils/period-math";

/**
 * 공익·산림보호 임야 (§168-9 ①) 여부.
 */
function isPublicOrProtected(input: NonBusinessLandInput): boolean {
  return input.forestDetail?.isPublicInterest === true;
}

/**
 * 거주·사업관련 임야 (§168-9 ③) 여부.
 */
function isBusinessRelatedForest(input: NonBusinessLandInput): {
  applies: boolean;
  reason: string;
} {
  const f = input.forestDetail;
  if (f?.isForestSuccessor) return { applies: true, reason: "임업후계자 임산물 생산" };

  // §168-9 ③7호: 상속개시일부터 3년 경과하지 아니한 임야
  // (신 플래그 `inheritedForestWithin3Years` 우선, 레거시 오기 플래그 `inheritedForestWithin5Years`도 수용)
  const inheritedFlag = f?.inheritedForestWithin3Years ?? f?.inheritedForestWithin5Years;
  if (inheritedFlag && f?.forestInheritanceDate) {
    // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): `differenceInDays / 365`는 윤년에서
    //   off-by-one을 낸다. 상속 2019-03-01 → 양도 2022-02-28은 1,095일이라 1095/365 = 3.0이
    //   되어 `< 3`이 false → **3년 경과로 오판**했지만, 3년 도래일은 2022-03-01이므로
    //   2022-02-28은 아직 3년 미경과다(§168의9③7호 "상속개시일부터 3년이 **지나지 아니한**").
    //   달력 기준 `addYears`로 판정한다 — 윤년·월말 경계를 date-fns가 처리한다.
    const threeYearMark = addYears(f.forestInheritanceDate, 3);
    if (input.transferDate < threeYearMark) {
      const years = differenceInDays(input.transferDate, f.forestInheritanceDate) / 365;
      return { applies: true, reason: `상속 3년 이내 임야 (${years.toFixed(1)}년 경과)` };
    }
  }

  const u = input.unconditionalExemption;
  if (u?.isJongjoongOwned && u.jongjoongAcquisitionDate) {
    const cutoff = new Date("2005-12-31");
    if (u.jongjoongAcquisitionDate <= cutoff) {
      return { applies: true, reason: "종중 소유 (2005.12.31 이전 취득)" };
    }
  }

  return { applies: false, reason: "거주·사업관련 임야 사유 없음" };
}

export function judgeForest(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.FOREST];
  const warnings: string[] = [];
  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  // §168조의14② 양도일 의제 — §168조의6 기간기준 전용 (도시지역·편입유예는 실제 양도일)
  const pjDate = getPeriodJudgmentDate(input);
  const totalOwnershipDays = Math.max(0, differenceInDays(pjDate, ownershipStart));

  // ── Step 3-1: 재촌기간 기간기준 (주민등록 필수) ─────────────────────
  const residenceFromHistory = computeResidencePeriods(
    input.ownerProfile?.residenceHistories,
    input.landLocation,
    {
      requireResidentRegistration: true,
      adjacentSigunguCodes: input.adjacentSigunguCodes,
      distanceLimitKm: rules.farmlandDistanceKm,
    },
  );

  /**
   * 임야 재촌은 **거주 이력 입력이 유일한 정본**이다 (E1-04, 2026-09-02 코드리뷰).
   *
   * 종전에는 `input.ownerLocation?.hasResidentRegistration === true`를 게이트로 한 거리 fallback이
   * 있었으나 `ownerLocation`을 채우는 프로덕션 코드가 없어(저장소 전수 grep — form-mapper는
   * `landLocation`만 만든다) **도달 불가 경로**였다. 그래서 UI가 「직선거리(km)」를 받아도 임야에서는
   * 재촌이 0일로 계산됐다 — 같은 입력이 농지에서는 인정되므로 지목 간 비대칭이기도 했다.
   *
   * 「소득세법 시행령」 §168의9②은 「… 지역에 **주민등록이 되어 있고 사실상 거주**하는 자」를
   * 요건으로 하므로, 주민등록 여부를 알 수 없는 거리 스냅샷만으로는 요건을 세울 수 없다.
   * ⇒ 죽은 경로를 걷어내고, 이력이 없으면 그 사실을 결과에 드러낸다.
   */
  // ⚠️ 조건은 **매칭된 재촌 기간이 0**이라는 뜻이다 — 이력이 아예 없을 때와, 이력은 있으나
  //    동일·연접 시·군·구도 30km도 아닌 경우가 모두 여기 들어온다. 문구가 앞쪽만 말하면
  //    사용자가 「입력했는데 왜」로 읽는다(U1-02에서 농지 게이트가 같은 혼동으로 틀어졌다).
  if (residenceFromHistory.length === 0) {
    warnings.push(
      (input.ownerProfile?.residenceHistories?.length ?? 0) > 0
        ? "임야 재촌 판정 — 입력한 거주 이력이 임야 소재지와 동일·연접 시·군·구도 아니고 " +
            "직선거리 30km 이내도 아니어서 재촌 기간을 0일로 봅니다(주민등록 없는 이력도 제외됩니다)."
        : "임야 재촌 판정 — 거주 이력이 입력되지 않아 재촌 기간을 0일로 봅니다. " +
            "「소득세법 시행령」 §168조의9②은 주민등록과 사실상 거주를 요건으로 하므로 거주 이력을 입력해야 판정됩니다.",
    );
  }

  const residencePeriods = residenceFromHistory;
  const r1 = meetsPeriodCriteria(residencePeriods, input.acquisitionDate, pjDate, "forest", rules, input.gracePeriods);

  steps.push({
    id: "forest_residence",
    label: "Step 3-1 임야 재촌 기간기준 (주민등록 필수)",
    status: r1.meets ? "PASS" : "FAIL",
    detail: r1.meets ? `재촌 기간기준 충족 — ${r1.detail}` : `재촌 미충족 — ${r1.detail}`,
    legalBasis: NBL.FOREST_RESIDENCE,
  });

  if (r1.meets) {
    appliedLaws.push(NBL.FOREST_RESIDENCE);
    return buildPass("임야 재촌 기간기준 충족 → 사업용", steps, appliedLaws, warnings, {
      r: r1, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // ── Step 3-1-1: 공익·산림보호·사업관련·시업중/특수지구 임야 기간기준 ──
  const publicProtected = isPublicOrProtected(input);
  const related = isBusinessRelatedForest(input);
  // §168조의9①2호가목(산림경영계획 시업중)·나목(특수산림사업지구)은 그 자체가 공익·산림보호 임야로
  // 재촌 여부와 무관하게 기간기준 판정 대상이다(이후 Step 3-2에서 지역기준 적용). 게이트에서 누락하면
  // '산림경영계획 인가'만 체크한 시업중 임야가 비사업용으로 오판되므로 반드시 포함한다.
  const inSiupOrSpecialZone =
    input.forestDetail?.hasForestPlan === true ||
    input.forestDetail?.isSpecialForestZone === true;
  const applies = publicProtected || related.applies || inSiupOrSpecialZone;
  const entryReason = publicProtected
    ? "공익·산림보호 임야"
    : related.applies
      ? related.reason
      : "산림경영계획 시업중·특수산림사업지구";
  // 시업중/특수지구는 §168조의9①(FOREST_PUBLIC) 소속. 거주·사업관련(③)만 FOREST_BUSINESS.
  const entryLegal = !publicProtected && related.applies ? NBL.FOREST_BUSINESS : NBL.FOREST_PUBLIC;

  let r2: PeriodCriteriaResult | null = null;
  if (applies) {
    const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: pjDate }];
    r2 = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "forest", rules, input.gracePeriods);
    if (!r2.meets) {
      steps.push({
        id: "forest_public_business",
        label: "Step 3-1-1 공익·사업관련·시업중 임야 기간기준",
        status: "FAIL",
        detail: `해당(${entryReason})이나 기간기준 미충족`,
        legalBasis: entryLegal,
      });
      return buildFail("공익/사업관련/시업중 임야이나 기간기준 미충족", steps, appliedLaws, warnings, {
        r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
      });
    }
    appliedLaws.push(entryLegal);
    steps.push({
      id: "forest_public_business",
      label: "Step 3-1-1 공익·사업관련·시업중 임야 기간기준",
      status: "PASS",
      detail: entryReason,
      legalBasis: entryLegal,
    });
  } else {
    steps.push({
      id: "forest_public_business",
      label: "Step 3-1-1 공익·사업관련·시업중 임야 기간기준",
      status: "FAIL",
      detail: "공익·산림보호·거주/사업관련·시업중/특수지구 사유 모두 미해당",
      legalBasis: NBL.FOREST_BUSINESS,
    });
    return buildFail("재촌 미충족 + 공익/사업관련/시업중 미해당 → 비사업용", steps, appliedLaws, warnings, {
      r: r1, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  /**
   * ── Step 3-2: 산림법 시업중 · 특수산림사업지구? (inSiupOrSpecialZone은 Step 3-1-1에서 산정) ──
   *
   * 🔴 지역기준(도시지역 편입 3년)은 **①2호에만 붙은 단서**다 (E3-03, 2026-09-02 코드리뷰).
   *    「소득세법 시행령」 §168의9①2호 본문 확인:
   *      「2. 「산지관리법」에 따른 산지 안의 임야로서 다음 각 목의 어느 하나에 해당하는 임야.
   *        **다만**, … 도시지역 … 안의 임야로서 도시지역으로 편입된 날부터 3년이 경과한 임야를 제외한다.」
   *    단서 안의 「이하 **이 호에서** 같다」가 적용 범위를 2호로 못 박는다. 따라서 같은 임야가
   *    ①1호(산림보호구역·채종림·시험림)·①6호(문화유산·자연유산 보호구역) 등 **다른 호**나
   *    ③(거주·사업관련)에도 해당하면 그 사유로 이미 사업용이므로 2호 단서로 뒤집을 수 없다.
   *
   *    종전 게이트는 `inSiupOrSpecialZone`만 보아 공익림·거주관련 임야까지 지역기준에 태웠다.
   */
  const onlySiup = inSiupOrSpecialZone && !publicProtected && !related.applies;
  if (!onlySiup) {
    steps.push({
      id: "forest_siup_zone",
      label: "Step 3-2 산림법 시업중·특수산림사업지구",
      status: "NOT_APPLICABLE",
      detail: inSiupOrSpecialZone
        ? "시업중/특수지구이나 ①1호(공익림) 또는 ③(거주·사업관련)에도 해당 — ①2호 단서 미적용 → 사업용"
        : "시업중/특수지구 아님 — 임야 지역기준 미적용 → 사업용",
      legalBasis: NBL.FOREST,
    });
    return buildPass("공익/사업관련 임야 + 기간기준 충족 (지역기준 미적용)", steps, appliedLaws, warnings, {
      r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // ── Step 3-2-1/2: 시업중/특수지구 — 도시지역 밖 + 편입유예 ────────
  // §168의9①2호 단서의 「도시지역」은 **보전녹지지역을 제외**한다(본문 명문 — 국토계획법 시행령 §30).
  // `conservation_green`(보전녹지)은 `isUrbanForForest`가 false를 반환하므로 아래 도시지역 분기를 타지 않는다. E3-04.
  const urban = isUrbanForForest(input.zoneType);
  steps.push({
    id: "forest_siup_zone",
    label: "Step 3-2 산림법 시업중·특수산림사업지구",
    status: "PASS",
    detail: "시업중 임야 또는 특수산림사업지구 — 지역기준 적용",
    legalBasis: NBL.FOREST,
  });
  if (!urban) {
    return buildPass("시업중 임야 + 도시지역 밖", steps, appliedLaws, warnings, {
      r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // 도시지역 內 시업중 임야 — 편입 3년 경과시 §168-9 ①2호 단서로 제외
  // 임야 전용 래퍼 — 기간 계산은 공용이나 **미상일 때의 기본값이 의도된 선택**임을 명시한다(V5-d).
  const grace = checkForestIncorporationGrace(input.urbanIncorporationDate, input.transferDate, rules);
  if (grace.isApplied) {
    steps.push({
      id: "forest_urban_grace",
      label: "Step 3-2-1 도시지역 內 편입유예",
      status: "PASS",
      detail: grace.detail,
      legalBasis: NBL.FOREST_URBAN_GRACE,
    });
    return buildPass("시업중 임야 + 도시지역 內 편입유예 내", steps, appliedLaws, warnings, {
      r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // 편입유예 미적용 — 「모른다(미제공)」와 「지났다(경과)」를 구분해 적는다.
  // 종전에는 두 사실을 한 문장으로 합치고 유예연수도 3년으로 고정 표기해, 2015.2.2. 이전 양도분의
  // 2년 유예가 결과 화면에 3년으로 나왔다 (V5-a·V5-g, 2026-09-02 코드리뷰).
  steps.push({
    id: "forest_urban_grace",
    label: "Step 3-2-1 도시지역 內 편입유예",
    status: "FAIL",
    detail: input.urbanIncorporationDate
      ? `편입일 ${input.urbanIncorporationDate.toISOString().slice(0, 10)}부터 ${grace.graceYears}년 경과`
      : "도시지역 편입일 미제공 — 편입유예를 적용할 수 없습니다(편입일을 입력하면 유예 여부가 판정됩니다)",
    legalBasis: NBL.FOREST_URBAN_GRACE,
  });
  return buildFail("시업중 임야 + 도시지역 內 유예 외 → 비사업용", steps, appliedLaws, warnings, {
    r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
  });
}

// ============================================================
// 공통 빌더
// ============================================================

interface Ctx {
  r: PeriodCriteriaResult;
  totalOwnershipDays: number;
  residencePeriodsUsed: DateInterval[];
}

function buildPass(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: true,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    residencePeriodsUsed: ctx.residencePeriodsUsed,
    warnings,
  };
}

function buildFail(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: false,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    residencePeriodsUsed: ctx.residencePeriodsUsed,
    warnings,
  };
}
