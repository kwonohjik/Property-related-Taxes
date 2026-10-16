/**
 * ⑧ 겸용주택 × 부담부증여 전용 취득·평가 검증 — `validateMixedUseAsset`(`transfer-tax-validate-mixed-use-asset.ts`)를 **대신**한다.
 *
 * ## 왜 따로 두는가 (막다른 길)
 * `validateMixedUseAsset`은 매매 + `!useEstimatedAcquisition`이면 `fixedAcquisitionPrice`/`similarSalesValue` 총액을, 그 밖에는 `useEstimatedAcquisition` 기반
 * 취득시 기준시가를 요구한다(`:84`·`:135`). 부담부증여 화면에는 그 칸이 **없다**(`CompanionAcqPurchaseBlock.tsx:348` 게이트) — 취득가액은 BG 블록이 받는다.
 * 그대로 두면 채울 칸 없는 영구 차단이다(설계 UI R2 §6.6).
 *
 * ## 규칙은 엔진 한 곳
 * MB-1~MB-18(차단·필수 입력)은 엔진 `collectMixedBurdenedGiftIssues`와 **같은 분석**(`analyzeMixedBurdenedGift`)에서 나온다. 여기서는
 *  · 폼 → 엔진 입력은 ④와 같은 함수로 만들고(`burdened-gift-mixed-use-preview.ts`),
 *  · 이슈의 `path`를 화면 입력칸(`data-field`)으로 옮기며,
 *  · 사용자에게 더 구체적인 귀속 입력 문구(모드 미선택·분할 합 불일치)를 엔진의 일반 MB-13 앞에 둔다.
 * 순서는 화면 순서 = 계산 순서다: 차단 조합 → 필수 입력(MB-11) → 귀속(MB-13) → 구분 감정평가(MB-17) → 평가 차단(MB-7) → 초과부담부(MB-10) → 부분 초과(MB-14).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedBgIssue } from "@/lib/tax-engine/mixed-use-burdened-gift-prepare";
import { analyzeMixedBgOfForm, mixedBgIssueField } from "./burdened-gift-mixed-use-preview";
import { mixedBgDebtAttribution, mixedBgDebtAttrMessage, mixedBgOverflowField } from "./burdened-gift-mixed-use-scope";
import { fieldError } from "./transfer-tax-validate-field";
import { validateMixedUseDatesAndAreas } from "./transfer-tax-validate-mixed-use-asset";

/** 화면 순서로 정렬한 이슈 묶음 — 같은 묶음 안에서는 엔진이 낸 순서를 지킨다. */
const HARD_BLOCKS = new Set(["MB-1", "MB-2", "MB-3", "MB-4", "MB-5", "MB-6", "MB-8", "MB-9", "MB-12", "MB-15", "MB-16", "MB-18"]);

function firstIssue(issues: MixedBgIssue[], pick: (i: MixedBgIssue) => boolean): MixedBgIssue | undefined {
  return issues.find(pick);
}

export function validateMixedUseBurdenedGift(
  asset: AssetForm,
  label: string,
  form: TransferFormData | undefined,
  formTransferDate: string | undefined,
  /** 함께 양도(컴패니언) 묶음·지분 분할(축 B) 안의 겸용인가 — 엔진 MB-6 */
  isCompanion: boolean,
): string | null {
  const transferDate = formTransferDate ?? form?.transferDate ?? "";

  // 1) 겸용 공통 — 취득일·토지 취득일·면적(`validateMixedUseAsset`의 앞부분과 같은 함수)
  const common = validateMixedUseDatesAndAreas(asset, label, formTransferDate);
  if (common) return common;

  const analysis = analyzeMixedBgOfForm(asset, form, transferDate, { isCompanion });
  if (!analysis) return null;
  const issues = analysis.issues;
  const fail = (i: MixedBgIssue, field?: string) => fieldError((field ?? mixedBgIssueField(i)) as never, `${label}: ${i.message}`);

  // 2) 차단 조합(MB-1~6·8·9·12·15·16·18)
  const hard = firstIssue(issues, (i) => HARD_BLOCKS.has(i.code));
  if (hard) return fail(hard);

  // 3) 필수 입력 누락(MB-11) — 양도시·취득시 4부분 기준시가, 시가 총액, K 방식별 금액
  const missing = firstIssue(issues, (i) => i.code === "MB-11");
  if (missing) return fail(missing);

  // 4) 채무 귀속 — 모드 미선택·분할 합 불일치는 항목별 구체 문구, 그 밖의 MB-13은 엔진 문구
  const attr = mixedBgDebtAttribution(asset);
  if (attr.issues.length > 0) {
    const a = attr.issues[0];
    return fieldError(a.field, `${label}: ${mixedBgDebtAttrMessage(a)}`);
  }
  const mb13 = firstIssue(issues, (i) => i.code === "MB-13");
  if (mb13) return fail(mb13);

  // 5) 구분 감정평가 선언(G-13, MB-17)
  const mb17 = firstIssue(issues, (i) => i.code === "MB-17");
  if (mb17) return fail(mb17);

  // 6) 평가 차단(MB-7) · 초과부담부(MB-10)
  const mb7 = firstIssue(issues, (i) => i.code === "MB-7");
  if (mb7) return fail(mb7, "transferType");
  const mb10 = firstIssue(issues, (i) => i.code === "MB-10");
  if (mb10) return fail(mb10, "bgLendingDepositTotal");

  // 7) 부분 초과부담부(MB-14) — C_h는 4부분·귀속이 모두 있어야 계산되므로 맨 끝
  const mb14 = firstIssue(issues, (i) => i.code === "MB-14");
  if (mb14) return fail(mb14, mixedBgOverflowField(asset, mb14.part ?? "housing"));

  return null;
}
