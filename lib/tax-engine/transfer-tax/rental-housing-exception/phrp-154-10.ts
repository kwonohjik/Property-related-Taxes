/**
 * §154⑩ 표준 경로(I-5) 요건 판정 — `eligibility.ts`에서 분리(파일 크기 정책 · 동작은 §154① 단서 반영분만 바뀜).
 * 경로 개요·보유 재기산 없음·거주기간 취득 시기 분기의 근거는 `eligibility.ts` 상단 주석.
 */
import { isPreLifetimeLimitRegime } from "../../data/rental-155-20-era";
import type { EligibilityContext } from "./eligibility";

const validDate = (d: Date | undefined): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

/**
 * §154⑩ 표준 경로(I-5) — 공동보유 장기임대주택이 0호인 시나리오 B의 요건 판정.
 *
 * 1호: 「민간임대주택에 관한 특별법」 §5에 따라 임대주택으로 등록하거나 「영유아보육법」 §12·§13에
 *   따른 어린이집으로 설치·운영된 사실이 있을 것 (`wasRegisteredRentalOrChildcare`).
 * 2호: 해당 주택이 §155⑳ 후단의 직전거주주택보유주택일 것 — `priorResidenceTransferDate` 입력으로 확인.
 *
 * **보유기간**: 실제 취득일부터 2년 이상(재기산 없음 — 파일 상단 주석). `residenceHoldYears`는
 * 호출부(`checkEligibility`)가 넘기는 일반 경로와 **같은 값**이다.
 *
 * **거주기간**: 취득 시기로 갈린다(파일 상단 주석 — 서면-2023-법규재산-0426 등).
 *   - 2019-02-12 이후 취득(경과조치 제외): §155⑳1호 괄호 준용 — `postRegistrationResidenceMonths`
 *     (등록일 이후 거주, 지역 불문) 2년 이상.
 *   - 2019-02-12 전 취득(또는 경과조치): §154① 원칙 — `residenceLiveYears`(일반 거주기간)가
 *     취득 당시 조정대상지역인 경우에만 2년 이상.
 *
 * **§154① 단서**(V-R3 (a)): §154⑩은 「1주택을 보유한 것으로 보아 제1항을 적용」하므로 성립한 단서(`ctx.provisoWaiver`)가
 *   문언대로 걸린다 — 1호~3호(`both`)는 보유 2년과 종전규정 거주 2년(§154① 원칙)을, 5호·삭제 전 4호(`residence_only`)는
 *   종전규정 거주만 푼다. 신규정 거주(§155⑳1호 괄호 준용)는 ⑳ 자체 요건의 준용이라 풀지 않는다(부동산납세과-67과 같은 축).
 *
 * 실패 사유를 `residenceFailReasons`에 직접 push한다(부수효과) — 호출부(`checkEligibility`)의
 * 배열을 그대로 받는다. 단서가 결론을 가르면(다른 불충족 없음) 확인 필요 고지를 달고 근거 표기를 돌려준다.
 */
export function checkPhrp154_10Eligibility(
  ctx: EligibilityContext,
  residenceHoldYears: number,
  residenceLiveYears: number,
  winWinResidenceExempt: boolean,
  residenceFailReasons: string[],
  notices: string[],
): string | undefined {
  const waiver = ctx.provisoWaiver;
  /** 단서가 푼 요건 — 결론을 가를 때만 고지한다 */
  const waived: string[] = [];
  if (ctx.wasRegisteredRentalOrChildcare !== true) {
    residenceFailReasons.push(
      "이 주택이 「민간임대주택에 관한 특별법」 §5에 따라 임대주택으로 등록되거나 「영유아보육법」 §12·§13에 따른 어린이집으로 설치·운영된 사실이 확인되지 않습니다 (소령 §154⑩1호).",
    );
  }
  if (!validDate(ctx.priorResidenceTransferDate)) {
    residenceFailReasons.push(
      "직전거주주택 양도일이 입력되지 않아 소령 §154⑩2호(직전거주주택보유주택) 요건을 판정할 수 없습니다.",
    );
  }

  // 보유기간 2년 — 실제 취득일부터(소령 §154⑤ → 법 §95④). 재기산하지 않는다(파일 상단 주석).
  if (residenceHoldYears < 2 && waiver?.kind === "both") {
    waived.push("보유기간");
  } else if (residenceHoldYears < 2) {
    residenceFailReasons.push(
      `거주주택 보유기간 2년 미충족 (현재: ${residenceHoldYears}년, 소령 §154⑤·법 §95④)`,
    );
  }

  // 거주기간 — 취득 시기별 분기
  // 경과조치는 사유까지 받아야 종전규정이다(결정 #21 S16-5) — §155⑳ A·B와 같은 leaf `isAddendumTransitionEffective`.
  const transitionClaimed = ctx.residenceTransitionUnderAddendum === true;
  const preRegime = isPreLifetimeLimitRegime(
    ctx.residenceAcquisitionDate,
    transitionClaimed,
    ctx.residenceTransitionBasis,
  );
  if (preRegime) {
    // 「종전규정」 — §154① 원칙: 취득 당시 조정대상지역인 경우에만 거주 2년(일반 거주기간)
    if (ctx.wasRegulatedAtAcquisition === true && residenceLiveYears < 2 && !winWinResidenceExempt && waiver) {
      waived.push("거주기간");
    } else if (ctx.wasRegulatedAtAcquisition === true && residenceLiveYears < 2 && !winWinResidenceExempt) {
      residenceFailReasons.push(
        `거주주택 거주기간 2년 미충족 (현재: ${residenceLiveYears}년, 소령 §154① — 2019.2.12 전 취득)`,
      );
    }
  } else if (!winWinResidenceExempt) {
    // §155⑳1호 괄호 준용 — 등록일(또는 어린이집 인가일) 이후 거주기간, 지역 불문
    const m = ctx.postRegistrationResidenceMonths;
    if (m == null) {
      residenceFailReasons.push(
        "직전거주주택보유주택 — 사업자등록·임대사업자 등록 또는 어린이집 인가일 이후 거주기간을 입력하지 않아 거주요건(2년)을 판정할 수 없습니다 (소령 §155⑳1호 괄호 준용).",
      );
    } else if (Math.floor(m / 12) < 2) {
      residenceFailReasons.push(
        `거주주택 거주기간(등록일 이후) 2년 미충족 (현재: ${Math.floor(m / 12)}년 ${m % 12}개월, 소령 §155⑳1호 괄호 준용)`,
      );
    }
    /**
     * 경과조치를 선언했는데 사유가 종전규정을 주지 않아(계약금 지급·그 전 등록 임대주택 없음, 또는 사유 미입력) 신규정 거주요건으로
     * 판정했고, **그것이 결론을 가를 때만**(다른 불충족 없음 · 종전규정이면 거주요건을 충족) 확인 필요를 고지한다.
     * 문구는 화면 중립이다(판정 메뉴·부담부증여 모두 같은 사유 칸이 있다). 근거 한계를 함께 적는다 — §154⑩ 직접 해석 없음.
     */
    const onlyThisFailure = residenceFailReasons.length === 1;
    const wouldPassUnderPrior = !(ctx.wasRegulatedAtAcquisition === true && residenceLiveYears < 2 && !waiver);
    // (이 분기는 `!winWinResidenceExempt`일 때만 도달한다 — 상생임대 면제는 위 else-if가 이미 걸렀다.)
    if (transitionClaimed && onlyThisFailure && wouldPassUnderPrior) {
      notices.push(
        "2019.2.12 부칙 경과조치(대통령령 제29523호 부칙 제7조②)가 종전 규정을 주는 사유(당시 거주 · 그 전 계약금 지급과 2019.2.12 전 등록 임대주택 소유)가 " +
          "확인되지 않아 종전 규정을 적용하지 않았습니다 — 등록일 이후 거주기간 2년을 요건으로 판정했습니다(소령 §155⑳1호 괄호 준용). " +
          "이 판단은 §155⑳ 거주주택 양도 사안의 해석(서면-2020-법령해석재산-1464 · 서면-2021-법규재산-4760)을 같은 부칙 문장에 적용한 것이며 " +
          "§154⑩ 경로를 직접 다룬 해석은 확인되지 않았습니다(확인 필요).",
      );
    }
  }

  if (!waiver || waived.length === 0 || residenceFailReasons.length > 0) return undefined;
  notices.push(
    `거주주택 ${waived.join("·")}이 2년 미만이지만 ${waiver.label} 사유로 그 제한을 적용하지 않았습니다 — 소령 §154⑩은 ` +
      "「제1항을 적용」하므로 §154① 단서를 문언대로 적용했습니다. §154⑩ 경로에 §154① 단서를 적용한 정면 해석례가 없어 확인이 필요합니다.",
  );
  return waiver.label;
}
