/**
 * 증여세 부담부증여 양도 경로 — 양도세 쪽 평가방식·양도 시 시가를 **증여세 평가에서 파생**한다 (1h-G1-2 · 결정 #23 B).
 *
 * 「소득세법 시행령」 §159①2호의 A는 「상속세 및 증여세법」 제60조부터 제66조까지의 규정에 따라 평가한 가액이고 C는 증여가액이다 —
 * 양도세 쪽 평가는 증여세 평가와 **같은 평가**여야 한다. 종전에는 평가방식 라디오(기준시가 안분 / 시가 평가)와 «양도 시 시가» 칸을
 * 증여세 평가와 따로 받아, 증여세는 시가(매매사례)로 평가해도 양도세 기본값이 기준시가라 12억 판정·채무비율을 공시가격으로 계산했다
 * (시가 14억·공시 9억 1주택이 전액 비과세). 이제 평가 방법은 증여재산 평가 칸(시가·감정가·매매사례가·보충적 평가)이 정하고,
 * 이 파일의 {@link giftBurdenedValuationBasis}가 ⑤ 읽기 전용 표시 · ④ 전송 · ⑧ 검증의 **단일 소스**다(3중 패턴).
 *
 * 증여세 평가 방법의 우선순위는 엔진 `resolveValuationMethod`(시가 > 감정가 > 유사매매사례가액 > 보충적 평가)를 그대로 쓴다.
 * 시가(§60② — 상증령 §49④ 유사매매사례가액 포함)로 평가했으면 양도세도 시가 평가(취득가액 실지·환산 K-4/K-5)이고,
 * 보충적 평가면 기준시가 안분(취득가액도 기준시가 K-1~K-3 — §159①1호 괄호)이다.
 *
 * ⚠️ 증여세 기준시가 평가의 미임대분 가산·신용보증 차감으로 증여가액이 갈리는 드문 경우는 범위 밖(별건) — 엔진은 양도세 쪽 기준시가·
 *    임대·담보로 C를 따로 산정한다.
 */
import { computeSangjeungbeopValuation } from "@/lib/tax-engine/burdened-gift-valuation";
import { resolveValuationMethod } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

export type GiftBurdenedValuationMode = "sangjeungbeop_standard" | "sangjeungbeop_market";

export interface GiftBurdenedValuationBasis {
  mode: GiftBurdenedValuationMode;
  /** 시가 평가면 그 평가액(양수) — ④가 `marketValueAtTransfer`로 싣는다. 기준시가 안분이면 없음. */
  marketValue?: number;
  /** 증여세 평가 방법 라벨(화면 표시) */
  methodLabel: string;
  /** 시가 평가인데 담보채권액 평가(§66)가 시가보다 커서 취득가액도 기준시가로 산정하는가(소령 §159①1호 괄호 · 확인 필요) */
  collateralForcesStandardAcquisition: boolean;
}

const METHOD_LABEL = {
  market_value: "시가(매매·수용·경매가액)",
  appraisal: "감정가액",
  similar_sales: "유사매매사례가액",
} as const;

export function giftBurdenedValuationBasis(item: EstateItem): GiftBurdenedValuationBasis {
  const method = resolveValuationMethod(item);
  if (method !== "market_value" && method !== "appraisal" && method !== "similar_sales") {
    return {
      mode: "sangjeungbeop_standard",
      methodLabel: "보충적 평가(기준시가)",
      collateralForcesStandardAcquisition: false,
    };
  }
  const marketValue =
    method === "market_value" ? item.marketValue : method === "appraisal" ? item.appraisedValue : item.similarSalesValue;
  // 담보평가(§66)가 시가보다 큰가 — 엔진과 같은 함수로 판정한다. ④가 엔진에 싣는 채무 칸과 같은 값(임대보증금·저당권 채무액,
  // 설정액 = 채무액 — ④ `mortgageSetAmount`)으로 묻는다.
  const info = {
    valuationMode: "sangjeungbeop_market",
    marketValueAtTransfer: marketValue,
    lendingDepositTotal: item.leaseDeposit ?? 0,
    mortgageDebtAmount: item.mortgageAmount ?? 0,
    mortgageSetAmount: item.mortgageAmount ?? 0,
    annualRentTotal: 0,
  } as BurdenedGiftInfo;
  return {
    mode: "sangjeungbeop_market",
    marketValue,
    methodLabel: METHOD_LABEL[method],
    collateralForcesStandardAcquisition: computeSangjeungbeopValuation(0, 0, info).selectedMode === "mortgage",
  };
}
