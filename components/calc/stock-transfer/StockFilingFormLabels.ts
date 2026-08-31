/**
 * 별지 제84호서식 — **라벨 헬퍼** 모음
 *
 * `StockFilingFormTableHelpers.ts`가 800줄 정책을 넘겨 분리했다.
 * 이음매는 **역할**이다 — 이쪽은 enum·세율을 사람이 읽는 문자열로 옮기기만 하고
 * 행값 계산(`buildRows`)에는 관여하지 않는다.
 *
 * 🔑 이 파일의 `Record<>`는 전부 **union을 키로** 받는다. `Record<string, string>` +
 *    `?? 원본` 폴백이면 값이 늘어나도 tsc가 잡지 못하고, 그 폴백이 그대로
 *    **내부 enum id를 신고서에 인쇄**한다 (memory `feedback_no_internal_id_in_result`).
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { resolveStockRateKey } from "@/lib/tax-engine/stock-transfer/stock-transfer-rate-calc";

// ── 라벨 헬퍼 ─────────────────────────────────────────────────

/**
 * 조문 라벨.
 *
 * ⚠️ `Record<string, string>`이 아니라 **union을 키로** 받는다 — 그래야 `appliedSection94`에
 *    값이 추가될 때 컴파일러가 누락을 잡는다. 종전에는 `Record<string, string>`이라
 *    가목 1)·2)의 라벨이 **서로 뒤바뀐 채로** 아무도 모르게 남아 있었다
 *    (안전망 실측 P-2: 두 라벨을 교환해도 반응하는 테스트 0건).
 *
 * 소득세법 §94①3 가목 (KoreanLaw 실측, mst 280405):
 *   1) … **대주주가 양도하는** 주식등
 *   2) 1)에 따른 **대주주에 해당하지 아니하는 자가 증권시장에서의 거래에 의하지 아니하고**
 *      양도하는 주식등
 */
export function sectionLabel(appliedSection94: StockTransferResult["appliedSection94"]): string {
  const map: Record<StockTransferResult["appliedSection94"], string> = {
    "①3가1)": "§94①3 가목1) — 상장 대주주",
    "①3가2)": "§94①3 가목2) — 상장 비대주주 장외",
    "해당없음": "§94①3 비해당 — 상장 비대주주 장내 (과세대상 아님)",
    "①3나_본문": "§94①3 나목 본문 — 비상장",
    "①3나_단서": "§94①3 나목 단서 — K-OTC",
    "①3다": "§94①3 다목 — 국외주식",
    "①4다": "§94①4 다목 — 과점주주",
    "①4라": "§94①4 라목 — 부동산과다보유",
  };
  return map[appliedSection94] ?? `§94 ${appliedSection94}`;
}

/**
 * ③ 세율구분 그룹 라벨 — 별지 제84호서식 작성요령 4번의 「세율이 같은 자산」 축.
 *
 * 엔진의 `resolveStockRateKey`와 **같은 축**을 쓴다(§102② 통산 그룹과 동일) — 서식의 합산
 * 단위와 통산 단위가 같은 것이 아니라, 둘 다 「세율」을 축으로 삼기 때문이다.
 * 다른 축을 쓰면 표시와 계산이 어긋난다([[feedback_ui_engine_dual_truth_avoidance]]).
 */
export function rateGroupLabel(r: StockTransferResult): string {
  if (r.isExempt) return "비과세 (합산 제외)";
  const key = resolveStockRateKey(
    r.taxCategory,
    // 중소기업 축은 결과에 남지 않는다 — 세율에서 역산한다(10%면 중소, 20%면 비중소).
    r.appliedRate === 0.1,
    r.isShortTermHolding,
  );
  const LABEL: Record<string, string> = {
    "10": "10% 그룹",
    "20": "20% 그룹 (국내 비대주주·국외주식 공통)",
    "20_25": "20~25% 그룹 (대주주 누진)",
    "30": "30% 그룹 (비중소 대주주 1년 미만)",
    other_asset_progressive: "기타자산 누진 (③란 합산 제외)",
    other_asset_progressive_nbl: "기타자산 §104①9호 (③란 합산 제외)",
    exempt_or_out_of_scope: "비과세·범위 밖",
  };
  return LABEL[key] ?? key;
}

export function acquisitionModeLabel(mode: StockTransferResult["acquisitionMode"]): string {
  const map: Record<string, string> = {
    actual: "실가",
    sale_case: "매매사례",
    appraisal: "감정가액",
    estimated: "환산취득가 (§165⑤)",
    face_value: "액면가 (장부분실)",
  };
  return map[mode] ?? mode;
}

/**
 * ⚠️ **`Record<string, string>`이 아니라 union을 키로** 받는다 — 그래야 `taxCategory`가
 *    늘어날 때 컴파일러가 누락을 잡는다. 종전에는 `Record<string,string>` + `?? cat` 폴백이라
 *    `foreign_stock`·`exit_tax`가 빠져 있어도 tsc가 못 잡았고, 그 폴백이 그대로
 *    **내부 enum id를 신고서에 인쇄**했다 (memory `feedback_no_internal_id_in_result`).
 *    파일 아래 `sectionLabel`이 같은 이유로 이미 union 강제를 쓰고 있다.
 */
export function taxCategoryLabel(cat: StockTransferResult["taxCategory"]): string {
  const map: Record<StockTransferResult["taxCategory"], string> = {
    listed_major: "상장 대주주",
    listed_non_major_in_market: "상장 비대주주 (장내)",
    // legacy — 통합 이후 새로 만들지 않는다(저장된 이력 표시용)
    listed_otc_non_major: "상장 비대주주 (장외)",
    listed_off_market_non_major: "상장 비대주주 (장외)",
    unlisted_major: "비상장 대주주",
    unlisted_non_major: "비상장 소액",
    kotc_sme_mid_exempt: "K-OTC 중소·중견 (비과세)",
    kotc_venture_exempt: "K-OTC 벤처 (비과세)",
    other_asset_block_shareholder: "과점주주 (§94①4 다목)",
    other_asset_heavy_re: "부동산과다보유 (§94①4 라목)",
    // §104①9호 — 분류는 다목·라목 그대로이고 세율만 기본세율 + 10%p다.
    // ⚠️ 이 map은 `map[cat] ?? cat` 폴백이라 **누락돼도 tsc가 잡지 못한다** —
    //   빠뜨리면 내부 id가 화면에 그대로 노출된다(memory `feedback_no_internal_id_in_result`).
    other_asset_block_shareholder_nbl: "과점주주 (§94①4 다목) · §104①9호 비사업용토지 과다소유법인",
    other_asset_heavy_re_nbl: "부동산과다보유 (§94①4 라목) · §104①9호 비사업용토지 과다소유법인",
    out_of_scope_foreign: "해외주식 (별도 도메인)",
    foreign_stock: "국외주식 (§94①3 다목)",
    // `assertNoExitTaxItem`·Step4 분기로 이 표에 도달하지 못하지만 union이 요구한다.
    exit_tax: "국외전출세 (§118의9~§118의16)",
  };
  return map[cat] ?? cat;
}

export function rateLabel(result: StockTransferResult): string {
  if (result.isExempt) return "비과세";
  const pct = (result.appliedRate * 100).toFixed(1);
  if (result.appliedRate === 0.30) return "30% (§104①11 가목1) 단기)";
  if (result.appliedRate === 0.20) return "20% (§104①11 가목2) / 나목2))";
  if (result.appliedRate === 0.10) return "10% (§104①11 나목1) 중소)";
  if (result.appliedRate === 0.25) return "25% (§104①11 가목2) 초과 구간)";
  return `${pct}% (§55 누진)`;
}

