/**
 * 일반건물 ⑧ — **이월과세(§97의2) 입력 검증**
 *
 * `transfer-tax-validate-gb.ts`에서 분리(2026-08-13, 800줄 정책). 로직 변경 없이 순수 추출.
 * 호출부는 `validateGeneralBuildingAsset` 하나뿐이고, 그 함수의 **첫 관문**이다.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

/**
 * ⑧ 이월과세(§97의2) 입력 검증 — 일반건물 전용.
 *
 * 🔴 **가장 위험한 실패 모드를 막는다.** ④ `buildGbCarryoverPayload`는 증여 등기접수일이나
 *    증여자 취득일이 비면 서브객체를 만들지 않는다 ⇒ **조용히 미발동**으로 되돌아간다.
 *    사용자는 입력했다고 믿는데 세액이 안 바뀐다 — 이 기능이 애초에 고치려던 그 증상이다.
 *
 * ⇒ ④와 **같은 조건**을 본다(메모리 `feedback_shared_predicate_argument_parity`).
 *
 * ⚠️ **UI에 있는 칸만 요구한다.** 건물 파트를 안 골랐으면 건물 칸을 묻지 않는다.
 */
export function validateGbCarryover(asset: AssetForm, label: string): string | null {
  const landIsCarryover = asset.acquisitionCause === "carryover_gift";
  const buildingIsCarryover = asset.gbBuildingAcquisitionCause === "carryover_gift";
  if (!landIsCarryover && !buildingIsCarryover) return null;

  const c = asset.carryover;

  /**
   * §97조의2 ① **관계요건** — 증여 **사건**의 사실이라 토지 쪽(`c`) 하나가 정본이다.
   * 일반 경로(`transfer-tax-validate-asset.ts`)와 **같은 조건**을 본다 —
   * 관계는 단독 필수화하지 않고, 사망을 선언했을 때만 요구한다.
   *
   * 🔑 **부담부증여 조기 반환보다 앞에 둔다** (O-3, 2026-08-10).
   *    아래 조기 반환은 「당초 증여자」 입력 요구를 가로채지 않으려는 것인데,
   *    ① 본문 요건은 그 요구와 **직교**다. 뒤에 두면 부담부증여에서 「그 외」를 고른
   *    사용자가 **아무 안내 없이** 이월과세만 조용히 꺼진다(엔진은 정확히 배제하므로
   *    세액은 맞지만, 왜 안 걸렸는지 화면이 말해 주지 않는다). BG-W-01·02가 고정한다.
   */
  if (c?.donorRelation === "other")
    return `${label}: 이월과세는 배우자 또는 직계존비속으로부터 증여받은 경우에만 적용됩니다 (「소득세법」 제97조의2 제1항). 취득 원인을 "증여"로 변경하세요.`;

  if (c?.donorDeceased && !c.donorRelation)
    return `${label}: 증여자와의 관계를 선택하세요 (「소득세법」 제97조의2 제1항).`;

  /**
   * 🔴 **나머지는 부담부증여에서 손대지 않는다** (2026-08-10 정정).
   *
   * 초안은 「범위 밖이니 차단」이었다. **틀렸다** — 그 사이 다른 줄기(D-7a·D-7b,
   * `burdened-gift-carryover-159-97-2.plan.md`)가 **지원을 열었다**. 근거는 국세청
   * 재산세과-1059: 「영 §159 제1호에 따른 취득가액 산정 시 §97①1호 가액에 **이월과세가
   * 적용되는 것임**」. 그쪽 ⑧는 「당초 증여자」 두 벌 입력을 요구한다.
   *
   * 여기서 차단 메시지를 띄우면 그 요구가 화면에 닿기 전에 가로채 **지원된 기능이 막힌다**
   * (E2E `transfer-burdened-gift-carryover-block.spec.ts` CB-2로 실측).
   *
   * ⇒ 이 아래는 **일반 양도의 GB 이월과세**만 본다. 부담부증여는 그쪽 경로에 맡긴다.
   */
  if (asset.transferType === "burdened_gift") return null;

  if (!c?.giftRegistryDate)
    return `${label}: 증여 등기접수일을 입력하세요 (「소득세법」 제97조의2 제3항 — 적용기간 기산일).`;

  const parts: Array<[CarryoverTaxationForm | undefined, string]> = [];
  if (landIsCarryover) parts.push([c, `${label} 토지`]);
  if (buildingIsCarryover) parts.push([asset.buildingCarryover ?? c, `${label} 건물`]);

  for (const [p, partLabel] of parts) {
    if (!p?.donorAcquisitionDate)
      return `${partLabel}: 증여자의 취득일을 입력하세요 (「소득세법」 제95조 제4항 — 보유기간 기산일).`;
    if (!parseAmount(p.giftDateValuation))
      return `${partLabel}: 증여 당시 평가액을 입력하세요 (비교과세 시나리오 B 취득가액).`;
    if (p.useEstimatedAcquisition) {
      if (!p.estimationMode)
        return `${partLabel}: 증여자 취득가액의 환산 방식을 선택하세요.`;
      if (!parseAmount(p.donorStandardPriceAtAcquisition))
        return `${partLabel}: 증여자 취득 당시 기준시가를 입력하세요 (환산 분자).`;
    } else if (!parseAmount(p.donorAcquisitionPrice)) {
      return `${partLabel}: 증여자의 취득가액을 입력하세요 (「소득세법」 제97조의2 제1항 제1호).`;
    }
  }

  /**
   * 🔑 **Σ 검증** — 영 §163의2②의 안분 분모가 사용자 입력이라, 파트 합이 분모를 넘으면
   *    증여세 상당액 합계가 산출세액을 초과한다. 엔진은 파트별로만 보므로 여기서 잡는다.
   *    (분모를 안 넣었으면 legacy `giftTaxAmount` 경로라 검증 대상이 아니다.)
   */
  const giftTaxBase = parseAmount(c.giftTaxBase);
  if (giftTaxBase > 0) {
    const sum = parts.reduce((s, [p]) => s + parseAmount(p?.giftDateValuation), 0);
    if (sum > giftTaxBase)
      return `${label}: 파트별 증여 당시 평가액 합계(${sum.toLocaleString()}원)가 증여세 과세가액(${giftTaxBase.toLocaleString()}원)을 초과합니다.`;
  }
  return null;
}
