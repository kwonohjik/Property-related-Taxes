"use client";

/**
 * HouseEntryUnavoidableOutsideCapitalBlock — §155⑧ 수도권 밖 부득이 주택 (D-6 4)
 *
 * ## 법문 (법제처 실독 2026-09-21 · MST 286211)
 *
 * > ⑧ 재정경제부령으로 정하는 **취학, 근무상의 형편, 질병의 요양, 그 밖에 부득이한 사유**로
 * >   취득한 **수도권 밖에 소재하는 주택**과 그 밖의 주택(일반주택)을 국내에 **각각 1개씩**
 * >   소유하고 있는 1세대가 부득이한 사유가 **해소된 날부터 3년 이내**에 일반주택을 양도하는
 * >   경우에는 국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다.
 *
 * ## ⛔ ④의 「부득이한 사유」와 **다른 조문**이다
 *
 * | | ④ `isUnavoidableReason` | 이 카드 |
 * |---|---|---|
 * | 조문 | 영 §167의10①**3호** | §155⑧ = 영 §167의10①**4호** |
 * | 축 | 중과 배제 전용 | **비과세 + 중과 배제** |
 * | 기준시가 | 취득 당시 **3억 이하** | 요건 **없음** |
 * | 거주 | **1년 이상** | 요건 **없음** |
 * | 소재 | 제한 없음 | **수도권 밖** |
 *
 * 엔진에서 **4호가 3호보다 먼저 early-return** 한다
 * (`multi-house-surcharge-exclusion.ts:547` vs `:567`). 두 토글을 합치면 3호의 좁은 요건이
 * 4호에 붙어 조용히 특례가 죽는다([[feedback_one_field_serving_two_legal_axes]]).
 *
 * ## 🔑 이 한 선언이 두 축을 움직인다
 *
 * 비과세(`qualifiesUnavoidableOutsideCapital`)와 중과 배제가 **같은 값**을 쓴다
 * (`transfer-tax-judgment-steps.ts:55`가 술어 결과를 중과 엔진에 주입). 그래서 §155⑧은
 * **비과세를 주장할 수 없는 세대**에도 입력 경로가 필요하다(P6-b 실측 −6.46억).
 */

import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { isCapitalAreaByRegionCode } from "@/lib/geo/rural-house-location";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
}

export function HouseEntryUnavoidableOutsideCapitalBlock({ house, onUpdate }: Props) {
  const on = house.oneHouseUnavoidableOutsideCapital === true;
  /**
   * 「수도권 밖」 요건 — 행 주소로 **판정만** 한다.
   *
   * ⚠️ 게이트로 쓰지 않는다. 엔진(`qualifiesUnavoidableOutsideCapital`)은 소재를 보지 않고
   *    사용자 선언을 믿는데, 이 PR은 **순수 이관**이라 그 계약을 바꾸지 않는다.
   *    모순은 화면이 말로 밝힌다(침묵 금지).
   */
  const inCapital = isCapitalAreaByRegionCode(house.regionCode || undefined);

  return (
    <ToggleCard
      variant="card"
      tone="sky"
      data-testid="house-row-unavoidable-outside-capital"
      checked={on}
      onCheckedChange={(v) =>
        onUpdate(
          v
            ? {
                oneHouseUnavoidableOutsideCapital: true,
                unavoidableOutsideCapitalReason:
                  house.unavoidableOutsideCapitalReason ?? "work",
              }
            : {
                oneHouseUnavoidableOutsideCapital: undefined,
                unavoidableOutsideCapitalReason: undefined,
                unavoidableOutsideCapitalResolvedDate: undefined,
              },
        )
      }
      title="부득이한 사유로 취득한 수도권 밖 주택 (§155⑧)"
      description={
        // ⛔ 3호와의 구별은 **OFF일 때도 보여야** 한다 — 켤지 말지를 여기서 판단한다.
        //    ToggleCard의 children은 ON일 때만 렌더되므로 요지를 description에 둔다.
        <>
          취학·근무상 형편·질병 요양 등으로 취득한 수도권 밖 주택입니다. 이 주택을 보유한 채
          일반주택을 양도하면 1세대1주택으로 봅니다.{" "}
          <b>④ 「부득이한 사유 취득 주택」(영 §167의10①3호)과는 다른 조문</b>입니다.
        </>
      }
    >
      <div className="space-y-4">
        <div className="pt-1">
          <LawArticleModal
            legalBasis={TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL}
            label="소득세법 시행령 §155⑧"
          />
        </div>

        {/* ⛔ 3호와 혼동 방지 — 같은 「부득이한 사유」라는 말이 ④에도 있다 */}
        <ToneCard tone="amber" bodyClassName="" className="px-3 py-2">
          <p data-testid="house-row-uoc-vs-3ho" className="text-xs leading-relaxed">
            ④ 「특수 배제 사유」의 <b>부득이한 사유</b>(영 §167의10①3호)와는 <b>다른 조문</b>입니다.
            3호는 <b>취득 당시 기준시가 3억 이하 · 1년 이상 거주</b>를 요구하지만, §155⑧(4호)은
            그 요건이 <b>없고</b> 대신 <b>수도권 밖 소재</b>를 요구합니다. 둘 다 해당하면 각각 켜세요.
          </p>
        </ToneCard>

        {on && inCapital === true && (
          <ToneCard tone="rose" bodyClassName="" className="px-3 py-2">
            <p data-testid="house-row-uoc-capital-warning" className="text-xs leading-relaxed">
              이 주택의 소재지가 <b>수도권</b>으로 판정됩니다. §155⑧은 <b>수도권 밖</b> 주택에만
              적용되므로 주소를 확인하세요.
            </p>
          </ToneCard>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">부득이한 사유</label>
            <RadioCardGroup
              name={`unavoidableOutsideCapitalReason-${house.id}`}
              value={house.unavoidableOutsideCapitalReason ?? "work"}
              onChange={(v) =>
                onUpdate({
                  unavoidableOutsideCapitalReason:
                    v as HouseEntry["unavoidableOutsideCapitalReason"],
                })
              }
              options={[
                { value: "study", label: "취학" },
                { value: "work", label: "근무상 형편" },
                { value: "illness", label: "질병 요양" },
                { value: "other", label: "그 밖의 부득이한 사유" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">사유 해소일</label>
            <DateInput
              value={house.unavoidableOutsideCapitalResolvedDate ?? ""}
              onChange={(v) => onUpdate({ unavoidableOutsideCapitalResolvedDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              해소일부터 <strong>3년 이내</strong>에 일반주택을 양도해야 합니다.
              아직 해소되지 않았다면 비워 두세요 — 기한이 기산되지 않습니다.
            </p>
          </div>
        </div>
      </div>
    </ToggleCard>
  );
}
