/** §14 신고 기한 D-day (4가지 원인별 — §20) */
export function FilingDeadlineSection() {
  return (
    <section id="filing-deadline" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">14. 신고 기한 (§20)</h2>
      <p className="text-sm text-muted-foreground">
        취득세 신고·납부 기한은 취득 원인별로 다릅니다. 기한 내 신고 필수.
      </p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-emerald-50 text-emerald-800">
            <th className="border border-emerald-200 px-3 py-2 text-left">취득 원인</th>
            <th className="border border-emerald-200 px-3 py-2 text-left">신고 기한</th>
            <th className="border border-emerald-200 px-3 py-2 text-left">기준일</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          <tr>
            <td className="border border-border px-3 py-2 font-medium text-foreground">일반 유상취득 (매매·경매)</td>
            <td className="border border-border px-3 py-2">취득일로부터 <strong className="text-foreground">60일</strong></td>
            <td className="border border-border px-3 py-2 text-xs">잔금지급일 또는 등기접수일 중 빠른 날</td>
          </tr>
          <tr className="bg-muted/20">
            <td className="border border-border px-3 py-2 font-medium text-foreground">상속</td>
            <td className="border border-border px-3 py-2">상속개시일이 속한 달 말일로부터 <strong className="text-foreground">6개월</strong></td>
            <td className="border border-border px-3 py-2 text-xs">외국 거주 상속인: 9개월. 상속개시일 = 피상속인 사망일</td>
          </tr>
          <tr>
            <td className="border border-border px-3 py-2 font-medium text-foreground">증여</td>
            <td className="border border-border px-3 py-2">취득일(등기일)이 속한 달 말일로부터 <strong className="text-foreground">3개월</strong></td>
            <td className="border border-border px-3 py-2 text-xs">2023년 신설 규정 (종전: 60일)</td>
          </tr>
          <tr className="bg-muted/20">
            <td className="border border-border px-3 py-2 font-medium text-foreground">등기 전 신고 (§20④)</td>
            <td className="border border-border px-3 py-2">등기·등록 신청일까지</td>
            <td className="border border-border px-3 py-2 text-xs">등기 전에 먼저 납부해야 등기 가능</td>
          </tr>
        </tbody>
      </table>

      <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive space-y-1">
        <p><strong>무신고·지연 가산세</strong>:</p>
        <p>• 무신고가산세: 납부세액의 20%</p>
        <p>• 납부불성실가산세: 일 0.022% × 지연일수</p>
        <p>• 신고기한 내 자진수정신고 시 가산세 감면 혜택 있음.</p>
      </div>
    </section>
  );
}
