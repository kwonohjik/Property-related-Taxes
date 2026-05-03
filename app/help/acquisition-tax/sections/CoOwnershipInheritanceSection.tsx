/** §12 공유지분·공동상속·권리취득일 산정 가이드 (v4 D3·D4·D5, §28의4①·④·⑤·⑥3호) */
export function CoOwnershipInheritanceSection() {
  return (
    <section id="co-ownership-inheritance" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">12. 공유지분·공동상속·권리취득일 (§28의4)</h2>

      {/* 공유지분 */}
      <div className="rounded-md border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <h3 className="text-sm font-semibold text-sky-700">1) 공유지분 1주택 카운트 (§28의4④)</h3>
        <table className="w-full text-xs border-collapse">
          <tbody>
            {[
              ["1세대 내 부부 공동명의", "공동소유자 모두 같은 1세대", "→ 1주택으로 카운트 (지분율 무관)"],
              ["별도 세대와 공동명의", "공동소유자 중 별도 세대 존재", "→ 각자 1주택씩 카운트"],
            ].map(([case_, cond, result], i) => (
              <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                <td className="border border-border px-2 py-1.5 font-medium text-foreground">{case_}</td>
                <td className="border border-border px-2 py-1.5 text-muted-foreground">{cond}</td>
                <td className="border border-border px-2 py-1.5 text-sky-700 font-medium">{result}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">지분율(50%·30% 등)은 카운트에 영향 없음. 공유 여부·세대 동일성만 판단.</p>
      </div>

      {/* 공동상속 */}
      <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <h3 className="text-sm font-semibold text-amber-700">2) 공동상속 — 주된 상속자만 카운트 (§28의4⑤·⑥3호)</h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• <strong>상속 5년 미경과</strong>: 상속개시일로부터 5년 내 → 주택 수 제외 (§28의4⑥3호)</li>
          <li>• <strong>5년 경과 후</strong>: 공동상속 주택에서 지분이 가장 큰 상속인만 1주택 카운트</li>
          <li>• <strong>지분 동순위</strong>: 거주자 우선 → 최연장자 순으로 &ldquo;주된 상속자&rdquo; 결정</li>
          <li>• 주된 상속자 외의 상속인은 카운트 불산입</li>
        </ul>
        <div className="rounded bg-amber-100/60 p-2 text-xs text-amber-800">
          예) 어머니 사망 → 자녀 2명 각 50% 상속. 상속개시일 3년 후 취득 시 →
          두 자녀 모두 카운트 제외 (5년 미경과). 6년 후 취득 시 → 거주자(또는 최연장자)만 1주택 카운트.
        </div>
      </div>

      {/* 권리취득일 소급 */}
      <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <h3 className="text-sm font-semibold text-violet-700">3) 분양권·입주권 권리취득일 소급 (§28의4①)</h3>
        <p className="text-xs text-muted-foreground">
          분양권·입주권으로 주택을 취득하는 경우 주택 수 산정 기준일 = <strong>권리취득일 (분양계약일)</strong>.
          잔금일 기준이 아님.
        </p>
        <div className="rounded bg-violet-100/60 p-2 text-xs text-violet-800">
          예) 2023년 분양권 취득(2주택 보유 상태) + 2024년 주택 매수 + 2026년 등기 →
          등기 시점의 주택 수(4주택)가 아닌 <strong>2023년 권리취득일 기준 2주택</strong>으로 산정.
        </div>
        <p className="text-xs text-muted-foreground">
          1세대 내에서 동일 분양권을 매매·교환·증여로 취득한 날이 둘 이상이면 <strong>가장 빠른 날</strong>을 기준일로 사용.
        </p>
      </div>
    </section>
  );
}
