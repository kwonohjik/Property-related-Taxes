/** §10 무상취득 중과 배제 단서 정밀 (시행령 §28의6② — 계부모·의붓자녀 + §15①6) */
export function GiftSurchargeExclusionSection() {
  return (
    <section id="gift-surcharge-exclusion" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">10. 무상취득 중과 배제 단서 (§28의6②)</h2>
      <p className="text-sm text-muted-foreground">
        조정지역 + 시가표준액 3억 이상 증여여도 아래 단서에 해당하면 12% 중과 미적용 → 일반 증여세율(3.5%) 적용.
      </p>

      <div className="space-y-3">
        <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
          <h3 className="text-sm font-semibold text-violet-700 mb-2">1호 단서 — 증여자가 1세대 1주택자 + 가족 수증</h3>
          <p className="text-xs text-muted-foreground mb-2">
            증여자(贈與者)가 무상취득 직전 <strong>1세대 1주택자</strong>이고,
            수증자가 다음 관계에 해당하면 중과 배제:
          </p>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {[
                ["가목", "수증자의 배우자 (법률혼)", "사실혼 제외"],
                ["나목 1", "수증자의 직계존속 (부모·조부모)", ""],
                ["나목 2", "수증자의 직계존속의 배우자 (계부·계모)", "혼인 중인 경우만"],
                ["다목 1", "수증자의 직계비속 (자녀·손자녀)", ""],
                ["다목 2", "수증자의 의붓자녀 (혼인 중 배우자의 직계비속)", "혼인 중인 경우만"],
              ].map(([no, rel, note], i) => (
                <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                  <td className="border border-border px-2 py-1.5 font-medium text-foreground w-16">{no}</td>
                  <td className="border border-border px-2 py-1.5 text-muted-foreground">{rel}</td>
                  <td className="border border-border px-2 py-1.5 text-muted-foreground">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>중요</strong>: 계부·계모(나목2), 의붓자녀(다목2)도 포함 — "법률상 가족"이면 해당 (v3 정밀화).
            사실혼은 모든 경우에서 제외.
          </p>
        </div>

        <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
          <h3 className="text-sm font-semibold text-violet-700 mb-2">2호 단서 — 이혼 재산분할 (§15①6호 세율특례)</h3>
          <p className="text-xs text-muted-foreground">
            §15①6호 이혼 재산분할 세율특례가 적용되는 경우 무상취득 중과 배제.
            재산분할 명목의 증여는 중과 12% 미적용 → 특례세율(기본세율 − 2%) 적용.
          </p>
        </div>

        <div className="rounded-md bg-rose-50/60 border border-rose-200 p-3 text-xs text-rose-800 space-y-1">
          <p><strong>단서 미해당 시 중과 적용 조건</strong> (3가지 모두 충족):</p>
          <p>① 조정대상지역 소재 주택 취득</p>
          <p>② 전체 주택 시가표준액 3억 원 이상</p>
          <p>③ 위 단서 1호·2호 모두 미해당</p>
          <p>→ §13의2② 12% 중과세율 적용</p>
        </div>
      </div>
    </section>
  );
}
