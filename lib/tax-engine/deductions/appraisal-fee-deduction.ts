/**
 * 감정평가수수료 공제 (상속 §25①2호·시행령 §20의3 / 증여 §55①·시행령 §46의2 → §20의3 준용)
 *
 * 상속·증여 단일 진실. §46의2가 §20의3을 통째로 준용하므로 한도·요건 동일,
 * lawRef만 ctx.taxType으로 분기 (증여는 §46의2, 법문 "상속재산"인 §20의3 직접 인용 금지).
 *
 * 한도 (§20의3③):
 *   - 1호 부동산 등 / 3호 유형재산: 각 500만원
 *   - 2호 비상장주식 신용평가: 평가대상 법인 수 × 신용평가기관 수 × 1천만원
 *   - 1호는 그 감정가액으로 신고·납부한 경우에만 적용 (§20의3②)
 *
 * 정수 연산: 한도는 정액 — Math.min만 사용, 절사 불요.
 */
import type {
  AppraisalFeeInput,
  AppraisalFeeResult,
  AppraisalFeeBreakdownItem,
} from "../types/inheritance-gift.types";
import { INH, GIFT } from "../legal-codes";

export const APPRAISAL_FEE_LIMITS = {
  REAL_ESTATE: 5_000_000,
  UNLISTED_PER_UNIT: 10_000_000,
  TANGIBLE: 5_000_000,
} as const;

/**
 * @param fee 감정평가수수료 입력 (미입력 시 0)
 * @param ctx.hasAppraisalValuation §20의3② — 감정가액으로 신고한 자산 존재 여부 (1호 eligibility)
 * @param ctx.taxType lawRef 분기 (상속 §20의3 / 증여 §46의2 준용)
 */
export function calcAppraisalFeeDeduction(
  fee: AppraisalFeeInput | undefined,
  ctx: { hasAppraisalValuation: boolean; taxType: "inheritance" | "gift" },
): AppraisalFeeResult {
  if (!fee) return { total: 0, breakdown: [], warnings: [] };

  const breakdown: AppraisalFeeBreakdownItem[] = [];
  const warnings: string[] = [];
  const enfRef = ctx.taxType === "inheritance" ? INH.APPRAISAL_FEE_ENF : GIFT.APPRAISAL_FEE_ENF;
  const refSuffix = ctx.taxType === "gift" ? " (§20의3 준용)" : "";

  // 1호 부동산 등 — §20의3②: 감정가액으로 신고·납부한 경우에만 공제
  const realEstateInput = fee.realEstateAppraisalFee ?? 0;
  let realEstate = 0;
  if (realEstateInput > 0) {
    if (ctx.hasAppraisalValuation) {
      realEstate = Math.min(realEstateInput, APPRAISAL_FEE_LIMITS.REAL_ESTATE);
      breakdown.push({
        label: "부동산 등 감정평가 수수료 (1호)",
        amount: realEstate,
        lawRef: `${enfRef} 1호${refSuffix}`,
      });
    } else {
      warnings.push(
        "부동산 감정평가 수수료는 감정가액으로 신고·납부한 경우에만 공제됩니다 (시행령 §20의3②).",
      );
    }
  }

  // 2호 비상장주식 신용평가 — 1천만 × 법인수 × 기관수
  const unlistedInput = fee.unlistedStockAppraisalFee ?? 0;
  let unlisted = 0;
  if (unlistedInput > 0) {
    const unitLimit =
      APPRAISAL_FEE_LIMITS.UNLISTED_PER_UNIT *
      Math.max(1, fee.unlistedTargetCount ?? 1) *
      Math.max(1, fee.unlistedAgencyCount ?? 1);
    unlisted = Math.min(unlistedInput, unitLimit);
    breakdown.push({
      label: "비상장주식 등 신용평가 수수료 (2호)",
      amount: unlisted,
      lawRef: `${enfRef} 2호${refSuffix}`,
    });
  }

  // 3호 유형재산 (서화·골동품 등)
  const tangibleInput = fee.tangibleAppraisalFee ?? 0;
  let tangible = 0;
  if (tangibleInput > 0) {
    tangible = Math.min(tangibleInput, APPRAISAL_FEE_LIMITS.TANGIBLE);
    breakdown.push({
      label: "서화·골동품 등 유형재산 감정수수료 (3호)",
      amount: tangible,
      lawRef: `${enfRef} 3호${refSuffix}`,
    });
  }

  const total = realEstate + unlisted + tangible;
  if (total > 0) {
    warnings.push(
      "수수료 지급사실 입증서류를 과세표준 신고와 함께 제출해야 합니다 (시행령 §20의3④).",
    );
  }
  return { total, breakdown, warnings };
}
