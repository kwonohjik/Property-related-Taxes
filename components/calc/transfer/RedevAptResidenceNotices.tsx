/**
 * Step4 ② 「1세대1주택 비과세 판정」 — 재개발 완공APT 거주기간 안내 2종 (2026-09-26 · OH-48 · OH-50).
 *
 * Step4.tsx 800줄 정책으로 분리했다. 렌더 조건은 호출부가 공용 술어(`redev-field-scope.ts`)로 정한다.
 */

/** OH-48 — 재개발 카드의 분리 입력이 §154① 거주기간을 대신할 때 Step4 거주 입력 대신 띄운다. */
export function RedevSplitResidenceNotice({ isSuccessor }: { isSuccessor: boolean }) {
  return (
    <div
      data-testid="redev-split-residence-notice"
      className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2 text-xs text-violet-900"
    >
      <p className="font-medium">거주기간은 ① 재개발 카드의 거주기간 입력을 사용합니다</p>
      <p className="mt-0.5 text-caption leading-relaxed text-violet-800">
        {isSuccessor
          ? "승계조합원은 준공일 이후 신축주택 거주기간만 1세대1주택 비과세 거주요건과 장기보유특별공제 표2에 함께 쓰입니다 (시행령 §162①4호 · 서면-2019-부동산-4508)."
          : "종전주택과 신축주택 거주기간을 통산한 값이 1세대1주택 비과세 거주요건과 장기보유특별공제 표2에 함께 쓰입니다 (시행령 §154⑧1호)."}
      </p>
    </div>
  );
}

/**
 * OH-50 — 승계조합원은 준공일부터 보유기간이라 그 전(멸실 전 종전주택) 거주는 산입하지 않는다.
 * 구간 입력은 ⑧이 준공일과 비교해 막고, 개월 수 직접 입력은 날짜가 없어 안내로만 처리한다.
 */
export function SuccessorResidenceDirectHint({ completionDate }: { completionDate: string }) {
  return (
    <div
      data-testid="successor-residence-direct-hint"
      className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-900"
    >
      <p className="font-medium">⚠️ 준공일({completionDate}) 이후의 거주기간만 입력하세요</p>
      <p className="mt-0.5 text-caption leading-relaxed text-amber-800">
        승계조합원의 신축주택 보유기간은 준공일(사용승인서 교부일)부터 계산하며, 멸실 전 종전주택
        거주기간은 통산하지 않습니다 (시행령 §162①4호 · 서면-2019-부동산-4508).
      </p>
    </div>
  );
}
