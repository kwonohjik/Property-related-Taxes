/** §3 사치성 재산 5종 정의·판정 기준 — 지방세법 §13① */
export function LuxuryDefinitionSection() {
  return (
    <section id="luxury-definition" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">3. 사치성 재산 5종 (§13①)</h2>
      <p className="text-sm text-muted-foreground">
        5종 사치성 재산 취득 시 <strong>표준세율 + 중과기준세율(2%) × 400%(=8%p)</strong> 적용.
      </p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-amber-50 text-amber-800">
            <th className="border border-amber-200 px-3 py-2 text-left">종류</th>
            <th className="border border-amber-200 px-3 py-2 text-left">판정 기준</th>
            <th className="border border-amber-200 px-3 py-2 text-left">비고</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          <tr>
            <td className="border border-border px-3 py-2 font-medium text-foreground">골프장</td>
            <td className="border border-border px-3 py-2">회원제 골프장 (체육시설업)</td>
            <td className="border border-border px-3 py-2 text-xs">대중 골프장 제외</td>
          </tr>
          <tr className="bg-muted/20">
            <td className="border border-border px-3 py-2 font-medium text-muted-foreground line-through">별장</td>
            <td className="border border-border px-3 py-2 text-muted-foreground">상시 주거 외 휴양·피서용</td>
            <td className="border border-border px-3 py-2 text-xs text-destructive font-medium">
              2023.3.14 이후 취득분 폐지 (§13① 2호 삭제)
            </td>
          </tr>
          <tr>
            <td className="border border-border px-3 py-2 font-medium text-foreground">고급주택</td>
            <td className="border border-border px-3 py-2">
              <div className="space-y-0.5 text-xs">
                <p>① 공시가격 9억 원 초과 (1세대 1주택)</p>
                <p>② 전용 300㎡ 초과 + 공시가격 6억 초과</p>
                <p>③ 에스컬레이터 설치</p>
                <p>④ 수영장 67㎡ 이상 설치</p>
              </div>
            </td>
            <td className="border border-border px-3 py-2 text-xs">기본세율 + 8%p</td>
          </tr>
          <tr className="bg-muted/20">
            <td className="border border-border px-3 py-2 font-medium text-foreground">고급오락장</td>
            <td className="border border-border px-3 py-2">카지노·나이트클럽·요정·무도유흥주점 등 풍속영업</td>
            <td className="border border-border px-3 py-2 text-xs"></td>
          </tr>
          <tr>
            <td className="border border-border px-3 py-2 font-medium text-foreground">고급선박</td>
            <td className="border border-border px-3 py-2">비업무용 20톤 이상 (레저용)</td>
            <td className="border border-border px-3 py-2 text-xs"></td>
          </tr>
        </tbody>
      </table>

      <div className="rounded-md bg-amber-50/60 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
        <p><strong>별장 폐지 주의 (v4 D1)</strong>: 2023.3.14 이후 별장 중과 폐지는 §13① 한정.</p>
        <p>§13의2 다주택 중과와 별개 — 별장은 주택 아니므로 다주택 카운트에 포함 안 됨.</p>
        <p><strong>사치성 + 다주택 중복</strong>: 다주택 중과세율에 8%p 추가 (최대 20%) — §13의2③</p>
      </div>
    </section>
  );
}
