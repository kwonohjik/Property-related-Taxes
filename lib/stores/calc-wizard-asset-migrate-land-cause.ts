/**
 * `landCauseHost` 구 세션 도출 (D1-2) — 계획서 docs/00-pm/transfer-acq-cause-mixed.plan.md §10.2 T-8.
 *
 * 이 필드가 생기기 전에는 「토지는 다른 원인으로 취득」 토글이 신축에만 있었다. 그래서 원인이 저장돼 있고
 * 지금 신축이면 신축에서 켠 것이고, 그 밖(매매 등)이면 신축에서 켠 뒤 원인을 바꾼 **잔재**다 — 잔재는 `""`로
 * 두어 무효로 읽힌다(값 자체는 지우지 않는다). 이미 값이 있으면 건드리지 않는다(멱등).
 * `fillMissingFromFactory`(기본값 `""`)보다 **먼저** 돌아야 한다.
 */
export function deriveLandCauseHost(a: Record<string, unknown>): void {
  if (a.landCauseHost !== undefined) return;
  a.landCauseHost = a.landAcquisitionCause && a.acquisitionCause === "newConstruction" ? "newConstruction" : "";
}
