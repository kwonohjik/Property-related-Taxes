"use client";

/**
 * RedevelopmentRightExemptionSection — 1세대1입주권 비과세 카드 (사례 36)
 *
 * assetKind="right_to_move_in" && redevSubject="right" 시 진입.
 * §89①4호 가목 비과세 요건 자기선언 + C-1 안전장치 3종.
 *
 * 구조:
 *  §0-A  sky:    입주권 양도 안내 카드 (LTHD 대상 인가전 차익만)
 *  §⑥    violet: 1세대1입주권 비과세 카드
 *    ├── ToggleCard (redevExemptionEligibleAtApproval 기존 필드 재사용)
 *    ├── 보유·거주 월수 입력 (DecimalInput — 월수, 정수)
 *    ├── 12억 초과 자동 안내 (transferPrice > 12억 + 토글 ON 시)
 *    ├── (a) useMemo 자동 검증 → (b) rose 경고 카드 조건부 노출
 *    └── (c) 면책 문구 (토글 ON 시만)
 *
 * 정책:
 *  - DecimalInput 사용 (월수는 CurrencyInput 부적합 — feedback_decimal_input)
 *  - useEffect → store 미러링 금지 (모든 계산은 useMemo)
 *  - 자동 안분 fallback 금지 (미입력 시 validate 차단)
 *  - OFF 시에도 violet tone 배경 유지 (feedback_toggle_card_visibility)
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /**
   * 폼-전역 wasRegulatedAtAcquisition — 조정대상지역 취득 여부.
   * C-1 (a) 거주요건 경고 가드에서 사용 (§89①3호 가목 단서).
   */
  wasRegulatedAtAcquisition?: boolean;
  /** 양도가액 — 12억 초과 자동 안내용. Step1에서 전달 */
  transferPrice?: string;
}

const HIGH_VALUE_THRESHOLD = 1_200_000_000;

export function RedevelopmentRightExemptionSection({
  asset,
  onChange,
  wasRegulatedAtAcquisition = false,
  transferPrice,
}: Props) {
  const isRightSubject =
    asset.assetKind === "right_to_move_in" && (asset.redevSubject === "right" || !asset.redevSubject);

  // ── C-1 (a) 자동 검증 useMemo ──
  const warningState = useMemo(() => {
    if (!isRightSubject) return null;
    // 경고는 **자기선언을 검증**하는 것이므로 선언(토글 ON = `"yes"`)이 전제다.
    // 종전 조건은 `"yes"`에 더해 빈값도 포함했으나, 그때는 토글 OFF가 `"no"`를 기록해
    // 빈값 = "아직 토글을 건드리지 않음"이었고 월수 입력칸(토글 children)도 열린 적이
    // 없어 `> 0` 경고가 발동할 수 없었다 — 실질 무의미한 가지였다.
    // 이제 OFF가 빈값을 기록하므로(:134 주석) 빈값을 남겨두면 **토글을 끈 뒤에도
    // 경고 카드가 남는다**. 빈값을 제외해 종전의 "OFF면 경고 없음" 동작을 보존한다.
    if (asset.redevExemptionEligibleAtApproval !== "yes") return null;

    const holdingMonths = parseDecimal(asset.redevPriorHouseHoldingMonths);
    const residenceMonths = parseDecimal(asset.redevPriorHouseResidenceMonths);

    const holdingWarning = holdingMonths > 0 && holdingMonths < 24;
    const residenceWarning =
      wasRegulatedAtAcquisition && residenceMonths > 0 && residenceMonths < 24;

    if (!holdingWarning && !residenceWarning) return null;
    return { holdingWarning, residenceWarning };
  }, [
    isRightSubject,
    asset.redevExemptionEligibleAtApproval,
    asset.redevPriorHouseHoldingMonths,
    asset.redevPriorHouseResidenceMonths,
    wasRegulatedAtAcquisition,
  ]);

  // ── 12억 초과 안내 ──
  const isHighValue = useMemo(() => {
    const tp = parseAmount(transferPrice ?? "");
    return tp > HIGH_VALUE_THRESHOLD;
  }, [transferPrice]);

  const isToggleOn = asset.redevExemptionEligibleAtApproval === "yes";

  // 가시성: subject="right" 전용 섹션
  if (!isRightSubject) return null;

  return (
    <div className="space-y-3">
      {/* §0-A sky 안내 카드 — 입주권 양도 LTHD 구조 */}
      <div className="rounded-md bg-sky-50 border border-sky-200 p-3 text-caption text-sky-900 leading-relaxed">
        <p className="font-semibold mb-0.5">관리처분 인가 후 조합원입주권 양도 — 과세 구조 안내</p>
        <p>
          인가전 양도차익만 장기보유특별공제(LTHD) 대상입니다 (§95② 단서 + §94①2호). 인가후 분 및 청산금 분 양도차익에는 LTHD가 적용되지 않습니다.
        </p>
        <p className="mt-1">
          1세대1입주권 비과세 요건(§89①4호 가목)은 아래 카드에서 확인하세요. 비과세 적용 시 전액 비과세이며, 양도가액이 12억을 초과하면 초과분만 과세됩니다.
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §95 ②" label="§95② 단서" />
          <LawArticleModal legalBasis="소득세법 §94 ① 2호" label="§94①2호" />
          <LawArticleModal legalBasis="소득세법 §89 ① 4호" label="§89①4호 가목" />
        </div>
      </div>

      {/* §⑥ violet: 1세대1입주권 비과세 카드 */}
      <ToneCard tone="violet" sectionNum="⑥" bodyClassName="space-y-3" title="1세대1입주권 비과세 요건 (§89①4호 가목)" noDark>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §89 ① 4호" label="§89①4호 가목" />
          <LawArticleModal legalBasis="소득세법 §89 ① 3호" label="§89①3호 가목" />
          <LawArticleModal legalBasis="소득세법 시행령 §154" label="시행령 §154" />
        </div>

        {/* ⚠️ OFF는 `""`(자동 판정)다 — `"no"`가 아니다.
            이 필드는 3-state(`"" | "yes" | "no"`)이고 세 값이 엔진에서 각각 다른 뜻이다.
            `"no"`는 `redevelopment-lthd.ts:119-122`에서 `isOneHouseSingle`을 강제 false로
            내려 LTHD 표2(최대 80%)를 표1(최대 30%)로 강등하지만 `""`는 강등하지 않는다.
            토글은 2-state라 `""`와 `"no"`를 똑같이 OFF로 표시하므로, OFF에 `"no"`를 쓰면
            **같은 화면 상태에서 세액이 갈린다**(실측 +30,800,000원 — anchor 참조).
            §89①4호 가목 자기선언의 OFF는 "선언하지 않음"이지 인가일 기준 미충족의 적극적
            선언이 아니다 → 불리 적용의 법 근거가 없다.
            `"no"` 입력은 3-state를 온전히 표현하는 `ExemptionAtApprovalCard`의
            RadioCardGroup(`RedevelopmentBlock.tsx:598`)이 담당한다.
            anchor: `__tests__/components/redev-exemption-toggle-tri-state.anchor.test.tsx` */}
        <ToggleCard
          tone="violet"
          checked={isToggleOn}
          onCheckedChange={(v) =>
            onChange({ redevExemptionEligibleAtApproval: v ? "yes" : "" })
          }
          title="인가일 현재 §89①3호 가목 요건 충족 (자기선언)"
          description="양도일 현재 1세대1입주권 + 인가일 기준 종전주택 보유 2년 이상 (조정대상지역 취득 시 거주 2년 이상)"
        >
          <div className="space-y-3 pt-1">
            <FieldCard
              label="인가일 기준 종전주택 보유 월수"
              hint="관리처분계획인가일 기준으로 종전주택을 보유한 기간 (개월 단위 정수). §89①3호 가목 보유 2년(24개월) 이상 요건."
            >
              <DecimalInput
                value={asset.redevPriorHouseHoldingMonths}
                onChange={(v) => onChange({ redevPriorHouseHoldingMonths: v })}
                placeholder="인가일까지 보유 개월 수"
              />
            </FieldCard>

            <FieldCard
              label="인가일 기준 종전주택 거주 월수"
              hint="관리처분계획인가일 기준으로 종전주택에 거주한 기간 (개월 단위 정수). 조정대상지역 취득 시 거주 2년(24개월) 이상 요건."
            >
              <DecimalInput
                value={asset.redevPriorHouseResidenceMonths}
                onChange={(v) => onChange({ redevPriorHouseResidenceMonths: v })}
                placeholder="인가일까지 거주 개월 수"
              />
            </FieldCard>

            {/* Step3 보유 상황 안내 링크 */}
            <div className="rounded-md border border-violet-200 bg-violet-100/50 p-2.5 text-caption text-violet-900 leading-relaxed">
              <p className="font-semibold">Step 2 보유 상황 입력 필요</p>
              <p className="mt-0.5">
                §89①4호 가목 본문: 양도일 현재 다른 주택 없음 + 1입주권만 보유.
                <br />
                → &ldquo;보유 상황&rdquo; 단계에서 <span className="font-semibold">세대 보유 주택 수 = 0채</span> 및{" "}
                <span className="font-semibold">세대 보유 입주권 수 = 1개(양도 대상 포함)</span>를 입력하세요.
                <br />
                양도하는 입주권 자체도 카운트에 <span className="font-semibold">포함</span>됩니다.
              </p>
            </div>

            {/* 12억 초과 자동 안내 */}
            {isHighValue && (
              <div className="rounded-md border border-violet-300 bg-violet-100/70 p-2.5 text-caption text-violet-900">
                <p className="font-semibold">양도가액 12억 초과 → §89①4호 가목 단서 안분과세 적용</p>
                <p className="mt-0.5">
                  비과세 요건 충족 시 전액 비과세가 아닌 12억 초과분에 대해 과세됩니다 (§95③ + 시행령 §160 준용).
                  안분 상세는 결과 화면에서 확인하세요.
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <LawArticleModal legalBasis="소득세법 §95 ③" label="§95③" />
                  <LawArticleModal legalBasis="소득세법 시행령 §160" label="시행령 §160" />
                </div>
              </div>
            )}

            {/* C-1 (c) 면책 문구 — 토글 ON 시만 노출 */}
            <p className="text-micro text-muted-foreground leading-relaxed">
              본 토글은 사용자 자기선언이며 인가일 기준 보유·거주요건 충족 여부는 §89①3호 가목·시행령 §154에 따라
              별도 세무서 판단이 적용될 수 있습니다. 본 계산기 결과는 세무대리·세무서 확인을 대체하지 않습니다.
            </p>
          </div>
        </ToggleCard>

        {/* C-1 (b) rose 경고 카드 — 조건부 노출 (차단 아님, 자기선언 우선) */}
        {warningState && (
          <div className="rounded-md border border-rose-300 bg-rose-50/70 p-2.5 text-caption text-rose-900 space-y-1">
            <p className="font-semibold">⚠️ 비과세 요건 미충족 가능성</p>
            {warningState.holdingWarning && (
              <p>
                · 보유 월수 {asset.redevPriorHouseHoldingMonths}개월 — §89①3호 가목 보유 24개월 미만.
                비과세 적용 시 사후 가산세(국세기본법 §47의2~5 무신고·과소신고 가산세) 리스크가 있습니다.
              </p>
            )}
            {warningState.residenceWarning && (
              <p>
                · 거주 월수 {asset.redevPriorHouseResidenceMonths}개월 — 조정대상지역 취득으로 거주 24개월 미만.
                거주 요건 미충족 시 비과세 불인정될 수 있습니다.
              </p>
            )}
            <p className="text-rose-700 text-micro">
              ※ 차단 아님 — 토글 ON 유지 가능. 자기선언 우선. 세무 전문가 확인 권장.
            </p>
          </div>
        )}
      </ToneCard>
    </div>
  );
}
