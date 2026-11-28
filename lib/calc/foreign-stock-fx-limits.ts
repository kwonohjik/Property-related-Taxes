/**
 * 국외주식 외화 환산 **입력 한도** 판정 — ⑧ validate · ⑫ Zod 공용 단일 소스.
 *
 * 엔진(`foreign-stock.ts` · `foreign-stock-carryover.ts`)은 외화 × 환율 [× 주식 수]를 공용 환산 leaf(`fx-krw.ts`)로 환산하고,
 * leaf는 외화액·환율 소수 4자리 초과 · 외화액 > 1e11 · 환율 > 1e7 · 환산 원화 안전 정수 초과를 `TaxCalculationError`로 던진다.
 * ⑫가 먼저 막지 않으면 route가 500을 내고, ⑧이 통과시키면 「UI 통과 ↔ API 400」 모순이다 → 두 층이 **이 함수 하나**를 부르고,
 * 이 함수는 엔진과 **같은 leaf 판정**(`fxViolation`)을 쓴다. 쌍(외화액·환율)의 구성은 엔진의 환산 호출과 1:1이다.
 *
 * ⚠️ 이 함수는 «한도»만 본다. 환율 미입력·0 이하·외화액 음수는 기존 필수 규칙(⑧ 필수 검증 · ⑫ `positive()`/`min(0)`)이 소유한다
 *    (쌍 중 하나가 양수가 아니면 건너뛴다 — 중복 오류 방지). 외화액 0은 엔진이 환산하지 않으므로(`toKrwUnlessZero`) 환율도 보지 않는다.
 * ⚠️ 필요경비·외국세의 «환율 비움 → 양도일 환율» 대체(`?? transferExchangeRate`)는 엔진이 아직 쓰므로 여기도 같은 쌍을 만든다.
 *    그 대체가 폐지되면(후속 PR) 엔진·이 함수를 함께 고친다 — 쌍 구성이 한 곳이라 어긋나지 않는다.
 *    대체 대상(양도일 환율)마저 없는 경우의 «미입력» 판정은 아래 `foreignStockExpenseRateIssues`가 맡는다.
 */
import { fxViolation, type FxViolationTarget } from "@/lib/tax-engine/fx-krw";

export interface ForeignStockFxReceiptFacts {
  amountForeign?: number | undefined;
  exchangeRate?: number | undefined;
}

/** 사실만 받는다 — ④ body(⑧) · Zod 파싱 결과(⑫)의 같은 키를 그대로 넘긴다. 빈 칸 = `undefined`. */
export interface ForeignStockFxFacts {
  shareCount?: number | undefined;
  transferReceiptMode?: string | undefined;
  transferPriceMode?: string | undefined;
  perShareTransferPriceForeign?: number | undefined;
  totalTransferPriceForeign?: number | undefined;
  transferExchangeRate?: number | undefined;
  transferInstallmentReceipts?: readonly ForeignStockFxReceiptFacts[] | undefined;
  perShareAcquisitionPriceForeign?: number | undefined;
  acquisitionExchangeRate?: number | undefined;
  capitalExpenditureForeign?: number | undefined;
  capitalExpenditureExchangeRate?: number | undefined;
  transferCostForeign?: number | undefined;
  transferCostExchangeRate?: number | undefined;
  hasForeignTax?: boolean | undefined;
  foreignTaxPaidForeign?: number | undefined;
  foreignTaxExchangeRate?: number | undefined;
  acquisitionCause?: string | undefined;
  donorPerShareAcquisitionPriceForeign?: number | undefined;
  donorAcquisitionExchangeRate?: number | undefined;
  donorCapitalExpenditureForeign?: number | undefined;
  donorCapitalExpenditureExchangeRate?: number | undefined;
}

export interface ForeignStockFxIssue {
  /** Zod 이슈 경로 — 분할 수령 행은 `["transferInstallmentReceipts", i, "amountForeign" | "exchangeRate"]` */
  path: (string | number)[];
  message: string;
}

/** 칸 이름 → 한국어 라벨 (메시지용) */
const LABEL: Record<string, string> = {
  perShareTransferPriceForeign: "1주당 양도가액 (외화)",
  totalTransferPriceForeign: "총 양도가액 (외화)",
  transferExchangeRate: "양도일 기준환율",
  perShareAcquisitionPriceForeign: "1주당 취득가액 (외화)",
  acquisitionExchangeRate: "취득일 기준환율",
  capitalExpenditureForeign: "자본적지출 (외화)",
  capitalExpenditureExchangeRate: "자본적지출 지출일 기준환율",
  transferCostForeign: "양도비 (외화)",
  transferCostExchangeRate: "양도비 지출일 기준환율",
  foreignTaxPaidForeign: "외국납부세액 (외화)",
  foreignTaxExchangeRate: "납세일 기준환율",
  donorPerShareAcquisitionPriceForeign: "증여자 1주당 취득가액 (외화)",
  donorAcquisitionExchangeRate: "증여자 취득일 기준환율",
  donorCapitalExpenditureForeign: "증여자 자본적지출 (외화)",
  donorCapitalExpenditureExchangeRate: "증여자 자본적지출 지출일 기준환율",
  shareCount: "양도 주식 수",
};

/** 이 판정이 지키는 칸 이름 전부 — ⑧↔⑫ 패리티 테스트의 완전성 가드가 격자 행이 모든 칸을 덮는지 대조한다 */
export const FOREIGN_STOCK_FX_FIELDS: readonly string[] = Object.keys(LABEL);

const positive = (v: number | undefined): v is number => v !== undefined && v > 0;

export function foreignStockFxIssues(f: ForeignStockFxFacts): ForeignStockFxIssue[] {
  const out: ForeignStockFxIssue[] = [];
  const seen = new Set<string>();
  const add = (path: (string | number)[], label: string, reason: string) => {
    const message = `${label}: ${reason} (소득세법 시행령 §178의5)`;
    const key = `${path.join(".")}|${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ path, message });
  };

  /** 쌍 하나 — 위반 대상 칸(amount/rate/quantity)으로 이슈를 돌린다 */
  const pair = (
    amount: number | undefined,
    rate: number | undefined,
    quantity: number | undefined,
    cells: { amount: (string | number)[]; rate: (string | number)[]; amountLabel: string; rateLabel: string },
  ) => {
    if (!positive(amount) || !positive(rate)) return;
    const v = fxViolation(amount, rate, quantity ?? 1);
    if (!v) return;
    const target: FxViolationTarget = v.target;
    if (target === "rate") add(cells.rate, cells.rateLabel, v.reason);
    else if (target === "quantity") add(["shareCount"], LABEL.shareCount, v.reason);
    else add(cells.amount, cells.amountLabel, v.reason);
  };

  const cell = (key: string) => ({
    amount: [key] as (string | number)[],
    amountLabel: LABEL[key],
  });
  const rateCell = (key: string) => ({ rate: [key] as (string | number)[], rateLabel: LABEL[key] });
  const cells = (amountKey: string, rateKey: string) => ({ ...cell(amountKey), ...rateCell(rateKey) });

  // ── 양도가액 (영 §178의5①·②) ──
  if ((f.transferReceiptMode ?? "single") === "installments") {
    (f.transferInstallmentReceipts ?? []).forEach((r, i) => {
      const n = `${i + 1}번째 수령`;
      pair(r.amountForeign, r.exchangeRate, 1, {
        amount: ["transferInstallmentReceipts", i, "amountForeign"],
        rate: ["transferInstallmentReceipts", i, "exchangeRate"],
        amountLabel: `${n} 수령액 (외화)`,
        rateLabel: `${n} 기준환율`,
      });
    });
  } else if ((f.transferPriceMode ?? "per_share") === "total") {
    pair(f.totalTransferPriceForeign, f.transferExchangeRate, 1, cells("totalTransferPriceForeign", "transferExchangeRate"));
  } else {
    pair(f.perShareTransferPriceForeign, f.transferExchangeRate, f.shareCount, cells("perShareTransferPriceForeign", "transferExchangeRate"));
  }

  // ── 취득가액 (영 §178의5① — 실가·시가 두 모드가 같은 칸) ──
  pair(f.perShareAcquisitionPriceForeign, f.acquisitionExchangeRate, f.shareCount, cells("perShareAcquisitionPriceForeign", "acquisitionExchangeRate"));

  // ── 필요경비 — 환율을 비우면 엔진이 양도일 환율로 환산한다(`foreign-stock.ts` STEP 4) ──
  pair(
    f.capitalExpenditureForeign,
    f.capitalExpenditureExchangeRate ?? f.transferExchangeRate,
    1,
    cells("capitalExpenditureForeign", f.capitalExpenditureExchangeRate !== undefined ? "capitalExpenditureExchangeRate" : "transferExchangeRate"),
  );
  pair(
    f.transferCostForeign,
    f.transferCostExchangeRate ?? f.transferExchangeRate,
    1,
    cells("transferCostForeign", f.transferCostExchangeRate !== undefined ? "transferCostExchangeRate" : "transferExchangeRate"),
  );

  // ── 외국납부세액 (영 §178의5① · 소득세법 시행규칙 §60②) ──
  if (f.hasForeignTax) {
    pair(
      f.foreignTaxPaidForeign,
      f.foreignTaxExchangeRate ?? f.transferExchangeRate,
      1,
      cells("foreignTaxPaidForeign", f.foreignTaxExchangeRate !== undefined ? "foreignTaxExchangeRate" : "transferExchangeRate"),
    );
  }

  // ── §97의2① 이월과세 — 증여자 취득가액 · 자본적지출 (선언한 종목만) ──
  if (f.acquisitionCause === "carryover_gift") {
    pair(
      f.donorPerShareAcquisitionPriceForeign,
      f.donorAcquisitionExchangeRate,
      f.shareCount,
      cells("donorPerShareAcquisitionPriceForeign", "donorAcquisitionExchangeRate"),
    );
    pair(
      f.donorCapitalExpenditureForeign,
      f.donorCapitalExpenditureExchangeRate,
      1,
      cells("donorCapitalExpenditureForeign", "donorCapitalExpenditureExchangeRate"),
    );
  }

  return out;
}

/**
 * 필요경비 지출일 환율 **미입력** 판정 — ⑧ validate(3단계) · ⑫ Zod 공용 단일 소스.
 *
 * 엔진(`foreign-stock.ts` STEP 4)은 지출일 환율을 비우면 양도일 환율(`transferExchangeRate`)로 환산한다.
 * 분할 수령 모드는 양도일 환율 칸이 없어(화면이 숨기고 ⑫도 요구하지 않는다) 그 대체 대상이 비어 있을 수 있다 —
 * 그러면 엔진이 «환율 미입력 불가»로 던져 「화면 통과 ↔ API 400」이 된다(계획서 F-1의 형제 모순).
 * 그래서 **금액 > 0 · 지출일 환율 없음 · 양도일 환율 없음**이면 지출일 환율 칸을 막는다(엔진이 실패하는 조건과 같다).
 *
 * ⚠️ 양도일 환율이 있으면 대체가 그대로 살아 있으므로 막지 않는다 — 대체 자체의 폐지는 Q-2 PR(계획서 PR-2)이 한다.
 */
export function foreignStockExpenseRateIssues(f: ForeignStockFxFacts): ForeignStockFxIssue[] {
  if (positive(f.transferExchangeRate)) return [];
  const out: ForeignStockFxIssue[] = [];
  const need = (amount: number | undefined, rate: number | undefined, rateKey: string) => {
    if (!positive(amount) || rate !== undefined) return;
    out.push({
      path: [rateKey],
      message: `${LABEL[rateKey]}을 입력하세요 — 양도일 기준환율이 없어 대신 쓸 환율이 없습니다 (소득세법 시행령 §178의5①)`,
    });
  };
  need(f.capitalExpenditureForeign, f.capitalExpenditureExchangeRate, "capitalExpenditureExchangeRate");
  need(f.transferCostForeign, f.transferCostExchangeRate, "transferCostExchangeRate");
  return out;
}
