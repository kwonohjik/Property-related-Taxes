"use client";

/**
 * 국외전출세 결과 카드 — 종목별 실제 양도(경정청구 §118의12~§118의14, PR-7b)의 계산 근거 (⑦)
 *
 * **엔진 echo만 읽는다**(`holdingDetails[].actualTransfer` · `bucketDetails[].adjustmentDeduction·priceDrop`) — 판 부분의 가액·하락분·
 * 안분·구분별 공제액을 화면에서 다시 계산하지 않는다. echo가 없으면(전역 입력·옛 이력) 아무것도 그리지 않아 종전 카드 그대로다.
 *
 * 결과 산식은 한국어 풀어쓰기(변수 약어 없음), 숫자 끝 「원」 표기 없음, 금액 칸은 고정폭·우측정렬(`AmountLine`).
 * 중립 표현만 쓴다 — 하락분이 0이면 «0»이라고만 보이고 유리/불리 표현을 쓰지 않는다.
 * 확인 필요 고지(환산 기준일·혼합 조정공제·하락분 종목별 비교·외국납부세액 한도)는 엔진 `warnings`가 «주의사항»으로 보인다.
 */

import type { ExitTaxResult } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { AmountLine, BUCKET_SHORT } from "./ExitTaxBucketCard";

/** 종목별 실제 양도 echo가 하나라도 있는가 — 카드의 라벨 분기와 이 섹션 노출의 단일 술어 */
export function hasActualTransferEcho(result: ExitTaxResult): boolean {
  return (result.holdingDetails ?? []).some((d) => d.actualTransfer !== undefined);
}

export function ExitTaxActualTransferSection({ result }: { result: ExitTaxResult }) {
  const lots = (result.holdingDetails ?? []).filter((d) => d.actualTransfer !== undefined);
  if (lots.length === 0) return null;
  const buckets = (result.bucketDetails ?? []).filter((b) => b.adjustmentDeduction !== undefined);

  return (
    <div
      className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2 space-y-2 dark:border-emerald-800/60 dark:bg-emerald-950/30"
      data-testid="exit-actual-transfer-result"
    >
      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
        종목별 실제 양도 (§118의12~§118의14) — 양도한 주식 수만 계산
      </p>

      {lots.map((d) => {
        const a = d.actualTransfer!;
        return (
          <div key={d.id} className="space-y-0.5" data-testid={`exit-actual-lot-${d.id}`}>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {d.stockName}
              {d.rateBucket ? ` · §118의11 ${BUCKET_SHORT[d.rateBucket]}` : ""}
            </p>
            <AmountLine label="실제 양도한 주식 수" value={`${a.soldShareCount.toLocaleString("ko-KR")}주`} />
            <AmountLine
              label="출국일 양도가액 중 판 부분 (1주당 출국일 시가 × 양도한 주식 수 — §118의10①)"
              value={a.departureValueSold}
            />
            <AmountLine
              label="필요경비 중 판 부분 (1주당 취득가액 × 양도한 주식 수 — §118의10②)"
              value={a.acquisitionCostSold}
            />
            <AmountLine label="실제 양도가액 (1주당 실제 양도가 × 양도한 주식 수)" value={a.actualTransferValue} />
            <AmountLine
              label="양도가액 하락분 = 출국일 양도가액 중 판 부분 − 실제 양도가액 (이 종목만 비교, 0보다 작으면 0)"
              value={a.priceDrop}
              strong
            />
            {a.foreignTaxPaidKrw !== undefined && (
              <AmountLine label="입력한 외국납부세액 (원화 환산)" value={a.foreignTaxPaidKrw} />
            )}
            {a.foreignTaxApportioned !== undefined && (
              <AmountLine
                label="외국납부세액 안분 = 외국납부세액 × (양도가액 − 필요경비) ÷ (실제 양도가액 − 필요경비) (§118의13①)"
                value={a.foreignTaxApportioned}
              />
            )}
          </div>
        );
      })}

      {buckets.length > 0 && (
        <div className="space-y-1 border-t border-emerald-200 pt-2 dark:border-emerald-800/60" data-testid="exit-actual-bucket-adjustments">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            세율 구분별 조정공제 = 구분 산출세액 − (구분 과세표준 − 구분 하락분)에 대한 산출세액
          </p>
          {buckets.map((b) => (
            <div key={b.bucket} className="space-y-0.5" data-testid={`exit-actual-bucket-${b.bucket}`}>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">§118의11 {BUCKET_SHORT[b.bucket]}</p>
              <AmountLine label="구분 과세표준" value={b.taxBase} />
              <AmountLine label="구분 양도가액 하락분 (이 구분 종목의 하락분 합)" value={b.priceDrop ?? 0} />
              <AmountLine label="구분 산출세액" value={b.calculatedTax} />
              <AmountLine label="구분 조정공제" value={b.adjustmentDeduction ?? 0} strong />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
