/**
 * ⑧ 기타토지 소유기간 중 건축물 이력(NBL-STATE-HISTORY-U1) 검증 — `validateNblOtherLand`의 지목 게이트 직후에서 부른다.
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §8 (규칙 #1~#8 · #11)
 *
 *   #1 질문 미선택(모드 `""`)        — 미입력 ≠ 미해당. 「모름」은 막지 않는다(현행 + 확인 필요).
 *   #2~#8 `changed`의 사건 행·순서    — **⑫와 같은 leaf**(`stateEventSequenceIssue`)·같은 문구. 별도 판정을 재정의하지 않는다.
 *   #6 하한일(소유 시작) — ⑧만 건다(⑫는 `floorDate`를 넘기지 않는다: 지분별 raw가 다른 취득일을 가져 늦은 지분이 400이 되는 것을 막는다).
 *      축 B 번들은 전 지분의 취득일 중 가장 이른 날(첫 카드가 가장 이르다는 보장이 없다 — UV-5 실측).
 *   #11 철거 행의 `propertyTaxTypeBefore` 미선택 — **규칙 없음**(선택 칸 — `""` = 모름 → 종합합산 + 확인 필요).
 *
 * E3-③ A — **주택부수토지 카드도 같은 함수**가 검증한다(게이트 `nblStateHistoryApplies` = 기타토지 ∨ 주택 · 접두 «주택 부수토지 —» · 사건 주체 `house`):
 *   #H1 질문 미선택 · #H2~H3 순서(⑫와 같은 leaf) · #H4 `tax_type_changed` 금지 · #H5 마지막 건축물 사건 = 신축(D-1·D-2 — `stateEventSequenceIssue`의 `subject: "house"`가 같은 호출 안에서 적용)
 *   #H9 철거 행 «철거 직전 주택 정착면적» — 빈칸·비수치·0·음수·정착면적 > 토지 면적 전부 차단(Q-10 (가) · 엔진 leaf `houseFootprintIssue`). **⑫에는 거울이 없다**(직접 API는 400 없이 엔진이 접는다).
 *      탈출구 = 이력 질문 «모름»(문구에 포함 — 엔진 D-17).
 *
 * 게이트는 ⑤ 렌더·④ 전송과 같은 술어(`nblStateHistoryApplies`). 어긋나면 «화면에 없는 칸을 요구하며 영구 차단»이 된다.
 * 필드 키는 리터럴 접두 형태로 둔다 — 정적 게이트(`transfer-validation-field-anchor-coverage`)가 `${…}`를 `*`로 정규화해 읽는다.
 */
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { STATE_HISTORY_MODE_REQUIRED_MESSAGE } from "@/lib/tax-engine/non-business-land/nbl-validation-messages";
import { stateEventSequenceIssue } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateEventSubjectOf } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { housePriorFootprintIssueOf } from "./nbl-other-state-history-scope";
import { nblHousingStateHistoryApplies } from "./nbl-other-state-history-scope";
import { nblStateHistoryApplies } from "./nbl-other-state-history-scope";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";
import { isFullFractionalBundle } from "./transfer-tax-api-asset-basics";
import { fieldError } from "./transfer-tax-validate-field";

export interface StateHistoryValidateCtx {
  /** 양도일(ISO). 없거나 해석 불가면 «양도일 당일·이후» 규칙은 건너뛴다(앞 단계 검증 몫). */
  transferDate?: string;
  /** 하한일(ISO) — `stateHistoryFloorDate`. 없으면 «소유 시작 전» 규칙은 건너뛴다. */
  floorDate?: string;
  /** 축 B 둘째 이후 지분 카드 — 이력 질문이 첫 카드에만 있으므로 요구하지 않는다. */
  skip?: boolean;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ⑧ #6 하한일 — 이월과세는 증여자 취득일 · 일반은 취득일(`nblAcquisitionDateOf`).
 * 축 B(같은 땅을 지분으로 나눠 취득) 번들은 전 지분의 `nblAcquisitionDateOf` 중 가장 이른 날이다.
 * 날짜가 하나도 해석되지 않으면 `undefined`(규칙 건너뜀 — 앞 단계 취득일 검증이 먼저 막는다).
 */
export function stateHistoryFloorDate(form: Pick<TransferFormData, "assets" | "assetSplitMode">, asset: AssetForm): string | undefined {
  const own = nblAcquisitionDateOf(asset);
  if (!isFullFractionalBundle(form.assets, form.assetSplitMode)) return ISO.test(own) ? own : undefined;
  const dates = form.assets.map(nblAcquisitionDateOf).filter((d) => ISO.test(d)).sort();
  return dates[0];
}

/** 이력 질문·사건 행 검증. 첫 오류 메시지 또는 null. */
export function validateNblStateHistory(asset: AssetForm, label: string, ctx: StateHistoryValidateCtx = {}): string | null {
  if (ctx.skip || !nblStateHistoryApplies(asset)) return null;
  const prefix = `${label}: ${nblHousingStateHistoryApplies(asset) ? "주택 부수토지" : "기타토지"} — `;
  const mode = asset.nblOtherStateHistoryMode;
  if (!mode) return fieldError("nblOtherStateHistoryMode", `${prefix}${STATE_HISTORY_MODE_REQUIRED_MESSAGE}`);
  if (mode !== "changed") return null;

  const issue = stateEventSequenceIssue(asset.nblOtherStateEvents ?? [], {
    transferDate: ctx.transferDate ?? "",
    floorDate: ctx.floorDate,
    subject: stateEventSubjectOf(asset.nblLandType),
  });
  if (!issue) return housePriorFootprintError(asset, prefix);
  const message = `${prefix}${issue.message}`;
  if (issue.field === "events" || issue.index === null) return fieldError("nblOtherStateEvents", message);
  if (issue.field === "kind") return fieldError(`nblOtherStateEvents.${issue.index}.kind`, message);
  return fieldError(`nblOtherStateEvents.${issue.index}.date`, message);
}

/** E3-③ A #H9 — 주택 구간을 닫는 철거 행의 정착면적. 행 순서(화면 순서)대로 첫 결함. 주택 카드가 아니면 `housePriorFootprintIssueOf`가 null이다. */
function housePriorFootprintError(asset: AssetForm, prefix: string): string | null {
  const events = asset.nblOtherStateEvents ?? [];
  for (let i = 0; i < events.length; i++) {
    const issue = housePriorFootprintIssueOf(asset, i);
    if (issue) return fieldError(`nblOtherStateEvents.${i}.houseFootprintBefore`, `${prefix}${issue.message}`);
  }
  return null;
}
