/**
 * §1 표준세율 표 (12종 × 원인별)
 */
export function StandardRateSection() {
  return (
    <section id="standard-rate" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">1. 취득세 표준세율</h2>
      <p className="text-sm text-muted-foreground">
        지방세법 §11①에 따른 물건 유형 × 취득 원인별 기본 세율입니다.
      </p>

      {/* 주택 유상취득 */}
      <div>
        <h3 className="text-sm font-semibold mb-2 text-sky-700">주택 유상취득 (매매·경매·공매)</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-sky-50 text-sky-800">
              <th className="border border-sky-200 px-3 py-2 text-left">취득가액</th>
              <th className="border border-sky-200 px-3 py-2 text-right">취득세율</th>
              <th className="border border-sky-200 px-3 py-2 text-left">비고</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr>
              <td className="border border-border px-3 py-2">6억 원 이하</td>
              <td className="border border-border px-3 py-2 text-right font-medium text-foreground">1%</td>
              <td className="border border-border px-3 py-2">§11①8가</td>
            </tr>
            <tr className="bg-muted/20">
              <td className="border border-border px-3 py-2">6억 초과 ~ 9억 이하</td>
              <td className="border border-border px-3 py-2 text-right font-medium text-violet-700">선형보간</td>
              <td className="border border-border px-3 py-2 text-xs">
                세율 = (취득가액 × 2 ÷ 3억 − 3) ÷ 100<br />
                6억+1원 ≒ 1.0%, 7.5억 ≒ 2%, 9억−1원 ≒ 3%
              </td>
            </tr>
            <tr>
              <td className="border border-border px-3 py-2">9억 원 초과</td>
              <td className="border border-border px-3 py-2 text-right font-medium text-foreground">3%</td>
              <td className="border border-border px-3 py-2">§11①8다</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 물건별 기타 세율 */}
      <div>
        <h3 className="text-sm font-semibold mb-2 text-sky-700">물건 유형 × 취득 원인별 세율</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-sky-50 text-sky-800">
              <th className="border border-sky-200 px-3 py-2 text-left">물건 유형</th>
              <th className="border border-sky-200 px-3 py-2 text-left">취득 원인</th>
              <th className="border border-sky-200 px-3 py-2 text-right">세율</th>
              <th className="border border-sky-200 px-3 py-2 text-left">근거</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {[
              ["토지", "매매·경매", "4%", "§11①7나"],
              ["건물 (비주거)", "매매·경매", "4%", "§11①7나"],
              ["주택", "상속 (일반)", "2.8%", "§11①5나"],
              ["농지", "상속", "2.3%", "§11①5나 단서"],
              ["주택·토지·건물", "증여 (일반)", "3.5%", "§11①2나"],
              ["비영리단체 취득", "증여", "2.8%", "§11①2가"],
              ["주택·건물", "신축·증축 (원시취득)", "2.8%", "§11①3"],
              ["농지", "매매·경매", "3%", "§11①7가"],
              ["차량", "유상취득", "7%", "§12①1"],
              ["중기·기계", "유상취득", "2%", "§12①2"],
              ["회원권", "취득", "2%", "§12①5"],
            ].map(([type, cause, rate, basis], i) => (
              <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                <td className="border border-border px-3 py-2">{type}</td>
                <td className="border border-border px-3 py-2">{cause}</td>
                <td className="border border-border px-3 py-2 text-right font-medium text-foreground">{rate}</td>
                <td className="border border-border px-3 py-2 text-xs">{basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md bg-blue-50/60 border border-blue-200 p-3 text-xs text-blue-800">
        <strong>중과기준세율</strong>: 지방세법 §13의2의 &ldquo;중과기준세율&rdquo;은 <strong>2%</strong>입니다.
        다주택 중과는 §11①7나(4%)를 표준세율로 하여 산정.
      </div>
    </section>
  );
}
