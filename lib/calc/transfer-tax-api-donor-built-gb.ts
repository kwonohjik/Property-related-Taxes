/**
 * ④ 일반건물 건물 파트 이월과세 `buildingCarryover*.donorBuilt`(증여자 신축·증축, 소득세법 §114조의2) 페이로드 빌드 (PR-5a).
 *
 * 전송 게이트는 ⑤·⑧과 **같은 술어**(`donorBuiltGbActive`) — 범위 밖에서 켜 둔 stale 값은 보내지 않는다.
 * 일체 주택 안분(`housing`)은 없다 — 토지·건물이 카드로 이미 나뉘어 건물분 그 자체다.
 * 비어 있는 필수 칸은 `undefined`/빈 문자열로 보내 ⑫가 거부하게 한다(⑧이 먼저 막는다) — 조용히 지어내지 않는다(신축일을 증여자 취득일로 채우지 않는다).
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { donorBuiltGbActive, gbBuildingCarryoverForm } from "./donor-built-gb-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const pos = (n: number): number | undefined => (n > 0 ? n : undefined);

export interface GbDonorBuiltPayload {
  buildingType: "new" | "extension";
  constructionDate: string;
  extensionFloorArea?: number;
  extensionStdPriceAtAcquisition?: number;
}

/** `donorBuilt` 와이어 객체 — 범위 밖이거나 토글 OFF 면 undefined */
export function buildDonorBuiltGbPayload(asset: AssetForm): GbDonorBuiltPayload | undefined {
  if (!donorBuiltGbActive(asset)) return undefined;
  const c = gbBuildingCarryoverForm(asset)!;
  return {
    buildingType: c.donorBuiltType as "new" | "extension",
    constructionDate: c.donorBuiltDate,
    ...(c.donorBuiltType === "extension"
      ? {
          extensionFloorArea: pos(parseDecimal(c.donorBuiltExtensionArea)),
          extensionStdPriceAtAcquisition: pos(parseAmount(c.donorBuiltExtensionStdPrice)),
        }
      : {}),
  };
}
