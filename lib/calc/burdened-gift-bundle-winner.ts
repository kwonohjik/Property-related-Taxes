/**
 * 함께 부담부증여 묶음 — 자산별 상증법 평가 승자(보충적·담보 §66·임대 §61⑤)가 **서로 다른가**. ⑧(`transfer-tax-validate.ts`)과 ⑫(`transfer-tax-schema-gb-bg-refines.ts`)가 같은 leaf를 쓴다.
 *
 * ④는 증여세 1회 산정용 합산 info를 성분 단순 합으로 만들어(`buildCompanionBurdenedGiftWholeInfo`) 합산 증여가액이 성분 합의 max가 된다. 자산별 max의 합(ΣAᵢ)은 승자가 같을 때만
 * 그와 같다(Σmax ≠ max(Σ성분)) — 승자가 섞이면 증여세가 틀린다. 균일 승자는 합산 증여가액 = ΣAᵢ라 맞게 계산된다.
 * 승자는 ⑧과 같은 `companionBurdenedGiftValuations`(지분 축소 → Max)로 정한다.
 */
import { companionBurdenedGiftValuations } from "./transfer-tax-api-burdened-gift";

/**
 * 양도 쪽 입력이 있어 평가 승자를 정할 수 있는가 — 시가 모드는 시가, 기준시가 모드는 양도시 토지+건물 기준시가(`computeSangjeungbeopValuation` 의 보충적평가 항).
 * 취득시 기준시가는 승자와 무관하다(일반건물은 `requireStd` 가 따로 400). 주택·상가·토지는 토지 칸이 0 이라 4칸 검사로는 늘 보류됐다.
 */
export function bgWinnerDeterminable(info: unknown): boolean {
  const i = info as Record<string, unknown>;
  const n = (key: string): number => (typeof i[key] === "number" ? (i[key] as number) : 0);
  return i.valuationMode === "sangjeungbeop_market" ? n("marketValueAtTransfer") > 0 : n("landStdPriceAtTransfer") + n("buildingStdPriceAtTransfer") > 0;
}

type Entry = { info: unknown; ratio: number };
export type BgWinnerMode = "supplementary" | "mortgage" | "rental";

/** 자산별 평가 승자 — 지분 축소 → Max(`companionBurdenedGiftValuations`). 입력이 비어 있어도 값을 낸다(⑧ 이 쓴다 — 빈 입력은 각자의 필수 검증이 막는다). */
export function bgBundleWinnerModes(entries: ReadonlyArray<Entry>): BgWinnerMode[] {
  return companionBurdenedGiftValuations(
    entries.map((e) => e.info as Parameters<typeof companionBurdenedGiftValuations>[0][number]),
    entries.map((e) => e.ratio),
  ).map((v) => v.selectedMode);
}

/** ⑫ 용 — 두 자산 이상이 모두 승자를 정할 수 있고 승자가 갈리면 true. 한 자산이라도 양도 쪽 입력이 비면 보류한다(그 입력은 각자의 필수 검증이 400). */
export function bgBundleWinnersMixed(entries: ReadonlyArray<Entry>): boolean {
  if (entries.length < 2 || !entries.every(({ info }) => bgWinnerDeterminable(info))) return false;
  return new Set(bgBundleWinnerModes(entries)).size > 1;
}

const WINNER_LABEL: Record<BgWinnerMode, string> = {
  supplementary: "보충적평가",
  mortgage: "담보평가(상증법 §66)",
  rental: "임대평가(상증법 §61⑤)",
};

/**
 * ⑧ 안내 — 승자가 섞인 묶음. ⑫ 의 `GB_BG_MIXED_WINNER_MESSAGE` 와 같은 사실을 화면 어휘로 말한다.
 * 어느 자산이 어떤 방식인지 앞머리에 둔다(`labels` = [자산 번호(1부터), 승자]).
 */
export function bgBundleMixedWinnerMessage(labels: ReadonlyArray<[number, BgWinnerMode]>): string {
  const list = labels.map(([n, m]) => `자산 ${n} ${WINNER_LABEL[m]}`).join(" · ");
  return `${list}: 증여재산 평가 방식이 달라 함께 양도와 같이 계산할 수 없습니다. 여러 물건을 함께 부담부증여하면 증여세를 증여계약 전체로 1회 계산하는데, 이 경우 합산 증여가액이 자산별 평가액 합계와 어긋납니다. 평가 방식이 같은 자산끼리 함께 양도하거나, 함께 양도 토글을 끄고 단건으로 계산하세요.`;
}
