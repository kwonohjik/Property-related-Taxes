/**
 * 겸용주택 Case A 판정 + 4부분 토지 auto 공용 헬퍼.
 *
 * Case A = 보유 중 일부 용도변경(house→commercial) + 최초공시일 < 용도변경일.
 * 취득시·최초공시 시점에 건물 전체가 주택이었다가 양도시 일부 상가로 변경된 케이스로,
 * 토지·건물 기준시가를 주택분/상가분 4부분으로 분리 안분한다(시행령 §166⑥).
 *
 * 판정 로직은 `MixedUseLegacyStdPrice`·오케스트레이터·자산-우선 렌더가 공유(single-source).
 *
 * ## 🔴 §164⑦ 3-시점 환산(PHD)이 **켜져 있어야 성립한다** (2026-09-07 UI 리뷰 보통)
 *
 * Case A의 4부분 안분은 「**최초공시 시점**」을 축으로 하므로 PHD 없이는 정의되지 않는다.
 * 소비처 셋이 이미 그렇게 다뤄 왔다 — ④는 `primary.usePreHousingDisclosure && …` 안에서,
 * ⑧은 `if (asset.usePreHousingDisclosure)` 안에서, `MixedUsePreHousingDisclosureSection`은
 * PHD 패널의 children으로만 이 술어를 부른다. ⇒ 조건 추가는 그 셋에 **no-op**이다.
 *
 * 그런데 `MixedUseLegacyStdPrice`만 이 헬퍼를 쓰지 않고 **같은 판정을 복제**해 갖고 있었고,
 * 거기엔 PHD 조건이 없었다. 그래서 PHD를 켜서 최초고시일을 채운 뒤 **다시 끄면**
 * `isCaseA`가 참인 채로 남아
 *
 *   · 취득 블록의 `{!isCaseA && …}`가 「취득시 상가건물 기준시가」를 지우고
 *   · 양도 블록의 `{!isCaseA && …}`가 「양도시 상가건물 기준시가」·공시지가를 지우는데
 *   · PHD 패널(그 값들의 대체 입력처)도 접혀 있다
 *
 * ⇒ **화면 어디에도 칸이 없는데** ⑧은 「보유 중 일부 용도변경(주택→상가) — 취득시 상가건물
 *   기준시가를 입력하세요」로 계산을 영구 차단했다. 복제를 지우고 이 헬퍼로 합쳤다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** Case A(용도변경 house→commercial + 최초공시<용도변경) 여부. */
export function isMixedUseCaseA(asset: AssetForm): boolean {
  // 4부분 안분의 축인 「최초공시 시점」은 PHD에서만 나온다 — 헤더 주석 참조.
  if (!asset.usePreHousingDisclosure) return false;
  if (!asset.hasPartialUsageChange || asset.partialChangeDirection !== "house_to_commercial") {
    return false;
  }
  if (!asset.phdFirstDisclosureDate || !asset.partialChangeDate) return false;
  const fd = new Date(asset.phdFirstDisclosureDate);
  const uc = new Date(asset.partialChangeDate);
  return !Number.isNaN(fd.getTime()) && !Number.isNaN(uc.getTime()) && fd < uc;
}

/**
 * 자산분 토지기준시가 = floor(공시지가 × 그 자산분 면적).
 * area는 호출부에서 `parseFloat(x.toFixed(2))`로 사전 반올림해 전달(표시=계산 일치).
 * 값이 없으면 null(미표시).
 */
export function landStdForArea(pricePerSqm: number, area: number): number | null {
  return pricePerSqm > 0 && area > 0 ? Math.floor(pricePerSqm * area) : null;
}
