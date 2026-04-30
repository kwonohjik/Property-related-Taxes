/** §9 일시적 2주택 시점별 처분기한 변천표 (시행령 §28의5①) */
export function TemporaryTwoHouseSection() {
  return (
    <section id="temporary-two-house" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">9. 일시적 2주택 처분기한 변천 (§28의5①)</h2>
      <p className="text-sm text-muted-foreground">
        종전 주택을 보유한 상태에서 신규 주택 취득 시, 처분기한 내 종전 주택 처분 시 중과 배제.
        <strong> 잔금일 기준으로 시점별 처분기한 적용.</strong>
      </p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-rose-50 text-rose-800">
            <th className="border border-rose-200 px-3 py-2 text-left">신규 주택 잔금일</th>
            <th className="border border-rose-200 px-3 py-2 text-center">조정지역 → 조정지역</th>
            <th className="border border-rose-200 px-3 py-2 text-center">그 외 조합</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          <tr>
            <td className="border border-border px-3 py-2">~ 2022.5.9</td>
            <td className="border border-border px-3 py-2 text-center font-medium">1년</td>
            <td className="border border-border px-3 py-2 text-center">3년</td>
          </tr>
          <tr className="bg-muted/20">
            <td className="border border-border px-3 py-2">2022.5.10 ~ 2023.2.27</td>
            <td className="border border-border px-3 py-2 text-center font-medium">2년</td>
            <td className="border border-border px-3 py-2 text-center">3년</td>
          </tr>
          <tr>
            <td className="border border-border px-3 py-2 font-semibold text-foreground">2023.2.28 ~ 현행</td>
            <td className="border border-border px-3 py-2 text-center font-bold text-foreground">3년</td>
            <td className="border border-border px-3 py-2 text-center font-bold text-foreground">3년</td>
          </tr>
        </tbody>
      </table>

      <div className="space-y-2">
        <div className="rounded-md bg-rose-50/60 border border-rose-200 p-3 text-xs text-rose-800 space-y-1">
          <p><strong>현행(2023.2.28~)</strong>: 조정지역 여부 무관하게 모든 경우 <strong>3년 단일</strong></p>
          <p>종전 주택 처분기한(3년) 내에 처분하면 중과 배제 → 기본세율 적용</p>
        </div>
        <div className="rounded-md bg-muted/30 border border-border p-3 text-xs text-muted-foreground">
          <strong>요건</strong>: 취득 후 주택 수 = 2주택 (일시적 상태). 처분기한 내 종전 주택을 처분해야 중과 배제 유지.
          처분기한 경과 후에도 미처분이면 소급 추징 위험.
        </div>
      </div>
    </section>
  );
}
