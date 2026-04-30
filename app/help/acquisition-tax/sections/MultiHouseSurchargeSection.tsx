/** §2 다주택 중과세율 (조정/비조정 × 주택 수별) — 지방세법 §13의2① */
export function MultiHouseSurchargeSection() {
  return (
    <section id="multi-house-surcharge" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">2. 다주택 중과세율 (§13의2①)</h2>
      <p className="text-sm text-muted-foreground">
        다주택 중과의 표준세율 베이스는 <strong>§11①7나(4%)</strong>. 주택 수·지역에 따라 8% 또는 12%.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="bg-rose-50 text-rose-800">
              <th className="border border-rose-200 px-3 py-2 text-left">취득 후 주택 수</th>
              <th className="border border-rose-200 px-3 py-2 text-right">조정대상지역</th>
              <th className="border border-rose-200 px-3 py-2 text-right">비조정지역</th>
              <th className="border border-rose-200 px-3 py-2 text-left">근거</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {[
              ["1주택", "1~3% (가격별)", "1~3% (가격별)", "§11①8"],
              ["2주택", "8%", "1~3% (기본)", "§13의2①2호"],
              ["3주택", "12%", "8%", "§13의2①2·3호"],
              ["4주택 이상", "12%", "12%", "§13의2①3호"],
              ["법인 (주택)", "12%", "12%", "§13의2①1호"],
            ].map(([count, reg, nonReg, basis], i) => (
              <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                <td className="border border-border px-3 py-2">{count}</td>
                <td className={`border border-border px-3 py-2 text-right font-medium ${i >= 1 ? "text-rose-700" : "text-foreground"}`}>{reg}</td>
                <td className={`border border-border px-3 py-2 text-right font-medium ${i >= 2 ? "text-rose-600" : "text-foreground"}`}>{nonReg}</td>
                <td className="border border-border px-3 py-2 text-xs">{basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md bg-rose-50/60 border border-rose-200 p-3 text-xs text-rose-800 space-y-1">
        <p><strong>산식</strong>: §11①7나(4%) + 중과기준세율(2%) × N% = 8% 또는 12%</p>
        <p><strong>사치성 재산 중복</strong>: 다주택 중과세율 + 8%p 추가 (§13의2③)</p>
        <p><strong>무상취득 중과</strong>: 조정지역 + 시가표준액 3억 이상 증여 → 12% (§13의2②)</p>
      </div>
    </section>
  );
}
