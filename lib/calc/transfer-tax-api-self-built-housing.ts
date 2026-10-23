/**
 * ④ 일체 주택 **본인 신축** × §114조의2 가산세 base 건물분 입력 `selfBuiltHousing` 와이어 조립 — 단건·다건·컴패니언 3곳이 **같은 이 함수**를 부른다.
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§7.5 · §9 PR-2 · V-3)
 *
 * · 전송 게이트는 ⑤·⑧과 **같은 술어**(`selfBuiltHousingScope`) — 범위 밖에서 켜 둔 stale 값(방식 변경·5년 경과·PHD ON 등)은 보내지 않는다.
 *   술어가 참인데 칸이 비었으면 키는 싣고 값은 **비운다**(0·합성 없음) — ⑧이 먼저 막고, 직접 호출은 ⑫·엔진이 400 으로 거부한다(조용히 지어내지 않는다).
 * · 중첩 객체인 이유: 최상위 평문 칸(`landStdPriceAtTransfer` 등)은 토지·건물 분리 계산(`calcSplitGain`)이 읽어 양도차익이 바뀐다. 이 객체는 **가산세 base 만** 바꾼다.
 * · 지분 스케일(Q-12): 구분 기재 양도가액과 건물 감정가액(= 감정가액 총액과 같은 축)만 지분율을 곱한다. 기준시가·면적은 물건 속성이라 스케일하지 않는다(환산식에서 약분).
 * · 면적 척도(V-3): 주택공시가격(H·H_T)은 **주택 전체** 값이므로 토지 기준시가도 **전체 토지 면적**이어야 같은 척도다. 일부 양도(`partial`)의 `transferArea` 는
 *   양도분 면적이라 쓰지 않고 `acquisitionArea`(취득 당시 전체 면적)를 취득·양도 양쪽에 쓴다. 한 면적(`same`)이면 둘이 같은 값이다.
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { selfBuiltHousingScope, type SelfBuiltHousingScopeCtx } from "./self-built-housing-scope";
import { buildSaleSplitWire } from "./transfer-tax-api-sale-split";
import { isPartialAreaScenario } from "./transfer-pre1990-housing-land-bridge";
import { resolveLandStdAtTransfer } from "./transfer-tax-split-acq-mode";

const pos = (n: number): number | undefined => (n > 0 ? n : undefined);

/**
 * 양도 당시 토지 기준시가 L_T — 주택공시가격(H_T)과 같은 척도. 일부 양도는 양도분 면적이 아니라 취득 당시 전체 면적을 곱한다(V-3).
 * ⑧(`validateSelfBuiltHousing`)이 같은 함수로 «보낼 값이 있는가»를 판정한다.
 */
export function selfBuiltLandStdAtTransfer(asset: AssetForm): number | undefined {
  if (!isPartialAreaScenario(asset)) return resolveLandStdAtTransfer(asset);
  const perSqm = parseAmount(asset.standardPricePerSqmAtTransfer);
  const area = parseDecimal(asset.acquisitionArea);
  return perSqm > 0 && area > 0 ? multiplyByArea(perSqm, area) : undefined;
}

export interface SelfBuiltHousingWire {
  landPricePerSqmAtAcquisition?: number;
  landArea?: number;
  buildingStdPriceAtAcquisition?: number;
  landStdPriceAtTransfer?: number;
  buildingStdPriceAtTransfer?: number;
  sale?: ReturnType<typeof buildSaleSplitWire>;
  buildingAppraisalValue?: number;
}

/** `selfBuiltHousing` 와이어 객체 — 범위 밖이면 undefined(키를 싣지 않는다) */
export function buildSelfBuiltHousingPayload(
  asset: AssetForm,
  ctx: SelfBuiltHousingScopeCtx,
  ownershipRatio: number,
): SelfBuiltHousingWire | undefined {
  const scope = selfBuiltHousingScope(asset, ctx);
  if (!scope) return undefined;
  const wire: SelfBuiltHousingWire = {};
  if (scope.directAppraisal) {
    const direct = parseAmount(asset.selfBuiltBuildingAppraisal);
    // 감정가액 총액(`appraisalValue`)과 같은 지분 스케일 — 건물 감정가액은 그 부분집합이다
    const scaled = ownershipRatio < 1 ? applyRatio(direct, ownershipRatio) : direct;
    const v = pos(scaled);
    if (v != null) wire.buildingAppraisalValue = v;
  }
  if (scope.acq) {
    const perSqm = pos(parseAmount(asset.standardPricePerSqmAtAcq));
    const area = pos(parseDecimal(asset.acquisitionArea));
    const building = pos(parseAmount(asset.buildingStandardPriceAtAcq));
    if (perSqm != null) wire.landPricePerSqmAtAcquisition = perSqm;
    if (area != null) wire.landArea = area;
    if (building != null) wire.buildingStdPriceAtAcquisition = building;
  }
  if (scope.sale) {
    const landT = pos(selfBuiltLandStdAtTransfer(asset) ?? 0);
    const buildingT = pos(parseAmount(asset.buildingStandardPriceAtTransfer));
    if (landT != null) wire.landStdPriceAtTransfer = landT;
    if (buildingT != null) wire.buildingStdPriceAtTransfer = buildingT;
    const sale = buildSaleSplitWire(asset, ctx.transferDate, ownershipRatio);
    if (Object.keys(sale).length > 0) wire.sale = sale;
  }
  return wire;
}

/** body 에 spread — 범위 밖이면 빈 객체(키 자체를 싣지 않는다 = 응답 불변) */
export function withSelfBuiltHousing(
  asset: AssetForm | undefined,
  ctx: SelfBuiltHousingScopeCtx,
  ownershipRatio: number,
): { selfBuiltHousing?: SelfBuiltHousingWire } {
  const selfBuiltHousing = asset ? buildSelfBuiltHousingPayload(asset, ctx, ownershipRatio) : undefined;
  return selfBuiltHousing ? { selfBuiltHousing } : {};
}
