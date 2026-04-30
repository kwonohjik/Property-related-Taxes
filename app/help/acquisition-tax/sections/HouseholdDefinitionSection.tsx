/** §8 세대 기준 + 별도 세대 인정 4종 (시행령 §28의3) */
export function HouseholdDefinitionSection() {
  return (
    <section id="household-definition" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">8. 세대 정의 + 별도 인정 4종 (§28의3)</h2>

      <div className="rounded-md border border-border p-3 space-y-2">
        <h3 className="text-sm font-semibold">1세대 기준 (§28의3①)</h3>
        <p className="text-xs text-muted-foreground">
          <strong>1세대</strong> = 거주자 본인 + 배우자 + 동일 주소 거주하는 가족(직계존·비속, 형제자매 포함)<br />
          <strong>배우자는 사실혼 제외</strong>. 주민등록상 별거여도 동일 세대.
          30세 미만 미혼 자녀는 소득 무관하게 동일 세대.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">세대 별도 인정 4종 (§28의3②)</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-violet-50 text-violet-800">
              <th className="border border-violet-200 px-2 py-2">호</th>
              <th className="border border-violet-200 px-2 py-2 text-left">유형</th>
              <th className="border border-violet-200 px-2 py-2 text-left">요건</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {[
              ["1호", "30세 미만 소득 충족 자녀", "12개월 소득 ≥ 기준중위소득 40% + 독립 생계 유지"],
              ["2호", "65세 이상 직계존속 동거봉양 합가", "부모·조부모와 합가한 경우"],
              ["3호", "90일 이상 출국", "해외 체류 90일 이상"],
              ["4호", "취득 후 60일 이내 주소 분리", "실제 독립 생계 유지"],
            ].map(([no, type, req], i) => (
              <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                <td className="border border-border px-2 py-2 text-center">{no}</td>
                <td className="border border-border px-2 py-2 font-medium text-foreground">{type}</td>
                <td className="border border-border px-2 py-2">{req}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive mt-2">
          <strong>미성년자 예외 (v4 D7)</strong>: 30세 미만이어도 미성년자(만 19세 미만)는
          소득 충족 시에도 별도 세대 인정 불가 (§28의3② 1호 단서).
        </div>
      </div>
    </section>
  );
}
