/** §13 세대 별도 인정 4종 상세 가이드 (v4 V3 — 미성년 예외 강조) */
export function SeparateHouseholdGuideSection() {
  return (
    <section id="separate-household-guide" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">13. 세대 별도 인정 4종 상세 가이드 (§28의3②)</h2>
      <p className="text-sm text-muted-foreground">
        아래 4종에 해당하면 동일 주소의 가족이라도 별도 세대로 인정 → 각자 주택 수를 독립 산정.
      </p>

      <div className="space-y-3">
        {/* 1호 */}
        <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
          <h3 className="text-sm font-semibold text-violet-700 mb-1">1호 — 30세 미만 소득 충족 자녀</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• 연간 소득 ≥ <strong>기준중위소득 40%</strong> (2025년 기준 약 월 94만원)</li>
            <li>• 독립적인 생계 유지</li>
            <li>• <strong>미성년자(만 19세 미만) 제외</strong> — 소득 충족해도 별도 세대 불인정</li>
          </ul>
          <div className="rounded bg-destructive/10 p-2 text-xs text-destructive mt-2">
            <strong>⚠ 미성년 자녀</strong>: 소득이 있더라도 만 19세 미만이면 별도 세대 인정 불가 (§28의3② 1호 단서)
          </div>
        </div>

        {/* 2호 */}
        <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
          <h3 className="text-sm font-semibold text-violet-700 mb-1">2호 — 65세 이상 직계존속 동거봉양 합가</h3>
          <p className="text-xs text-muted-foreground">
            65세 이상 부모·조부모와 동거봉양 목적으로 합가한 경우.
            세대 합가 전 각자 1주택 보유 시 일시적 2주택 특례와 연계 가능.
          </p>
        </div>

        {/* 3호 */}
        <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
          <h3 className="text-sm font-semibold text-violet-700 mb-1">3호 — 90일 이상 해외 출국</h3>
          <p className="text-xs text-muted-foreground">
            취득일 기준으로 90일 이상 해외 출국 상태인 가족 구성원.
            해외 체류 기간은 연속·누적 기간 합산.
          </p>
        </div>

        {/* 4호 */}
        <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
          <h3 className="text-sm font-semibold text-violet-700 mb-1">4호 — 취득 후 60일 이내 주소 분리</h3>
          <p className="text-xs text-muted-foreground">
            주택 취득 후 60일 이내에 실제 독립 주소 이전 + 독립 생계 유지.
            단순 전입신고 이동만으로는 불충분 — 실질적 독립이 요건.
          </p>
        </div>
      </div>

      <div className="rounded-md bg-muted/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
        <p><strong>판정 시점</strong>: 취득일(잔금일) 현재 기준으로 별도 세대 여부 판단.</p>
        <p><strong>중요</strong>: 별도 세대 인정은 각자의 주택이 분리 카운트됨을 의미.
        별도 세대의 주택이 많으면 오히려 다주택 중과 리스크가 개인에게 집중될 수 있음.</p>
      </div>
    </section>
  );
}
