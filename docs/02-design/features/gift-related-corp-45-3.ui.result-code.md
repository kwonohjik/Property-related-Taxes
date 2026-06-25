# §45의3 일감몰아주기 — 결과뷰 렌더링 코드 패턴

> 메인 설계 문서 `gift-related-corp-45-3.ui.design.md` §2 ⑦ 의사코드 분리.
> `DeemedGiftResultView.tsx` Do 단계 구현 참조용.

---

## `related_corp` 분기 전체 렌더링 (의사코드)

> **Critical-1 정정**: `DeemedGiftResultView`의 `result` 타입은 `DeemedGiftAnyResult`(union).
> `result.type === "related_corp"` 단독 내로잉으로는 신규 필드(recipientBreakdown 등)에 접근 불가(TS2339).
> 엔진이 신규 필드를 base `DeemedGiftResult`에 **optional**로 추가하므로,
> UI는 **존재 가드** `result.type === "related_corp" && result.recipientBreakdown`로 분기.
> 기존 패턴: `DeemedGiftResultView.tsx:319` `result.contributionBreakdown &&`·`:436`·`:548`·
> `gift-deemed-api.ts:511` `result.type === "contribution" && result.contributionBreakdown` 동일.

```tsx
// DeemedGiftResultView.tsx 내 관련법인 결과 분기
// ⚠️ 존재 가드 필수 — type 내로잉 단독으로는 optional base 필드 접근 불가
if (result.type === "related_corp" && result.recipientBreakdown) {
  const breakdown = result.recipientBreakdown;   // RcRecipientBreakdown[]
  const relatedSalesAmt = result.relatedSales;    // number | undefined (Medium-5 echo)

  return (
    <div className="space-y-4" data-testid="deemed-result">
      {/* 합계 카드 */}
      <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
        <p className="text-sm font-semibold text-rose-800">
          일감몰아주기 증여의제이익 합계 (§45의3)
        </p>
        <p className="mt-1 text-right font-mono text-2xl font-bold tabular-nums text-rose-900"
           data-testid="deemed-result-value">
          {formatKRW(result.deemedGiftValue)}
        </p>
        <LawArticleModal legalBasis={result.legalBasis ?? "상증법 §45의3"} />
      </div>

      {/* 과세요건 공통부 카드 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4">
        <p className="text-sm font-semibold text-sky-800">수혜법인 단위 과세요건</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            <tr>
              <td>지배주주</td>
              <td className="text-right">{result.rulingShareholder}</td>
            </tr>
            {/* Medium-5: relatedSales echo — 엔진 echo 필드 추가 후 노출 */}
            {relatedSalesAmt != null && (
              <tr>
                <td>특수관계매출</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(relatedSalesAmt)}
                </td>
              </tr>
            )}
            <tr>
              <td>
                거래비율 = ({result.tradeRatioNumer.toLocaleString()} ÷{" "}
                {result.tradeRatioDenom.toLocaleString()})
              </td>
              <td className="text-right">
                {((result.tradeRatio.numer / result.tradeRatio.denom) * 100).toFixed(2)}%
              </td>
            </tr>
            <tr>
              <td>정상거래비율</td>
              <td className="text-right">
                {((result.normalTradeRatio.numer / result.normalTradeRatio.denom) * 100).toFixed(0)}%
              </td>
            </tr>
            <tr>
              <td>과세요건</td>
              <td className="text-right">{result.taxRequirementMet ? "충족" : "미충족"}</td>
            </tr>
            <tr>
              <td>공통 과세제외매출</td>
              <td className="text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(result.taxableExcludedSales)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 수증자별 직접/간접 표 */}
      <div
        className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"
        data-testid="rc-recipient-breakdown"
      >
        <p className="text-sm font-semibold text-emerald-800">수증자별 증여의제이익 내역</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left">수증자</th>
                <th className="text-right">세후영업이익</th>
                <th className="text-right">거래비율차감후</th>
                <th className="text-right">보유비율차감후</th>
                <th className="text-right">직접이익</th>
                <th className="text-right">간접이익</th>
                <th className="text-right">소계</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-emerald-100"
                  data-testid={`rc-recipient-row-${i}`}
                >
                  {/* id 비노출 — name.trim() || "지배주주등" */}
                  <td className="py-1.5 pr-2 text-emerald-700">
                    {r.recipientName.trim() || "지배주주등"}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(r.pretaxProfit)}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.tradeRatioOver.numer}/{r.tradeRatioOver.denom}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.directOwnershipOver.numer}/{r.directOwnershipOver.denom}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(r.directGain)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {r.indirectGain > 0 ? formatKRW(r.indirectGain) : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                    {formatKRW(r.subtotal)}
                  </td>
                </tr>
              ))}
              {/* 합계 행 */}
              <tr className="border-t-2 border-emerald-200 font-semibold">
                <td colSpan={6} className="py-1.5 pr-2">
                  합계
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(result.deemedGiftValue)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* RC-INDIRECT-ECHO — 직접·간접 보유 raw 산출 확인 카드 (Medium-4 정정: directRatioRaw 대칭 추가) */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
        <p className="text-xs font-semibold text-amber-800">
          보유비율 산출 내역 (직접·간접 raw)
        </p>
        <table className="mt-1 w-full text-xs">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="text-left">수증자</th>
              <th className="text-right">직접보유 raw</th>
              <th className="text-right">간접보유 raw</th>
              <th className="text-right">직접이익</th>
              <th className="text-right">간접이익</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((r, i) => (
              <tr key={i} className="border-t border-amber-100">
                <td className="py-1 pr-2 text-amber-700">
                  {r.recipientName.trim() || "지배주주등"}
                </td>
                {/* directRatioRaw — Medium-4 정정: indirectRatioRaw와 대칭 표시 */}
                <td className="py-1 text-right text-muted-foreground">
                  {r.directRatioRaw.numer}/{r.directRatioRaw.denom}
                </td>
                <td className="py-1 text-right text-muted-foreground">
                  {r.indirectRatioRaw.numer > 0
                    ? `${r.indirectRatioRaw.numer}/${r.indirectRatioRaw.denom}`
                    : "—"}
                </td>
                <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(r.directGain)}
                </td>
                <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">
                  {r.indirectGain > 0 ? formatKRW(r.indirectGain) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-muted-foreground">
          간접이익=0은 "미작동"이 아닙니다. 간접보유 전부를 한계보유비율 차감에 우선 사용하여
          직접이익에 산입합니다 (§34의3⑬).
        </p>
      </div>

      {/* 교재 반올림차 주석 */}
      <p className="text-[11px] text-muted-foreground">
        ※ 교재는 거래비율차감후 8.33% 반올림 적용 시 갑 직접이익 20,514,000원으로 표시.
        본 시스템은 정확분수(1/12) 정수연산으로 20,520,000원 산출.
      </p>

      {result.applied && (
        <button
          type="button"
          onClick={onToGiftTax}
          data-testid="deemed-to-wizard"
          className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
        >
          이 금액으로 증여세 계산하기 →
        </button>
      )}
    </div>
  );
}
```

---

## 산식 한국어 풀어쓰기

```
세후영업이익(갑)
  = (세무조정 반영 영업손익 − 법인세 순세액 × min(세무조정영업이익 / 소득, 1))
    × (1 − 과세제외매출(갑) / 총매출액)
  = (2,500,000,000 − 340,000,000 × 1) × (1 − 8,000,000,000 / 20,000,000,000)
  = 2,160,000,000 × 0.60
  = 1,296,000,000

갑 직접 증여의제이익
  = 세후영업이익(갑) × 거래비율차감후 × 직접보유비율차감후
  = 1,296,000,000 × (1/12) × (19/100)
  = 20,520,000
```

---

## 주요 testId 목록

| `data-testid` | 위치 |
|---|---|
| `deemed-result` | 결과 컨테이너 |
| `deemed-result-value` | 합계 금액 |
| `rc-recipient-breakdown` | 수증자별 표 컨테이너 |
| `rc-recipient-row-{i}` | i번째 수증자 행 (0-indexed) |
| `deemed-to-wizard` | 증여세 마법사 이관 버튼 |
