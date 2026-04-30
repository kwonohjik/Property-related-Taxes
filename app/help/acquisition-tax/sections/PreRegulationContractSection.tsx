/** §11 조정대상지역 지정 전 계약 보호 (§13의2④) */
export function PreRegulationContractSection() {
  return (
    <section id="pre-regulation-contract" className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">11. 지정 전 계약 보호 (§13의2④)</h2>
      <p className="text-sm text-muted-foreground">
        조정대상지역 지정고시일 <strong>이전에 매매계약을 체결</strong>한 경우
        지정 전 취득으로 간주하여 다주택 중과 미적용.
      </p>

      <div className="space-y-3">
        <div className="rounded-md border border-rose-200 bg-rose-50/40 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-rose-700">적용 요건 (모두 충족)</h3>
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
            <li>매매계약(공동주택 분양계약 포함)을 <strong>조정대상지역 지정고시일 이전</strong>에 체결</li>
            <li>계약금 지급 사실을 <strong>증빙서류로 입증</strong> (계약서 + 계좌이체 내역 등)</li>
          </ol>
        </div>

        <div className="rounded-md border border-border p-3 space-y-2">
          <h3 className="text-sm font-semibold">적용 효과</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• 잔금 시점에 조정지역이어도 <strong>비조정지역 취득으로 간주</strong></li>
            <li>• 다주택 중과 조정지역 분기 미적용 → 비조정지역 기준 주택 수 산정</li>
            <li>• 예) 3주택 + 조정지역 → 일반 시 12%, 단서 적용 시 <strong>비조정 3주택 8%</strong></li>
          </ul>
        </div>

        <div className="rounded-md bg-amber-50/60 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
          <p><strong>입증 서류</strong>: 매매계약서(지정고시일 이전 날짜 기재) + 계약금 입금 확인 서류 필수.</p>
          <p>단순 계약서만으로는 불인정 — 계약금 납부 증빙이 반드시 함께 필요.</p>
          <p><strong>대상 계약</strong>: 매매계약 + 공동주택 분양계약 포함. 증여·상속은 해당 없음.</p>
        </div>
      </div>
    </section>
  );
}
