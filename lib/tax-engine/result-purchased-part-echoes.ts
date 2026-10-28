/**
 * 집계(E1 주택·토지·상업용건물 · E2 일반건물) 결과에서 **이월과세 시나리오 A로 채무 부분(매입분)을 나눈 카드의 echo**를 모은다 — 결과 면(상세명세서·PDF)의 단일 수집 지점.
 *
 * 엔진은 채무가 있는 부모 카드마다 `carryoverTaxationDetail.scenarioA.purchasedPartSplit`을 싣는다(**채택이 B여도** 싣는다 — 반사실 실행).
 * 세액에 쓰인 것은 채택된 시나리오뿐이므로 «나누어 계산했다»는 고지는 **A 채택**일 때만 모은다. B 채택이면 A′는 세액에 반영되지 않았다(비교 카드가 그 열을 그린다).
 * 값은 전부 엔진 echo이고 여기서 새로 계산하지 않는다(표시 드리프트 방지). 라벨은 부모 카드 라벨이다 — 여러 카드면 귀속을 밝힌다.
 * `gb-result-donor-built-echoes.ts`(증여자 신축 echo 수집)와 같은 모양이다.
 */
import type { CarryoverPurchasedPartSplit } from "./types/transfer-carryover.types";

export interface PurchasedPartEchoEntry {
  /** 어느 카드(자산)의 echo인가 — 결과에서 여러 장일 때 귀속을 밝힌다 */
  label: string;
  split: CarryoverPurchasedPartSplit;
}

export function purchasedPartResultEchoes(
  properties: ReadonlyArray<{
    propertyId: string;
    propertyLabel?: string;
    carryoverTaxationDetail?: { adoptedScenario?: "A" | "B"; scenarioA?: { purchasedPartSplit?: CarryoverPurchasedPartSplit } };
  }>,
): PurchasedPartEchoEntry[] {
  return properties.flatMap((p) => {
    const d = p.carryoverTaxationDetail;
    const split = d?.scenarioA?.purchasedPartSplit;
    return split && d?.adoptedScenario === "A" ? [{ label: p.propertyLabel ?? p.propertyId, split }] : [];
  });
}
