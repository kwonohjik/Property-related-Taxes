/**
 * 폼 3-state → 엔진 가산세 입력 (④ 지점) — 상속·증여 **공용** (🔴 G-07 B1)
 *
 * ## 왜 공용인가
 *
 * 상속과 증여는 **3-state 의 표현이 다르다** — 증여는 `filingStatus` 단일 필드, 상속은
 * `isFiledOnTime`+`isUnfiled` 두 불린(§21① 단서 일괄공제 축이 이미 그 조합에 걸려 있어
 * 이름을 바꿀 수 없다). 그러나 **거기서 파생하는 규칙은 완전히 같다**:
 *
 * · `on_time` + 과소신고 아님 → 키 없음 (종전 payload 보존)
 * · `on_time` + 과소신고     → §47의3 축 (당초 신고세액 · §47의3④1호 적용제외)
 * · `late`                    → §47의2 + §48②2호 감면 (법정신고기한 필요)
 * · `none`                    → §47의2 (감면 없음 — 기한후신고가 아니다)
 *
 * 호출부는 **3-state 와 법정신고기한만** 넘긴다. 기한 파생은 세목마다 다르므로
 * (상속 §67①·§67④ / 증여 §68①) 이 파일이 하지 않는다.
 *
 * ## ⚠️ 이 파일의 존재 이유는 stale 누출 차단이다
 *
 * 3-state 를 바꿔도 앞서 입력한 「당초 신고세액」·「기한후신고일」이 payload 로 새면
 * 가산세 base·감면율이 **조용히** 움직인다(부동산 G-10이 정확히 이 누출이었다 —
 * 당초 신고세액 1억이 남아 base 가 1억 줄었다). 대상 밖 값은 여기서 **보내지 않는다**.
 * 게이트를 세목마다 복제하면 B2(부정행위)·B3(납부지연)가 양쪽을 건드릴 때 드리프트한다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type {
  InheritanceGiftFilingStatus,
  InheritanceGiftPenaltyInput,
  UnderReportExclusion,
} from "@/lib/tax-engine/inheritance-gift-penalty";
import type { PenaltyReason } from "@/lib/tax-engine/transfer-tax-penalty";

/** 3-state 아래에 달리는 하위 입력 4칸 — 상속·증여 폼이 같은 이름으로 갖는다 */
export interface FilingPenaltyFormFields {
  /** 기한후신고일 — §48②2호 감면 구간 판정 (`late`에서만 의미) */
  lateFilingDate: string;
  /** 「결정할 것을 미리 알고」 제출 — §48②2호 괄호 배제 (`late`에서만 의미) */
  priorAssessmentNotified: boolean;
  /** 과소신고 여부 (`on_time`에서만 의미) */
  isUnderReported: boolean;
  /** 당초 신고세액 — §47의3① 「과소신고한 납부세액」 산정 base */
  originalFiledTax: string;
  /** §47의3④1호 적용제외 사유 — 있으면 과소신고가산세 0 */
  underReportExclusion: UnderReportExclusion | "";
  /** 부정행위 유형 — §47의2①1호 40%(역외 60%) · §47의3①1호 가목 (🔴 B2) */
  penaltyReason: PenaltyReason;
  /** 부정행위로 인한 과소신고분 — §47의3①1호 가목 base. 빈 칸이면 전액 부정 (🔴 B2) */
  fraudulentPortion: string;
  /** 라목 단서 — 법인세 경정이 부정행위에 기인했는가 (🔴 B2) */
  corporateAdjustmentByFraud: boolean;
}

/**
 * @param status 폼 3-state (상속은 `isFiledOnTime`+`isUnfiled` 조합에서 호출부가 파생)
 * @param fields 하위 입력 4칸
 * @param statutoryDeadline 법정신고기한 `YYYY-MM-DD` — 상속 §67①·§67④ / 증여 §68①.
 *        `late`에서만 쓰인다. 없으면 감면 구간 판정이 서지 않아 감면율 0이 된다.
 */
export function buildFilingPenaltyInput(
  status: InheritanceGiftFilingStatus,
  fields: FilingPenaltyFormFields,
  statutoryDeadline?: string,
): { filingPenalty?: InheritanceGiftPenaltyInput } {
  if (status === "on_time") {
    // 과소신고가 아니면 **키 자체를 넣지 않는다** — 종전 payload 를 그대로 보존한다.
    if (!fields.isUnderReported) return {};
    return {
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        // 🔑 「미입력」과 「0원 신고」는 **다른 사실**이다 — 빈 칸을 0으로 접으면 ⑧이
        //    미입력을 잡을 수 없고(0은 유효값), §47의3① base 가 결정세액 전액이 되어
        //    조용히 과대 산출된다. 빈 칸은 키를 넣지 않는다.
        ...(fields.originalFiledTax.trim()
          ? { originalFiledTax: parseAmount(fields.originalFiledTax) }
          : {}),
        ...(fields.underReportExclusion
          ? { underReportExclusion: fields.underReportExclusion }
          : {}),
        // 🔴 B2 — 부정행위 축. `normal` 은 엔진 기본값이라 키를 넣지 않는다.
        ...(fields.penaltyReason !== "normal"
          ? { penaltyReason: fields.penaltyReason }
          : {}),
        // 🔑 「미입력」과 「0원」은 다른 사실이다 — 빈 칸이면 키를 넣지 않아야
        //    엔진의 「미입력 = 전액 부정」 하위 호환이 살고, 0 은 「부정행위분 없음」이
        //    되어 나목 10%가 전액에 붙는다. 일반(`normal`)이면 분해 자체가 없다.
        ...(fields.penaltyReason !== "normal" && fields.fraudulentPortion.trim()
          ? { fraudulentPortion: parseAmount(fields.fraudulentPortion) }
          : {}),
        // 라목 단서는 **라목을 골랐을 때만** 의미가 있다 — 다른 목에서 새면
        // 화면에 없는 값이 판정을 움직인다(G-10 형태의 stale 누출).
        ...(fields.underReportExclusion === "corporate_adjustment" &&
        fields.corporateAdjustmentByFraud
          ? { corporateAdjustmentByFraud: true }
          : {}),
      },
    };
  }

  if (status === "late") {
    return {
      filingPenalty: {
        filingStatus: "late",
        ...(statutoryDeadline ? { statutoryDeadline } : {}),
        ...(fields.lateFilingDate ? { actualFilingDate: fields.lateFilingDate } : {}),
        ...(fields.priorAssessmentNotified ? { priorAssessmentNotified: true } : {}),
        // 🔴 B2 — 기한후신고여도 「법정신고기한까지 신고하지 아니한」 사실은 그대로라
        // §47의2①**1호**(부정 40%·역외 60%)가 적용된다. §48②2호 감면도 §47의2 가산세
        // 전체가 대상이므로 40%·60%에 그대로 걸린다.
        ...(fields.penaltyReason !== "normal"
          ? { penaltyReason: fields.penaltyReason }
          : {}),
      },
    };
  }

  // 무신고 — §48②2호는 「기한후신고서를 제출한 경우」가 요건이라 감면 대상이 아니다.
  return {
    filingPenalty: {
      filingStatus: "none",
      // 🔴 B2 — §47의2①1호 부정 40%·역외 60%. 무신고에는 가목·나목 분해가 없다.
      ...(fields.penaltyReason !== "normal" ? { penaltyReason: fields.penaltyReason } : {}),
    },
  };
}
