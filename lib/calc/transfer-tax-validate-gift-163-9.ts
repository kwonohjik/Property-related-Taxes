/**
 * §163⑨ 증여 추계모드 차단 — 표준·상가 공용 검증 헬퍼.
 *
 * 소득세법 시행령 §163⑨: 증여받은 자산은 증여일 현재 §60~66 평가액(증여 신고가액)을 취득당시
 * 실지거래가액으로 의제한다 → 취득가액이 항상 확인 가능 → 추계(§176의2 환산·감정가액·매매사례가액)는
 * 법적 불필요·위반. 따라서 post-1985 증여는 실거래가 모드(신고가액=취득가액)를 강제한다.
 *
 * - pre-1985 증여는 §176의2④ 의제취득 영역이라 제외(게이트 false → 기존 환산 fallback 유지·회귀-safe).
 * - 부담부증여(transferType)는 UI가 추계모드를 미노출(CompanionAcqPurchaseBlock:309)이나 방어적 제외.
 * - GB(general_building)·재개발은 자체 validator(transfer-tax-validate-gb/redev.ts)에서 처리,
 *   겸용(mixed-use)은 자체 경로에서 처리 → 이 헬퍼는 표준(주택·토지·건물·분양권 등)·상가 전용.
 * - pre1990 토지등급 래치(land)는 이 모드 flag가 아니라 `hasPre1990` 정의 게이트로 별도 차단
 *   (transfer-tax-api.ts:86 · transfer-tax-validate-asset.ts hasPre1990).
 *
 * 정합: docs/02-design/features/transfer-standard-commercial-gift-163-9-block.plan.md · 겸용#726·GB/재개발#727
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export function giftEstimatedModeError(asset: AssetForm, label: string): string | null {
  if (
    asset.acquisitionCause === "gift" &&
    asset.transferType !== "burdened_gift" &&
    (asset.acquisitionDate ?? "") >= "1985-01-01" &&
    (asset.useEstimatedAcquisition || asset.isAppraisalAcquisition || asset.isSalesCaseAcquisition)
  ) {
    return `${label}: 증여 취득 자산은 환산취득가·감정가액·매매사례가액을 지원하지 않습니다. 실거래가 모드로 증여일 평가액(신고가액)을 취득가액으로 입력하세요. (소득세법 시행령 §163⑨)`;
  }
  return null;
}
