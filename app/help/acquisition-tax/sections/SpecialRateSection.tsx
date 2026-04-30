/** §4 세율특례 9종 (§15) + §15+§13② 동시 적용 분기 */
export function SpecialRateSection() {
  return (
    <section id="special-rate" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">4. 세율특례 9종 (§15)</h2>
      <p className="text-sm text-muted-foreground">
        아래 사유에 해당하면 <strong>기본세율 − 중과기준세율(2%)</strong> 적용.
        §13②(대도시 법인 중과) 동시 적용 시 <strong>(기본세율 − 2%) × 3</strong>.
      </p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-violet-50 text-violet-800">
            <th className="border border-violet-200 px-3 py-2 text-left">사유</th>
            <th className="border border-violet-200 px-3 py-2 text-right">세율 예시</th>
            <th className="border border-violet-200 px-3 py-2 text-left">근거</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {[
            ["환매권 행사", "4% − 2% = 2%", "§15①1호"],
            ["상속 1가구 1주택", "2.8% − 2% = 0.8%", "§15①2호"],
            ["법인 적격합병", "4% − 2% = 2%", "§15①3호"],
            ["적격분할 취득", "4% − 2% = 2%", "§15①4호"],
            ["공유물·합유물 분할", "4% − 4% = 0% (하한 0)", "§15①5호"],
            ["이혼 재산분할", "기본세율 − 2%", "§15①6호"],
            ["건물 이전", "2.8% − 2% = 0.8%", "§15①6호 전단"],
            ["가류 공유물 분할", "3% − 2% = 1%", "§15①7호"],
            ["임목 취득", "2% − 2% = 0%", "§15①8호"],
          ].map(([cause, rate, basis], i) => (
            <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
              <td className="border border-border px-3 py-2">{cause}</td>
              <td className="border border-border px-3 py-2 text-right font-medium text-foreground">{rate}</td>
              <td className="border border-border px-3 py-2 text-xs">{basis}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rounded-md bg-violet-50/60 border border-violet-200 p-3 text-xs text-violet-800 space-y-1">
        <p><strong>§15 + §13②(대도시 법인) 동시 적용</strong>: (기본세율 − 2%) × 3</p>
        <p>예) 상속 1가구1주택 + 대도시 법인 → (2.8% − 2%) × 3 = 2.4% (§13⑦ 1,000분의 24)</p>
        <p><strong>§13①(본점·공장 중과)은 §15 배제</strong>: 중과세율 직접 적용됨.</p>
      </div>
    </section>
  );
}
