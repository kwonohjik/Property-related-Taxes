/**
 * ⑧ split 건물 파트 이월과세 × 증여자 신축·증축(소득세법 §114조의2) 검증 (PR-3) — `validateSplitCarryoverParts`의 건물 파트 환산 검증 뒤에서 부른다.
 *
 * 규칙은 ⑫(`refineSplitDonorBuilt`)·엔진(`assertDonorBuiltPartInput`)과 **같은 조건**이다 — UI 통과 ↔ 400 모순 0.
 * 게이트는 ⑤·④와 같은 술어(`donorBuiltPartActive`) — 범위 밖에서 켜 둔 stale 토글은 요구하지 않는다.
 * 신축·증축일을 증여자 취득일로 **대신 채우지 않는다**(자동 fallback 금지) — 비면 차단한다.
 * 앵커는 자산 전체 입력과 같은 `carryover.donorBuilt*` 칸이다(건물 파트의 서브폼이 `carryover`다).
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { donorBuiltPartActive, type DonorBuiltPartOpts } from "./donor-built-part-scope";
import { fieldError } from "./transfer-tax-validate-field";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function validateDonorBuiltPart(asset: AssetForm, label: string, opts: DonorBuiltPartOpts = {}): string | null {
  if (!donorBuiltPartActive(asset, opts)) return null;
  const c = asset.carryover!;

  if (c.donorBuiltType === "")
    return fieldError("carryover.donorBuiltType", `${label}: 증여자가 신축한 건물인지 증축한 건물인지 구분을 선택하세요 (소득세법 §114조의2).`);
  if (!c.donorBuiltDate)
    return fieldError(
      "carryover.donorBuiltDate",
      `${label}: 증여자의 ${c.donorBuiltType === "extension" ? "증축 완공일" : "신축 취득일(사용승인서 교부일 등)"}을 입력하세요 — 증여자 취득일로 대신 채우지 않습니다 (5년 기산점).`,
    );
  if (c.donorBuiltDate < c.donorAcquisitionDate)
    return fieldError("carryover.donorBuiltDate", `${label}: 신축·증축일은 건물 증여자 취득일(${c.donorAcquisitionDate}) 이후여야 합니다.`);
  if (c.donorBuiltDate > c.giftRegistryDate)
    return fieldError("carryover.donorBuiltDate", `${label}: 신축·증축일은 증여 등기접수일(${c.giftRegistryDate}) 이전이어야 합니다 — 증여자가 신축·증축한 건물이어야 합니다.`);

  if (c.donorBuiltType === "extension") {
    if (!(parseDecimal(c.donorBuiltExtensionArea) > 0))
      return fieldError("carryover.donorBuiltExtensionArea", `${label}: 증축 바닥면적 합계를 입력하세요 (85㎡ 초과만 대상입니다).`);
    if (!(parseAmount(c.donorBuiltExtensionStdPrice) > 0))
      return fieldError(
        "carryover.donorBuiltExtensionStdPrice",
        `${label}: 증축 부분의 증여자 취득(완공) 당시 기준시가 총액을 입력하세요 — 가산세 기준은 증축한 부분에 한정한 환산취득가액입니다.`,
      );
  }
  return null;
}
