/**
 * 증여세 부표1(별지 제10호서식 부표 1) 계 영역 산식·코드 라벨 — 화면·PDF 단일 출처.
 *
 * 소비처:
 *   - 화면: components/calc/results/GiftTaxValuationFormTable.tsx
 *   - PDF : lib/pdf/GiftValuationFormPdfDocument.tsx (PR-B2)
 * dual-truth 0: ⑩·⑭ 산식과 ② 재산종류코드 라벨을 한 곳에서 도출.
 *
 * KoreanLaw MCP 검증 (2026-05-20): ② 재산종류코드 14종 (시행규칙 별지 제10호서식 부표 1 뒷면 §2).
 */

import { computePriorGiftAddition } from "@/lib/tax-engine/gift-tax-filing-form-besshi10";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * ② 재산종류코드 14종 라벨.
 * 결과 화면/PDF 표시는 가독성을 위해 약식 (예: "공동주택 (부수토지 포함)" → "공동주택").
 */
export const PROPERTY_TYPE_LABEL: Record<string, string> = {
  "01": "현금",
  "02": "토지",
  "03": "토지(부수)",
  "04": "개별주택",
  "05": "공동주택",
  "06": "오피스텔ㆍ상업용",
  "07": "일반건물",
  "08": "부동산 취득권리",
  "09": "상장주식",
  "10": "비상장주식",
  "11": "금융재산",
  "12": "기타재산",
  "13": "가상자산",
  "14": "서화ㆍ골동품",
};

/**
 * ⑩ 비과세재산가액 표시값 (음수 가드) — exemptAmount > ⑪+⑫+⑬ 일 때 차이 표시.
 *   ⑩ = max(0, 비과세 − ⑪ 공익법인 − ⑫ 공익신탁 − ⑬ 장애인신탁)
 */
export function computeRow10(
  exemptAmount: number,
  excl11: number,
  excl12: number,
  excl13: number,
): number {
  return Math.max(0, exemptAmount - excl11 - excl12 - excl13);
}

/**
 * ⑭ 증여재산가산액 표시값 (사전증여 가산분) — 별지10호 ㉓와 단일 산식 공유(H-48 dual-truth 제거).
 * §47① 채무인수(debtAssumed)·§36 대납가산(donorPaidTax)을 차감해야 별지10호 ㉓와 정합.
 * (종전: 이 둘을 미차감해 부담부증여·대납 병존 시 부표1 ⑭ ≠ 별지10호 ㉓.)
 */
export function computeRow14(
  aggregated: number,
  gross: number,
  exempt: number,
  debtAssumed: number = 0,
  donorPaidTax: number = 0,
): number {
  return computePriorGiftAddition(aggregated, gross, exempt, debtAssumed, donorPaidTax);
}

/**
 * ⑤ 수량(면적) — 상장주식은 주식수, 부동산은 면적(㎡). 그 밖에는 공란(#101).
 *
 * · 부동산 면적은 증여 마법사에서도 입력된다(동·호 조회 자동채움 · 부담부증여 면적). 상속 부표2
 *   (`besshi-buppyo-2-data.ts`)는 이미 ⑤에 싣는데 증여 부표1만 버렸다.
 *   카테고리가 부동산일 때만 읽는다 — 카테고리를 바꿔도 `areaSqm`이 남을 수 있다.
 * · `quantityCount`는 읽지 않는다 — 입력 위젯(`EstateValuationMetaSection`)이 상속 모드 전용이라
 *   증여에는 입력 경로가 없다.
 * · §39 등 증여의제 이관 항목은 공란이 정답이다 — 「상증법」§39①은 「그 이익에 상당하는 **금액**」을
 *   증여재산가액으로 하고, 「상증칙」 별지 제10호서식 부표1 작성방법에 ⑤·⑥ 기재 지시가 없다.
 *   엔진 산출근거(1주당 이익 × 이익 귀속 주식수)를 여기에 주입하지 말 것.
 */
export function buppyo1QuantityOrArea(item: EstateItem | undefined): number | undefined {
  if (!item) return undefined;
  if (item.listedStockShares) return item.listedStockShares;
  if (item.category.startsWith("real_estate") && item.areaSqm) return item.areaSqm;
  return undefined;
}
