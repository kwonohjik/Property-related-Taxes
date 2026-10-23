/**
 * ⑧ 일반건물 건물 파트 이월과세 × 증여자 신축·증축(소득세법 §114조의2) 검증 (PR-5a) — `validateGbCarryover`의 건물 파트 환산 검증 뒤에서 부른다.
 *
 * 규칙은 ⑫(`refineGbBuildingDonorBuilt` + 엔진 모양 shape 의 `refineDonorBuiltInCarryover`)·엔진(`assertDonorBuiltInput`)과 **같은 조건**이다 — UI 통과 ↔ 400 모순 0.
 * 게이트는 ⑤·④와 같은 술어(`donorBuiltGbActive`) — 범위 밖(환산 OFF·증축 3-way·부담부증여)에서 켜 둔 stale 토글은 요구하지 않는다(화면에 없는 칸을 요구하지 않는다).
 * 신축·증축일을 증여자 취득일로 **대신 채우지 않는다**(자동 fallback 금지) — 비면 차단한다.
 * 앵커는 건물 서브폼 칸(`buildingCarryover.donorBuilt*`)이다 — 건물 블록의 편집이 그쪽으로 간다(`GbBuildingCarryoverCard`).
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { donorBuiltGbActive, gbBuildingCarryoverForm } from "./donor-built-gb-scope";
import { gbCarryoverEventSource, gbCarryoverUsesPartShape } from "./transfer-tax-api-gb-carryover";
import { fieldError } from "./transfer-tax-validate-field";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function validateDonorBuiltGb(asset: AssetForm, label: string): string | null {
  if (!donorBuiltGbActive(asset)) return null;
  const c = gbBuildingCarryoverForm(asset)!;

  if (c.donorBuiltType === "")
    return fieldError("buildingCarryover.donorBuiltType", `${label}: 증여자가 신축한 건물인지 증축한 건물인지 구분을 선택하세요 (소득세법 §114조의2).`);
  if (!c.donorBuiltDate)
    return fieldError(
      "buildingCarryover.donorBuiltDate",
      `${label}: 증여자의 ${c.donorBuiltType === "extension" ? "증축 완공일" : "신축 취득일(사용승인서 교부일 등)"}을 입력하세요 — 증여자 취득일로 대신 채우지 않습니다 (5년 기산점).`,
    );
  if (c.donorBuiltDate < c.donorAcquisitionDate)
    return fieldError("buildingCarryover.donorBuiltDate", `${label}: 신축·증축일은 건물 증여자 취득일(${c.donorAcquisitionDate}) 이후여야 합니다.`);
  // 증여 등기접수일은 ④가 보내는 모양을 따른다 — 신규 파트 모양이면 사건 출처의 값, 엔진 모양이면 건물 서브폼 자기 값(`buildEngineShaped`)
  const giftRegistryDate = gbCarryoverUsesPartShape(gbCarryoverEventSource(asset)) ? gbCarryoverEventSource(asset)?.giftRegistryDate : c.giftRegistryDate;
  if (giftRegistryDate && c.donorBuiltDate > giftRegistryDate)
    return fieldError("buildingCarryover.donorBuiltDate", `${label}: 신축·증축일은 증여 등기접수일(${giftRegistryDate}) 이전이어야 합니다 — 증여자가 신축·증축한 건물이어야 합니다.`);

  if (c.donorBuiltType === "extension") {
    if (!(parseDecimal(c.donorBuiltExtensionArea) > 0))
      return fieldError("buildingCarryover.donorBuiltExtensionArea", `${label}: 증축 바닥면적 합계를 입력하세요 (85㎡ 초과만 대상입니다).`);
    if (!(parseAmount(c.donorBuiltExtensionStdPrice) > 0))
      return fieldError(
        "buildingCarryover.donorBuiltExtensionStdPrice",
        `${label}: 증축 부분의 증여자 취득(완공) 당시 기준시가 총액을 입력하세요 — 가산세 기준은 증축한 부분에 한정한 환산취득가액입니다.`,
      );
  }
  return null;
}
