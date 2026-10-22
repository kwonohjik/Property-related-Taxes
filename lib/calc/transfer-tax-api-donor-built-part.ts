/**
 * ④ split 건물 파트 이월과세 `buildingCarryoverPart.donorBuilt`(증여자 신축·증축, 소득세법 §114조의2) 페이로드 빌드 (PR-3).
 *
 * 전송 게이트는 ⑤·⑧과 **같은 술어**(`donorBuiltPartActive`) — 범위 밖에서 켜 둔 stale 값은 보내지 않는다.
 * 자산 전체(`transfer-tax-api-donor-built.ts`)와 달리 일체 주택 안분(`housing`)을 싣지 않는다 — 파트별 기준시가가 이미 나뉘어 있다.
 * 비어 있는 필수 칸은 `undefined`/빈 문자열로 보내 ⑫가 거부하게 한다(⑧이 먼저 막는다) — 조용히 지어내지 않는다.
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { donorBuiltPartActive, type DonorBuiltPartOpts } from "./donor-built-part-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const pos = (n: number): number | undefined => (n > 0 ? n : undefined);

export interface SplitDonorBuiltPayload {
  buildingType: "new" | "extension";
  constructionDate: string;
  extensionFloorArea?: number;
  extensionStdPriceAtAcquisition?: number;
}

/** `donorBuilt` 와이어 객체 — 범위 밖이거나 토글 OFF 면 undefined */
export function buildDonorBuiltPartPayload(asset: AssetForm, opts: DonorBuiltPartOpts = {}): SplitDonorBuiltPayload | undefined {
  if (!donorBuiltPartActive(asset, opts)) return undefined;
  const c = asset.carryover!;
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
