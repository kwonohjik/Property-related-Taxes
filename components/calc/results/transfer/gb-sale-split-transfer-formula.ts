/**
 * 일반건물 자산별 양도가액 산식 — **기준시가 안분이 아닌** 두 갈래(R-c05-01 · 결과뷰 리뷰 2026-11-21).
 *
 * `buildGbTransferFormula`의 기준시가 안분식(「총액 × 기준시가 / 합계 = 양도가액」)은 엔진이 기준시가로 안분했을 때만 등식이다.
 *  - **구분 기재 채택**(§100③ 불분명 의제 미발동) — 양도가액은 계약서 구분 기재 가액이다. 안분식을 그리면 좌변(904,725,192)이
 *    우변(900,000,000)을 못 만든다. 증축(3-way)은 토지만 구분 기재 그대로, 건물 구분 기재 가액을 본체·증축 양도시 기준시가 비율로 나눈다
 *    (`general-building-extension.ts` — 잔액은 증축분).
 *  - **감정평가가액 비율 안분**(구분 기재 없음 또는 §100③ 발동, basis = 감정) — 엔진 echo에 감정가액이 없어 숫자 등식 대신 근거를 말로 적는다.
 * 그 밖(기준시가 안분)은 `undefined` — 호출부가 종전 안분식을 그린다.
 *
 * 값은 카드 값을 그대로 쓴다(재계산 금지). 건물 구분 기재 가액은 같은 지분의 본체 + 증축 카드 합이다.
 */
import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";
import { isSameShare } from "@/lib/tax-engine/general-building-share-id";
import { shareIndexOf } from "@/lib/tax-engine/general-building-share-id";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const LAND_IDS = new Set(["land", "land_business", "land_nbl"]);

export function buildGbNonStdTransferFormula(p: PerPropertyBreakdown, gb: GeneralBuildingOutput): string | undefined {
  const j = gb.saleSplitJudgment;
  const basisKind = j ? (j.deemedUnclear ? j.basisKind : undefined) : gb.saleApportionBasisKind;
  if (basisKind === "appraisal") {
    return `양도가액 총액을 양도 당시 감정평가가액 비율로 안분 = ${fmt(p.transferPrice)} (${TRANSFER.BUNDLED_APPORTIONMENT})`;
  }
  if (!j || j.deemedUnclear) return undefined;

  const qualifier =
    j.era === "none"
      ? "양도일이 2016.1.1. 전이라 30% 판정 없음"
      : j.exemptionApplied
        ? `안분가액과 30% 이상 차이 — ${TRANSFER.SPLIT_DEEMED_UNCLEAR_EXEMPTION} 예외`
        : `안분가액과 30% 미만 차이 — ${TRANSFER.SPLIT_DEEMED_UNCLEAR}`;
  const basis = `${TRANSFER.SPLIT_DECLARED_VALUE} · ${qualifier}`;
  const id = baseCardId(p.propertyId);
  // 공유지분(축 A `share` · 축 B 지분 카드) — 카드 값은 계약서(100%) 구분 기재 가액의 지분 몫이다.
  const of = j.share || shareIndexOf(p.propertyId) !== undefined ? "(지분 몫)" : "";
  const sameShare = (base: (id: string) => boolean) =>
    (gb.assetCards ?? []).filter((c) => base(baseCardId(c.propertyId)) && isSameShare(c.propertyId, p.propertyId));
  const sum = (cards: { transferPrice: number }[]) => cards.reduce((s, c) => s + c.transferPrice, 0);

  if (LAND_IDS.has(id)) {
    const landTotal = sum(sameShare((x) => LAND_IDS.has(x)));
    // 토지가 사업용·비사업용 초과분 두 장이면 구분 기재 토지 가액을 사업용 인정면적 비율로 나눈 몫이다(`planGbLandCards`).
    return landTotal === p.transferPrice || landTotal === 0
      ? `계약서 구분 기재 토지 가액${of} = ${fmt(p.transferPrice)} (${basis})`
      : `계약서 구분 기재 토지 가액${of} ${fmt(landTotal)} 중 사업용 인정면적 비율 몫 = ${fmt(p.transferPrice)} (${basis})`;
  }
  const hasExtensionCard = sameShare((x) => x === "building2").length > 0;
  if (id === "building" || (id === "building1" && !hasExtensionCard)) return `계약서 구분 기재 건물 가액${of} = ${fmt(p.transferPrice)} (${basis})`;
  if (id === "building1" || id === "building2") {
    // 증축 — 계약서는 건물을 하나로 적는다. 그 가액을 본체·증축 양도시 기준시가 비율로 나누고 증축분은 잔액이다.
    const bldTotal = sum(sameShare((x) => x === "building1" || x === "building2"));
    const b1Std = gb.buildingStdTotal ?? 0;
    const extStd = gb.extensionStdTotal ?? 0;
    if (id === "building1") {
      return `계약서 구분 기재 건물 가액${of} ${fmt(bldTotal)} × 본체 양도시 기준시가 ${fmt(b1Std)} / (본체 ${fmt(b1Std)} + 증축 ${fmt(extStd)}) = ${fmt(p.transferPrice)} (${basis})`;
    }
    return `계약서 구분 기재 건물 가액${of} ${fmt(bldTotal)} - 건물(3001) ${fmt(bldTotal - p.transferPrice)} = ${fmt(p.transferPrice)} (잔액 보정 · ${basis})`;
  }
  return undefined;
}
