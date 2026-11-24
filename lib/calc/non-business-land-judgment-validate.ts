/**
 * ⑧ 비사업용 토지 판정 메뉴 검증 — **엔진 정합 부분** (계획서 `nbl-judgment-menu.engine.plan.md` §5.2 · 「사용자 결정 2차」 Q-1 (c)).
 *
 * 계산기 ⑧의 규칙을 **함수 그대로** 부른다 — 새 규칙을 만들지 않는다:
 *   · NBL 정밀판정 전체(지목·용도지역·면적·도시지역·행·의제일·상태 이력 등) → `validateNblDetailedJudgment`
 *   · 상속 피상속인 취득일 → `inheritedDecedentDateError`
 *   · 취득일·양도일 순서(취득일<양도일 · 피상속인<상속개시일) → `getAssetDateOrderIssue`
 *   · 이월과세 사건 머리(증여자 취득일·증여 등기접수일 필수·순서·관계) → `validateCarryoverEventHead`
 *     (「증여 당시 평가액」은 세액 입력이라 이 메뉴가 묻지 않는다 — 그 칸 오류만 거른다. 그 규칙은 머리 검증의 **마지막**이라 앞선 오류를 가리지 않는다.)
 *   · 소재지 필수 — 계산기 `validateAssetEntry`(transfer-tax-validate-asset.ts)의 규칙은 그 함수 안이라 호출할 수 없어 같은 조건·같은 문구를 둔다(문구 동치는 anchor가 지킨다).
 *
 * ⑧ 통과 ⇒ 메뉴 route 200(⑫′ 거울)이 불변식이다. UI 계획서(§9.2)가 같은 파일에 단계 귀속(field→단계)·단계별 래퍼를 더한다 —
 * 그래서 반환은 평면 `{ field, message }[]`다(경고 계층 없음 — UD-5).
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";
import { collectWithFields } from "./transfer-tax-validate-field";
import type { IssueField } from "./transfer-tax-validate-field";
import { getAssetDateOrderIssue } from "./transfer-tax-validate-asset";
import { inheritedDecedentDateError } from "./transfer-tax-validate-acquisition";
import { validateCarryoverEventHead } from "./transfer-tax-validate-carryover-asset";
import { validateNblDetailedJudgment } from "./transfer-tax-validate-nbl";
import { stateHistoryFloorDate } from "./transfer-tax-validate-nbl-state-history";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";
import { primaryAcquisitionDateOf } from "./transfer-tax-api-carryover";
import { todayLocalISO } from "./transfer-tax-validate-asset";
import { formatOwnershipPercent } from "./transfer-tax-api-asset-basics";
import { ownershipRatioError } from "./transfer-tax-api-asset-basics";

export interface NblJudgmentIssue {
  field: IssueField;
  message: string;
}

/** 메시지 접두 — 자산이 1건뿐이라 번호가 없다(UI 계획서 §9.2). */
const LABEL = "토지";

/** 이월과세 머리 검증에서 이 메뉴가 묻지 않는 칸(세액 입력)의 오류 field. */
const SKIPPED_CARRYOVER_FIELD: IssueField = "carryover.giftDateValuation";

export function validateNblJudgmentForm(
  form: Pick<TransferFormData, "assets" | "transferDate" | "assetSplitMode">,
): NblJudgmentIssue[] {
  const asset = form.assets[0];
  const transferDate = form.transferDate;
  const issues: NblJudgmentIssue[] = [];
  const push = (field: IssueField, message: string | null) => {
    if (message) issues.push({ field, message });
  };
  /** 하위 검증이 `fieldError`로 기록한 칸을 함께 얻는다. */
  const collect = (fn: () => string | null): NblJudgmentIssue | null => {
    const { result, fieldOf } = collectWithFields(fn);
    return result ? { field: fieldOf(result) ?? "assets", message: result } : null;
  };
  const pushCollected = (fn: () => string | null, skipField?: IssueField) => {
    const issue = collect(fn);
    if (issue && issue.field !== skipField) issues.push(issue);
  };

  if (!transferDate) push("transferDate", "양도일을 입력하세요.");
  // 소재지 — 이력 dedup 키·시군구 fallback의 원천(계산기 ⑧ `validateAssetEntry`와 같은 문구).
  if (!asset.addressRoad?.trim() && !asset.addressJibun?.trim()) {
    push("addressJibun", `${LABEL}: 소재지를 입력하세요. 계산 이력에서 물건을 구분하는 기준입니다.`);
  }

  const carryover = asset.acquisitionCause === "carryover_gift";
  if (carryover) {
    // 증여자 취득일·증여 등기접수일 필수 + 순서(증여자 취득 → 증여 등기 → 양도) + 관계 — 계산기 ⑧·⑫와 같은 leaf.
    pushCollected(() => validateCarryoverEventHead(asset.carryover, LABEL, transferDate), SKIPPED_CARRYOVER_FIELD);
  } else {
    if (!asset.acquisitionDate) push("acquisitionDate", `${LABEL}: 취득일을 입력하세요.`);
    const order = getAssetDateOrderIssue(asset, transferDate);
    if (order) push(order.field, `${LABEL}: ${order.message}`);
  }
  // 상속 — 피상속인 취득일(계산기 ⑧의 마지막 관문과 같은 함수)
  pushCollected(() => inheritedDecedentDateError(asset, LABEL));

  // NBL 정밀판정 전체 — 취득일·양도일이 있어야 의미가 있다(없으면 위 오류가 이미 막는다)
  if (transferDate && nblAcquisitionDateOf(asset)) {
    pushCollected(() =>
      validateNblDetailedJudgment(asset, LABEL, transferDate, {
        floorDate: stateHistoryFloorDate({ assets: form.assets, assetSplitMode: form.assetSplitMode }, asset),
      }),
    );
  }
  return issues;
}

/* ══ UI 단계 귀속(계획서 `nbl-judgment-menu.ui.plan.md` §9.2 · UD-1~UD-4) — 위 엔진 정합 규칙 위에 얹는다 ═════════════════════════ */

/** 화면 입력 단계 — 0 토지 기본 · 1 사업용 의제·지목 · 2 부득이한 사유·편입일·의제일. (3 = 결과 — 검증 대상 아님) */
export type NblInputStep = 0 | 1 | 2;
export const NBL_INPUT_STEP_COUNT = 3;

/** ③ 단계가 소유하는 칸 — `validateNblDetailedJudgment`가 `fieldError`로 기록하는 3종(UD-1, grep 실측: transfer-tax-validate-nbl.ts). */
const GRACE_STEP_FIELD = /^(nblUrbanIncorporationDate|nblDeemedTransferDate|nblGracePeriods\..+)$/;

/** ① 단계가 소유하는 칸 — ①에 보이는 입력(양도일·소재지·면적·지분·취득원인·날짜·이월과세 사건 머리). */
const LAND_STEP_FIELD =
  /^(transferDate|addressJibun|addressRoad|acquisitionDate|acquisitionArea|transferArea|acquisitionCause|decedentAcquisitionDate|nonHeirBequest|ownership\w*|carryover\..+|assets)$/;

/** 오류의 입력칸 → 화면 단계. 매핑에 없는 칸은 ②(지목·세부) — 대부분이 지목별 세부 입력이다. */
export function nblStepOfField(field: string): NblInputStep {
  if (GRACE_STEP_FIELD.test(field)) return 2;
  if (LAND_STEP_FIELD.test(field)) return 0;
  return 1;
}

/** `validateNblDetailedJudgment`의 면적 문구와 **같은 문장**(anchor가 대조 — 단일 소스화는 계산기 leaf 수정이라 하지 않는다 · UV-8). */
const AREA_MESSAGE = `${LABEL}: 비사업용 토지 판정을 위해 토지 면적(㎡)을 입력하세요.`;

/**
 * ① 전용 규칙 — 엔진 정합 규칙(`validateNblJudgmentForm`)이 ② 규칙에 가려 ①에서 못 막는 칸.
 *  · 면적: `validateNblDetailedJudgment`는 지목·용도지역 검사 **뒤**에 면적을 보므로 지목을 아직 안 고른 ① 화면에서는 안 막힌다.
 *  · 지분: 계산기 ⑧(`validateAssetEntry`)과 같은 조건·문구(UD-4).
 *  · 미래 취득일: 계산기 ⑧과 같은 문구.
 */
function landStepExtraIssues(form: Pick<TransferFormData, "assets" | "transferDate">): NblJudgmentIssue[] {
  const a = form.assets[0];
  const out: NblJudgmentIssue[] = [];
  if (!a.acquisitionArea || !(parseFloat(a.acquisitionArea) > 0)) {
    out.push({ field: "acquisitionArea", message: AREA_MESSAGE });
  }
  const ownErr = ownershipRatioError(a.ownershipNumerator || "100", a.ownershipDenominator || "100");
  if (ownErr) {
    out.push({ field: "ownershipNumerator", message: `${LABEL}: ${ownErr}` });
  } else {
    const n = parseFloat(a.ownershipNumerator || "100");
    const d = parseFloat(a.ownershipDenominator || "100");
    if (n < d && a.ownershipRemainderThirdParty !== "yes") {
      out.push({
        field: "ownershipRemainderThirdParty",
        message: `${LABEL}: 지분 모드 자산(${formatOwnershipPercent(a.ownershipNumerator || "100", a.ownershipDenominator || "100")})은 단독으로 계산할 수 없습니다. 나머지 지분도 내 것이면 그 지분을 별도 자산으로 추가하고, 나머지가 타인 소유이면 「나머지 지분은 타인 소유」를 선택하세요. 단독 소유라면 지분율을 100%로 입력하세요.`,
      });
    }
  }
  // 미래 날짜 — 이월과세는 증여 등기접수일을 읽는다(계산기 ⑧ L23과 같다)
  const acquisition = primaryAcquisitionDateOf(a);
  if (acquisition && acquisition > todayLocalISO()) {
    const carryover = a.acquisitionCause === "carryover_gift";
    out.push({
      field: carryover ? "carryover.giftRegistryDate" : "acquisitionDate",
      message: `${LABEL}: ${carryover ? "증여 등기접수일" : "취득일"}(${acquisition})이 오늘 이후입니다. 미래 날짜는 입력할 수 없습니다.`,
    });
  }
  return out;
}

/** 모든 단계의 오류 — 단계 귀속 포함. 같은 문구는 한 번만(엔진 규칙과 ① 전용 규칙이 겹칠 수 있다). */
function collectAll(form: NblJudgmentFormData): Array<NblJudgmentIssue & { step: NblInputStep }> {
  const seen = new Set<string>();
  const out: Array<NblJudgmentIssue & { step: NblInputStep }> = [];
  for (const issue of [...validateNblJudgmentForm(form), ...landStepExtraIssues(form)]) {
    if (seen.has(issue.message)) continue;
    seen.add(issue.message);
    out.push({ ...issue, step: nblStepOfField(issue.field) });
  }
  return out;
}

/** 그 단계의 오류만 — `{ field, message }`(단계 표지는 떼고 돌려준다). */
function issuesOfStep(form: NblJudgmentFormData, step: NblInputStep): NblJudgmentIssue[] {
  return collectAll(form)
    .filter((i) => i.step === step)
    .map(({ field, message }) => ({ field, message }));
}

export function validateStepLand(form: NblJudgmentFormData): NblJudgmentIssue[] {
  return issuesOfStep(form, 0);
}
export function validateStepJudge(form: NblJudgmentFormData): NblJudgmentIssue[] {
  return issuesOfStep(form, 1);
}
export function validateStepGrace(form: NblJudgmentFormData): NblJudgmentIssue[] {
  return issuesOfStep(form, 2);
}

/** 단계 인덱스(0~2) → 그 단계 오류. 결과 단계(3)·범위 밖은 빈 배열. */
export function validateStepByIndex(form: NblJudgmentFormData, step: number): NblJudgmentIssue[] {
  if (step === 0) return validateStepLand(form);
  if (step === 1) return validateStepJudge(form);
  if (step === 2) return validateStepGrace(form);
  return [];
}

export function getStepErrorCount(form: NblJudgmentFormData, step: number): number {
  return validateStepByIndex(form, step).length;
}

/** 입력 단계 전체(0~2)의 오류 — 결과 단계 진입 전 최종 관문. */
export function validateAllSteps(form: NblJudgmentFormData): NblJudgmentIssue[] {
  return collectAll(form).map(({ field, message }) => ({ field, message }));
}
