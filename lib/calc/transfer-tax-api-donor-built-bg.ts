/**
 * ④ 부담부증여 `burdenedGiftInfo.carryoverDonorBasis.donorBuilt`(당초 증여자 신축·증축, 소득세법 §114조의2) 페이로드 빌드 (PR-4).
 *
 * 전송 게이트는 ⑤·⑧과 **같은 술어**(`donorBuiltBgActive`) — 범위 밖에서 켜 둔 stale 값은 보내지 않는다.
 * 일체 주택 안분(`housing`)은 없다 — §159가 토지·건물을 자산별로 따로 구한다. 증축 부분 기준시가는 **환산(K-5)일 때만** 싣는다(감정 K-7은 증축 부분 감정가액이 대신한다).
 * 비어 있는 필수 칸은 `undefined`/빈 문자열로 보내 ⑫가 거부하게 한다(⑧이 먼저 막는다) — 조용히 지어내지 않는다.
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { donorBuiltBgActive } from "./donor-built-bg-scope";
import { bgCarryoverForm } from "./bg-carryover-parts";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const pos = (n: number): number | undefined => (n > 0 ? n : undefined);

export interface BgDonorBuiltPayload {
  buildingType: "new" | "extension";
  constructionDate: string;
  extensionFloorArea?: number;
  extensionStdPriceAtAcquisition?: number;
}

/** `donorBuilt` 와이어 객체 — 범위 밖이거나 토글 OFF 면 undefined */
export function buildDonorBuiltBgPayload(asset: AssetForm): BgDonorBuiltPayload | undefined {
  if (!donorBuiltBgActive(asset)) return undefined;
  const c = bgCarryoverForm(asset)!;
  const isExtension = c.donorBuiltType === "extension";
  return {
    buildingType: c.donorBuiltType as "new" | "extension",
    constructionDate: c.donorBuiltDate,
    ...(isExtension
      ? {
          extensionFloorArea: pos(parseDecimal(c.donorBuiltExtensionArea)),
          ...(asset.bgAcquisitionMethod === "converted" ? { extensionStdPriceAtAcquisition: pos(parseAmount(c.donorBuiltExtensionStdPrice)) } : {}),
        }
      : {}),
  };
}

/** K-7 × 증여자 증축 — 증축한 부분의 감정가액(물건 전체 기준, 채무 안분 전). 증축이고 감정가액일 때만 싣는다. 빈 문자열은 undefined(0과 미입력은 다르다). */
export function buildDonorBuiltBgExtensionAppraisal(asset: AssetForm): number | undefined {
  if (!donorBuiltBgActive(asset) || asset.bgAcquisitionMethod !== "appraisal" || bgCarryoverForm(asset)?.donorBuiltType !== "extension") return undefined;
  return asset.bgPresumedExtensionAppraisal ? parseAmount(asset.bgPresumedExtensionAppraisal) : undefined;
}
