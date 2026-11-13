/**
 * ⑦ 부담부증여 × 토지·건물 소유자 분리 — 결과 화면이 「증여한 부분」을 읽는 단일 소스 (계획서 `docs/00-pm/bg-owner-split-159.plan.md` §8 · PR-4).
 *
 * 판정은 **엔진 결과**(`splitDetail.selfOwns` + §159 명세)로 한다 — 화면이 폼 값을 다시 판정하지 않는다.
 * 소유자 분리 부담부증여는 엔진이 증여한 파트만 §159로 계산하고(`burdened-gift-owner-split.ts`) 그 파트를 `splitDetail.selfOwns`로 돌려준다.
 * 일반건물·재개발 권리처럼 `selfOwns`를 따로 쓰지 않는 §159 결과(`cards`·`assetKind` echo가 있다)는 이 경로가 아니다.
 */
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer.types";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

export type BgOwnedPart = "land" | "building";

/** 결과 중 이 판정이 읽는 두 echo — 단건 결과·다건 자산별 결과가 같은 모양이다. */
export interface BgOwnerSplitResultSource {
  transferBurdenedGiftBreakdown?: TransferBurdenedGiftBreakdown;
  splitDetail?: Pick<SplitGainResult, "selfOwns">;
}

/** 증여한 부분(본인 소유분) — 소유자 분리 부담부증여 결과가 아니면 undefined. */
export function bgOwnedPartOfResult(r: BgOwnerSplitResultSource | undefined): BgOwnedPart | undefined {
  const bg = r?.transferBurdenedGiftBreakdown;
  if (!bg || bg.cards || bg.assetKind) return undefined;
  const owns = r?.splitDetail?.selfOwns;
  return owns === "building_only" ? "building" : owns === "land_only" ? "land" : undefined;
}

export const BG_PART_LABEL: Record<BgOwnedPart, string> = { land: "토지", building: "건물" };

/** 증여한 부분이 아닌 쪽. */
export const bgOtherPart = (p: BgOwnedPart): BgOwnedPart => (p === "building" ? "land" : "building");

/** 「증여한 건물분」 — 평가액·기준시가 줄의 접두. */
export const bgOwnedPartPhrase = (p: BgOwnedPart): string => `증여한 ${BG_PART_LABEL[p]}분`;

/** 결과 첫머리 한 줄 — 「증여한 부분: 건물 (토지는 타인 소유)」 · 「증여한 부분: 토지 (건물은 타인 소유)」. */
export const bgOwnedPartHeadline = (p: BgOwnedPart): string =>
  `증여한 부분: ${BG_PART_LABEL[p]} (${BG_PART_LABEL[bgOtherPart(p)]}${p === "building" ? "는" : "은"} 타인 소유)`;

/** 비소유 파트 줄의 값 칸 문구 — 0원 줄 대신. */
export const BG_NOT_OWNED_NOTE = "본인 소유 아님 — 계산하지 않음";
