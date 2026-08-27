"use client";

/**
 * 다종목 합산신고 — 종목별 요약 + 합계
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md (Phase 6)
 *
 * 단건 결과 카드는 「이 종목」만 보여주므로, 여러 종목을 합산했을 때 **왜 그 세액이 나왔는지**를
 * 설명하지 못한다. 특히 다음 세 가지는 종목 하나만 봐서는 알 수 없다:
 *
 * · **§103①2호** 기본공제 250만원이 어느 종목에 갔는가 (먼저 양도한 자산부터 — §103②)
 * · **§102②** 양도차손이 얼마나 통산됐는가
 * · **§118의6①1호** 국외 종목의 공제한도가 `A × B / C`로 어떻게 갈렸는가
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

const won = (n: number) => `${n.toLocaleString()}원`;

export function StockAggregateSummaryCard({
  aggregate,
  names,
}: {
  aggregate: StockTransferAggregateResult;
  /** 종목명 — items와 같은 순서 */
  names: string[];
}) {
  const foreignItems = aggregate.items
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.foreignDetail?.foreignTaxCreditLimit !== undefined);

  return (
    <div className="space-y-4">
      <ToneCard tone="sky" title={`다종목 합산 (${aggregate.items.length}건)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-1.5 text-left font-medium">종목</th>
                <th className="py-1.5 text-right font-medium">양도소득금액</th>
                <th className="py-1.5 text-right font-medium">기본공제</th>
                <th className="py-1.5 text-right font-medium">과세표준</th>
                <th className="py-1.5 text-right font-medium">세율</th>
                <th className="py-1.5 text-right font-medium">산출세액</th>
              </tr>
            </thead>
            <tbody>
              {aggregate.items.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">
                    {r.foreignDetail && (
                      <span className="mr-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-micro font-semibold text-sky-700">
                        해외
                      </span>
                    )}
                    {names[i] || `종목 ${i + 1}`}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {won(r.transferIncome)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {won(r.basicDeduction)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {won(r.taxBase)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {(r.appliedRate * 100).toFixed(r.appliedRate * 100 % 1 === 0 ? 0 : 1)}%
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {won(r.calculatedTax)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-1.5">합계</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {won(aggregate.totalTransferIncome)}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {won(aggregate.basicDeductionByGroup.stock)}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {won(aggregate.totalTaxBase)}
                </td>
                <td />
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {won(aggregate.totalCalculatedTax)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-caption text-muted-foreground">
          기본공제 250만원은 <strong>주식 그룹 연 1회</strong>이며(소득세법 §103①2호), 해당 과세기간에{" "}
          <strong>먼저 양도한 자산의 양도소득금액에서부터</strong> 순서대로 공제됩니다(§103②).
        </p>
      </ToneCard>

      {aggregate.lossOffset && (
        <ToneCard tone="amber" title="양도차손 통산 (소득세법 §102②)">
          <p className="text-sm">
            통산액{" "}
            <span className="font-mono tabular-nums font-semibold">
              {won(aggregate.lossOffset.totalOffset)}
            </span>
            {aggregate.lossOffset.unusedLoss > 0 && (
              <>
                {" · "}공제되지 못하고 소멸한 차손{" "}
                <span className="font-mono tabular-nums font-semibold">
                  {won(aggregate.lossOffset.unusedLoss)}
                </span>
              </>
            )}
          </p>
          <p className="text-caption text-muted-foreground">
            양도차손은 같은 호의 다른 자산 양도소득금액에서 공제하며(§102②), 남은 차손은 다음 과세기간으로
            이월되지 않습니다(§102① 후단).
          </p>
        </ToneCard>
      )}

      {foreignItems.length > 0 && (
        <ToneCard tone="violet" title="외국납부세액 공제한도 (소득세법 §118의6①1호)">
          <p className="text-xs text-muted-foreground">
            공제한도 = 국외주식 산출세액 합계 × <Frac top="해당 종목 양도소득금액" bottom="국외주식 양도소득금액 합계" />
          </p>
          <ul className="space-y-1.5">
            {foreignItems.map(({ r, i }) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span>{names[i] || `종목 ${i + 1}`}</span>
                <span className="font-mono tabular-nums">
                  한도 {won(r.foreignDetail!.foreignTaxCreditLimit ?? 0)}
                  {" · "}공제 {won(r.foreignDetail!.foreignTaxCreditApplied ?? 0)}
                  {" / "}납부 {won(r.foreignDetail!.foreignTaxPaidKrw ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </ToneCard>
      )}

      <ToneCard tone="emerald" title="합계 납부세액">
        <dl className="space-y-1 text-sm">
          {/*
            가산세는 **신고 1건 단위 1회**다(국세기본법 §47조의2·§47조의3·§47조의4).
            결정세액에 이미 포함돼 있지만 내역을 보이지 않으면 「왜 이 금액인가」를 알 수 없다.
          */}
          {aggregate.totalUnderReportPenalty > 0 && (
            <div className="flex justify-between">
              <dt>신고불성실 가산세</dt>
              <dd className="font-mono tabular-nums">{won(aggregate.totalUnderReportPenalty)}</dd>
            </div>
          )}
          {aggregate.totalLatePaymentPenalty > 0 && (
            <div className="flex justify-between">
              <dt>납부지연 가산세</dt>
              <dd className="font-mono tabular-nums">{won(aggregate.totalLatePaymentPenalty)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>양도소득세 결정세액</dt>
            <dd className="font-mono tabular-nums font-semibold">{won(aggregate.totalFinalTax)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>지방소득세</dt>
            <dd className="font-mono tabular-nums">{won(aggregate.totalLocalIncomeTax)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <dt>합계</dt>
            <dd className="font-mono tabular-nums">
              {won(aggregate.totalFinalTax + aggregate.totalLocalIncomeTax)}
            </dd>
          </div>
        </dl>
        {(aggregate.totalUnderReportPenalty > 0 || aggregate.totalLatePaymentPenalty > 0) && (
          <p className="text-caption text-muted-foreground">
            가산세는 종목마다 매기지 않고 <strong>신고 1건 단위</strong>로 한 번 산정합니다
            (국세기본법 §47조의2·§47조의3·§47조의4).
          </p>
        )}
      </ToneCard>

      {/*
        증권거래세는 **양도소득세와 별개 세목**이라 위 합계에 더하지 않는다.
        엔진은 종목별 값을 합산해 `totalSecuritiesTransactionTax` 로 실어 보내는데
        종전에는 **UI 참조가 0건**이라 화면에 나온 적이 없었다(계산은 맞는데 표시 누락).
      */}
      {aggregate.totalSecuritiesTransactionTax.totalTax > 0 && (
        <ToneCard tone="slate" title="증권거래세 합계 (정보성)">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>증권거래세분</dt>
              <dd className="font-mono tabular-nums">
                {won(aggregate.totalSecuritiesTransactionTax.securitiesTransactionTax)}
              </dd>
            </div>
            {aggregate.totalSecuritiesTransactionTax.agriculturalTax > 0 && (
              <div className="flex justify-between">
                <dt>농어촌특별세</dt>
                <dd className="font-mono tabular-nums">
                  {won(aggregate.totalSecuritiesTransactionTax.agriculturalTax)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>합계</dt>
              <dd className="font-mono tabular-nums">
                {won(aggregate.totalSecuritiesTransactionTax.totalTax)}
              </dd>
            </div>
          </dl>
          <p className="text-caption text-muted-foreground">
            증권거래세는 양도소득세와 <strong>별도로 납부</strong>하는 세목입니다 — 위 납부세액
            합계에 포함되지 않습니다. 종목별 계산 근거는 각 종목 결과 화면에서 볼 수 있습니다.
          </p>
        </ToneCard>
      )}
    </div>
  );
}
