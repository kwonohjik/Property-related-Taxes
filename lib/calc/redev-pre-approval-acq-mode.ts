/**
 * 재개발·재건축(시행령 §166) 원조합원의 **인가전 분 종전 부동산 취득가액**을 어떻게 정하는가 — ⑤·⑧·④·PHD 트리거가 공유하는 단일 leaf.
 *
 * | 반환 | 언제 | 취득가액 |
 * |---|---|---|
 * | `"actual"` | 일반 양도 · 재개발 블록 ⑤ 라디오 = 실가 | `redevActualAcquisitionPrice` |
 * | `"estimated"` | 일반 양도 · ⑤ 라디오 = 환산 **또는** 부담부증여 × 완공 아파트(원조합원) × 시가 모드 × 환산(K-5) | §166③ 환산(평가액 × 취득일 기준시가 ÷ 인가일 기준시가) |
 * | `"burdened_gift"` | 그 밖의 부담부증여 | 부담부증여 블록이 정한다(§159① — 실지취득가액 K-4 · 기준시가 모드는 기준시가) |
 *
 * 부담부증여에서는 ⑤ 라디오를 쓰지 않는다 — 산정방식은 부담부증여 블록의 K-4/K-5가 정하고, 엔진은 §159 안분값으로 계산한다
 * (`transfer-tax-burdened-gift-step.ts`). 종전에는 부담부증여에서도 ⑤ 라디오와 그 칸이 떠서 ⑧이 엔진이 읽지 않는 값을 요구했고,
 * K-5는 §166③이 아니라 일반 환산식(§176의2②2호)으로 계산됐다(2026-10-16).
 * 조합원입주권은 부담부증여에서 K-4 전용이다(설계 `burdened-gift-redevelopment-assets.engine.design.md` D-2).
 */
export type RedevPreApprovalAcqMode = "actual" | "estimated" | "burdened_gift";

/**
 * 저장된 입력(input_data — `Record<string, unknown>`)에도 쓰이도록 전부 선택형 `unknown`이다
 * (`redev-phd-trigger.ts`의 `RedevPhdSectionFields`와 같은 규약). 판정은 리터럴 비교만 한다.
 */
export interface RedevPreApprovalAcqModeFields {
  transferType?: unknown;
  assetKind?: unknown;
  useEstimatedAcquisition?: unknown;
  bgValuationMode?: unknown;
  bgAcquisitionMethod?: unknown;
  redevIsSuccessorMember?: unknown;
  redevSubject?: unknown;
  /** 승계조합원 입주권 — §166 밖(`isRedevelopmentSec166Asset`). `redevPreApprovalExpensesUnused`만 읽는다. */
  isSuccessorRightToMoveIn?: unknown;
}

export function redevPreApprovalAcqMode(asset: RedevPreApprovalAcqModeFields): RedevPreApprovalAcqMode {
  if (asset.transferType === "burdened_gift") {
    // 승계조합원은 §166 밖이다(취득가액 = 승계 실지거래가액) — 엔진 `redevSec166Conversion`과 같은 배제.
    return asset.assetKind === "redevelopment_apt" &&
      asset.redevIsSuccessorMember !== "yes" &&
      // 양도 대상이 입주권으로 남은 stale 값이면 엔진 자산 종류가 `right_to_move_in`이 되어 §166③이 켜지지 않는다(④ `primaryEnginePropertyType`)
      asset.redevSubject !== "right" &&
      asset.bgValuationMode === "sangjeungbeop_market" &&
      asset.bgAcquisitionMethod === "converted"
      ? "estimated"
      : "burdened_gift";
  }
  return asset.useEstimatedAcquisition === true ? "estimated" : "actual";
}

/**
 * ⑦ 결과 화면 — 부담부증여 × 완공 아파트 × K-5에서 엔진이 §166③으로 계산한 값(채무비율 안분 후).
 * 있으면 부담부증여 명세 카드가 일반 환산(§176의2②2호) 행 대신 이 값을 보인다 — 명세의 일반 환산값은 계산에 쓰이지 않는다.
 */
export function redevSec166DisplayOf(result: {
  transferBurdenedGiftBreakdown?: { acquisitionMethodUsed: string };
  redevelopmentDetail?: {
    valuationMeta?: { method: string };
    preApproval: { apportionedAcquisition: number };
    estimatedLumpDeduction?: number;
  };
}): { acquisition: number; lumpDeduction: number } | undefined {
  const d = result.redevelopmentDetail;
  if (result.transferBurdenedGiftBreakdown?.acquisitionMethodUsed !== "converted") return undefined;
  if (!d?.valuationMeta?.method.startsWith("estimated")) return undefined;
  return { acquisition: d.preApproval.apportionedAcquisition, lumpDeduction: d.estimatedLumpDeduction ?? 0 };
}

/**
 * 원조합원 재개발 자산 — 인가 전 분 필요경비가 개산공제(「소득세법 시행령」 §163⑥)라 재개발 블록
 * 「인가전 분 필요경비」(실비) 칸이 계산에 쓰이지 않는가. ⑤ 칸 숨김·안내 · ④ 자본적지출 안내의 단일 게이트.
 *
 * 부담부증여 × 완공 아파트:
 * - 기준시가 모드: 취득가액이 취득시 기준시가 × 채무비율(§159①1호 괄호)이라 개산공제(엔진 `burdenedGiftStdLumpBase`).
 * - 시가 · 환산(K-5): §166③ 환산 + 개산공제 — 실비와 택일이라 개산공제가 고른다(`preApprovalNecessaryExpense`).
 * - 시가 · 실지(K-4) · 입주권(K-4 고정) · 승계조합원은 실비를 쓴다.
 * 일반 양도(완공 아파트 · 원조합원 입주권):
 * - ⑤ 라디오 = 환산: §166③ 환산 + 개산공제 — 같은 택일이라 실비가 쓰이지 않는다. 환산에 필요한 취득일 기준시가가 비면 ⑧이 막으므로
 *   (개산공제 0 → 실비로 넘어가는 상태가 계산까지 가지 않는다) 숨겨도 막다른 곳이 없다.
 * 계획서 `docs/00-pm/bg-redev-apt-pre-approval-lump-deduction.plan.md` · `burdened-gift-residuals-o3-o5-o8.plan.md` D3.
 */
export function redevPreApprovalExpensesUnused(asset: RedevPreApprovalAcqModeFields): boolean {
  if (asset.redevIsSuccessorMember === "yes" || asset.isSuccessorRightToMoveIn === true) return false;
  if (asset.transferType !== "burdened_gift") {
    return (asset.assetKind === "redevelopment_apt" || asset.assetKind === "right_to_move_in") && redevPreApprovalAcqMode(asset) === "estimated";
  }
  if (asset.assetKind !== "redevelopment_apt" || asset.redevSubject === "right") return false;
  return redevPreApprovalAcqMode(asset) === "estimated" || asset.bgValuationMode !== "sangjeungbeop_market";
}
