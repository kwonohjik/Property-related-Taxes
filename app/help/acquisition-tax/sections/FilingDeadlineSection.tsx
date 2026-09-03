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

      {/**
       * 🔴 G-23: 종전 박스는 ① 지방세법 §21② 미신고 매각 80% 중가산을 빠뜨려 최대 부담을
       * 「20% + 지연이자」로 읽게 했고(산출세액 1,000만원·100일 지연이면 안내가 시사하는 값은
       * 1,222만원이지만 실제 보통징수는 1,800만원), ② 감면 요건을 「신고기한 **내**」로 적었는데
       * 지방세기본법 §57②의 감면 계단은 「법정신고기한이 **지난 후**」에만 성립한다.
       *
       * ⚠️ 이 페이지 머리말이 「지방세법 §10~§15 … 기준」이라 §만 적으면 지방세법으로 읽힌다 —
       *    지방세기본법 조문에는 법령명을 반드시 병기한다.
       */}
      <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive space-y-1">
        <p><strong>무신고·지연 가산세</strong> (지방세법 §21, 지방세기본법 §53·§55·§57):</p>
        <p>• 무신고가산세: 무신고납부세액의 <strong>20%</strong> (지방세기본법 §53①)</p>
        <p>• 부정행위 무신고: <strong>40%</strong> (지방세기본법 §53②)</p>
        <p>
          • 납부지연가산세: 일 <strong>0.022%</strong> × 지연일수 (지방세기본법 §55①1호, 같은 법
          시행령 §34①)
        </p>
        <p>
          • <strong>신고하지 않고 매각한 경우</strong>: 위 가산세 대신 산출세액에 <strong>80%</strong>를
          가산한 금액을 보통징수합니다 — 산출세액의 <strong>180%</strong> (지방세법 §21②).
          다만 등기·등록이 필요하지 않은 과세물건 등은 제외됩니다.
        </p>
        <p>
          • 가산세 감면은 <strong>법정신고기한이 지난 후</strong>에 성립합니다 (지방세기본법 §57②).
          기한 내 신고한 자의 <strong>수정신고</strong>는 기한 경과 후 1개월 이내 90% · 1~3개월 75% ·
          3~6개월 50% · 6개월~1년 30% · 1년~1년6개월 20% · 1년6개월~2년 10%(1호 — 과소신고·
          초과환급신고가산세 §54만 해당), 신고하지 않은 자의 <strong>기한후신고</strong>는 1개월 이내
          50% · 1~3개월 30% · 3~6개월 20%(2호 — 무신고가산세 §53만 해당)입니다.
          어느 쪽도 <strong>납부지연가산세(§55)는 감면 대상이 아니며</strong>, 경정·결정을 미리 알고
          신고한 경우에는 감면이 배제됩니다.
        </p>
      </div>
    </section>
  );
}
