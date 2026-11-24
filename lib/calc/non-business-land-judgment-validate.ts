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
import { collectWithFields } from "./transfer-tax-validate-field";
import type { IssueField } from "./transfer-tax-validate-field";
import { getAssetDateOrderIssue } from "./transfer-tax-validate-asset";
import { inheritedDecedentDateError } from "./transfer-tax-validate-acquisition";
import { validateCarryoverEventHead } from "./transfer-tax-validate-carryover-asset";
import { validateNblDetailedJudgment } from "./transfer-tax-validate-nbl";
import { stateHistoryFloorDate } from "./transfer-tax-validate-nbl-state-history";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";

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
