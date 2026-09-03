/**
 * PenaltyNotIncludedNotice — 상속·증여 「가산세 미포함」 고지 (🔴 G-07 A안)
 *
 * ## 왜 필요한가
 *
 * 상속·증여 마법사는 「무신고 / 기한후신고」를 **입력받는다**
 * (`Step4Deductions.tsx` 3-state · `GiftCreditChecklist.tsx` 토글). 그런데 엔진은 그 선택으로
 * §69 신고세액공제만 제거할 뿐, 「국세기본법」 §47의2 무신고가산세·§47의4 납부지연가산세를
 * **산출하지 않는다**(`gift-tax.ts` placeholder 0 · 상속은 필드조차 없다).
 *
 * 그 상태에서 별지 제10호서식은 ㊷㊸ 칸에 「—」가 아니라 **「0」**을 인쇄했다 — 계산 결과처럼
 * 읽힌다. 증여 2.25억 무신고 사례에서 법정 가산세 4,500만원이 화면에서 0으로 보였다.
 *
 * ⇒ **금액을 모른다는 사실 자체를 화면에 남긴다.** 취득세 G-09(`AcquisitionTaxResultView`)와
 *   같은 형태다 — 배너 부재가 「더 확정적인 값」으로 읽히는 것을 막는 것이 목적이다.
 *
 * ## 🔴 B1 이후 — 범위가 좁아졌다
 *
 * 상속·증여 **양쪽 모두** §47의2·§47의3 **일반율**을 산출한다. 「전부 미포함」은 이제
 * 거짓이므로, 남은 축(**부정행위 40%·역외 60%** · **납부지연 §47의4**)만 고지한다.
 * ⚠️ B2·B3가 그 축들을 구현하면 이 배너는 **지워야 한다** — 남겨두면 반대 방향의 거짓이 된다.
 *
 * ## 조문
 *
 * 「상속세 및 증여세법」 §78①②는 **삭제**됐다(현행 §78③~⑮는 공익법인 축) — 상속·증여의
 * 신고불성실·납부지연은 「국세기본법」 §47의2·§47의3·§47의4가 유일 근거다.
 *
 * @see docs/00-pm/inheritance-gift-penalty-g07.plan.md
 */
export function PenaltyNotIncludedNotice({ taxLabel }: { taxLabel: "상속세" | "증여세" }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
      <p className="font-semibold mb-0.5">아직 포함되지 않은 가산세가 있습니다</p>
      <p className="leading-relaxed">
        이 {taxLabel} 금액에는 신고불성실가산세(국세기본법 §47의2·§47의3) <strong>일반율</strong>만
        반영돼 있습니다. <strong>부정행위 40%·역외거래 60%</strong>(§47의2①1호·§47의3①1호가목)와{" "}
        <strong>납부지연가산세</strong>(§47의4)는 아직 계산하지 않습니다. 해당하면 실제 고지세액은
        이 금액보다 큽니다.
      </p>
    </div>
  );
}
