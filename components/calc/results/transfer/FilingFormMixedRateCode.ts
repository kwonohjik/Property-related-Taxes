/**
 * 겸용주택 신고서 ③ 세율구분 코드 — 열(주택분 토지·건물 · 상가분 토지·건물)마다 그 파트에 적용된 호로 적는다.
 *
 * 종전에는 단건 매핑(`result.rateClause`)만 있어 겸용 결과(호 없음)는 합계 열까지 전부 「-」였다(2026-11-23 실측 — 미등기도).
 * 엔진 echo `total.partRateClauses`(§104⑤2호 계산이 채택한 파트별 세율 — 재판정 없음)를 정본 코드표(`resolveFilingRateCode`)에 넘긴다.
 *
 * - 미등기(§104①10호)는 자산 전체에 걸리므로 네 열 · 합계 모두 1-30이다(파트 echo가 없는 결과도).
 * - 배율 초과 비사업용 토지는 주택분 토지 열에 합산돼 있다(`fourPartFinancials`) — 그 열의 호와 다르면 한 칸에 두 코드를 적을 수 없어 비운다.
 *   §154③ 본문으로 상가 토지분 몫이 섞이면 상가분 토지 열도 같다.
 * - 합계 열은 네 열의 코드가 모두 같을 때만 적는다(다르면 단정할 수 없다 — 「-」).
 */
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { MixedUsePartRateClause } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { ColumnKey } from "./FilingFormTableHelpers";
import { resolveFilingRateCode } from "./filing-rate-code";

export function fillMixedRateCodeCells(
  mu: MixedUseGainBreakdown,
  transferDate: string,
  setStr: (rowKey: string, col: ColumnKey, s: string) => void,
): void {
  const cols = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"] as const;
  if (mu.total.rateBasis === "unregistered") {
    for (const c of [...cols, "total"]) setStr("rateCode", c, "1-30");
    return;
  }
  const parts = mu.total.partRateClauses;
  if (!parts) return;
  const hasRight = (mu.multiHouseSurcharge?.countedRightCount ?? 0) > 0;
  const codeOf = (p: MixedUsePartRateClause | undefined, assetKind: "housing" | "land" | undefined) =>
    p?.rateClause
      ? resolveFilingRateCode({
          rateClause: p.rateClause,
          assetKind,
          transferDate,
          nonBusinessLandShortTerm: p.nonBusinessLandShortTerm,
          surchargeShortTermClause: p.surchargeShortTermClause,
          surchargeHouseholdHasCountedRight: hasRight,
        })
      : undefined;
  const find = (k: MixedUsePartRateClause["kind"]) => parts.find((p) => p.kind === k);
  const housing = codeOf(find("housing"), "housing");
  const commercialLand = codeOf(find("commercial_land"), undefined);
  const commercialBuilding = codeOf(find("commercial_building"), undefined);
  const nblPart = find("non_business_land");
  const nbl = nblPart ? codeOf(nblPart, "land") : undefined;
  // 배율 초과분이 상가분 토지 열에도 섞였는가 — 주택분 몫(`nonBusinessTransferredGain`)이 전체 비사토 차익보다 작으면 나머지가 상가분 몫이다.
  const nbInCommercial = !!nblPart && (mu.nonBusinessLandPart?.transferGain ?? 0) !== mu.housingPart.nonBusinessTransferredGain;
  const merge = (own: string | undefined, mixedIn: boolean) => (!nblPart || !mixedIn || own === nbl ? own : undefined);
  const byCol: Record<(typeof cols)[number], string | undefined> = {
    housingLand: merge(housing, true),
    housingBuilding: housing,
    commercialLand: merge(commercialLand, nbInCommercial),
    commercialBuilding,
  };
  for (const c of cols) {
    const code = byCol[c];
    if (code) setStr("rateCode", c, code);
  }
  const codes = cols.map((c) => byCol[c]);
  if (codes.every((c) => c !== undefined && c === codes[0])) setStr("rateCode", "total", codes[0]!);
}
