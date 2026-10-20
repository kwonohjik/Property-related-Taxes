/** N7(P3 A) — 이월과세 토지의 취득일 칸 읽기 전용 안내. 매매(날짜 2열)·신축(블록) 호스트 공용 — 같은 문장이 두 벌 생기지 않게 한 곳에 둔다. */
export function LandCarryoverDateNote() {
  return (
    <p className="text-caption text-muted-foreground" data-testid="land-carryover-date-note">
      토지 취득일은 위 이월과세 정보의 증여 등기접수일입니다(이월과세 토지는 증여받은 날 취득, 보유기간·장기보유특별공제는 증여자 취득일부터).
    </p>
  );
}
