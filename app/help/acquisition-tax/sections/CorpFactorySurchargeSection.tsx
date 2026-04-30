/** §5 법인·공장 중과 분류 + §13⑦ 사치성+대도시법인 중복 */
export function CorpFactorySurchargeSection() {
  return (
    <section id="corp-factory-surcharge" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">5. 법인·공장 중과 (§13①②·§13⑦)</h2>
      <p className="text-sm text-muted-foreground">
        과밀억제권역 내 대도시 법인 취득·본점 신증축 시 중과. 사치성 재산과 중복 시 §13⑦ 추가.
      </p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-rose-50 text-rose-800">
            <th className="border border-rose-200 px-3 py-2 text-left">유형</th>
            <th className="border border-rose-200 px-3 py-2 text-right">세율</th>
            <th className="border border-rose-200 px-3 py-2 text-left">근거</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {[
            ["본점·주사무소 신증축 (토지)", "4% + 4%p = 8%", "§13①1호"],
            ["본점·주사무소 신증축 (건물)", "2.8% + 4%p = 6.8%", "§13①1호"],
            ["비도시형 공장 신증설 (토지)", "4% + 4%p = 8%", "§13①2호"],
            ["비도시형 공장 신증설 (건물)", "2.8% + 4%p = 6.8%", "§13①2호"],
            ["대도시 법인 설립 5년 이내 (토지)", "4% × 3 = 12%", "§13②"],
            ["대도시 법인 + 본점 동시", "4% × 3 = 12%", "§13②+①"],
            ["사치성 + 대도시 법인 (주택 외)", "기본세율 × 3 + 4%p (토지 16%)", "§13⑦"],
            ["사치성 + 대도시 법인 (주택 §11①8)", "기본세율 + 12%p", "§13⑦단서"],
          ].map(([type, rate, basis], i) => (
            <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
              <td className="border border-border px-3 py-2">{type}</td>
              <td className="border border-border px-3 py-2 text-right font-medium text-foreground">{rate}</td>
              <td className="border border-border px-3 py-2 text-xs">{basis}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-2">
        <div className="rounded-md bg-amber-50/60 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
          <p><strong>중과제외업종 (§13②단서)</strong>: 사회기반시설·은행업·해외건설·주택건설(주택법§4)·전기통신·첨단기술·유통·운송·국가출자20%+ (9종)</p>
          <p>→ §13② 대도시 법인 중과에서 제외</p>
        </div>
        <div className="rounded-md bg-rose-50/60 border border-rose-200 p-3 text-xs text-rose-800 space-y-1">
          <p><strong>§13의2①1호(법인 주택) 단서 중과제외 (v4 D8)</strong>: §13②단서 9종과 다름.</p>
          <p>§13의2①1호 단서는 시행령 §28의2 8호 나목 <strong>5종만</strong> 해당:
          주택건설사업자·주택조합·민간임대·공공주택건설·도시정비사업자.</p>
        </div>
      </div>
    </section>
  );
}
