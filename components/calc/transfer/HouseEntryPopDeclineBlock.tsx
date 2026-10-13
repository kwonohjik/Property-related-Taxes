"use client";

/**
 * HouseEntryPopDeclineBlock — 조특법 §71의2① 인구감소지역주택 (결정 #42 · S14a-4)
 *
 * 인구감소지역(또는 수도권 밖 인구감소관심지역)의 주택을 2024.1.4.~2026.12.31.에 취득한 1세대가 그 전에 보유한 주택·입주권·분양권을 양도하면
 * 그 인구감소지역주택을 **소유주택이 아닌 것으로 보아** 소득세법 §89①3호·4호를 적용한다(조특법 §71의2①).
 *
 * 🔑 **적용 여부를 고르는 칸이 없다** — 「…보아 …적용한다」는 강행 의제라 엔진이 명부에서 도출한다(토글·신고서 게이트를 만들지 않는다).
 *    이 블록은 명부에 없는 **과거 사실**만 받는다. 모르면 「모름」 — 적용하지 않고 판정하며, 결론을 가를 때 확인 필요를 알린다(원칙 1).
 * 🔑 소재지·가액은 이 행의 주소와 「취득 당시 공시가격」(④ 부득이 사유·장기임대 라목과 같은 칸 `acquisitionOfficialPrice`)을 쓴다 — 새 칸을 만들지 않는다.
 * 🔑 과세특례신고서(조특령 §68의2②③)는 요건이 아니라 **제출 안내**다.
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import { popDeclinePriorRightQuestionVisible } from "@/lib/calc/pop-decline-71-2-scope";
import { popDeclineAcquiredFromOther } from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
  /** 양도(종전) 주택 취득일 — 이 행보다 늦으면 「권리로 받은 집인가」를 묻는다 */
  sellingAcquisitionDate?: string;
}

const YNU = [
  { v: "yes", yes: "예" },
  { v: "no", yes: "아니오" },
  { v: "unknown", yes: "모름" },
] as const;

export function HouseEntryPopDeclineBlock({ house, onUpdate, sellingAcquisitionDate }: Props) {
  const showPriorRight = popDeclinePriorRightQuestionVisible(house, sellingAcquisitionDate);
  return (
    <ToneCard tone="rose" sectionNum="§71의2" bodyClassName="space-y-3" title="인구감소지역주택 — 소유주택으로 보지 않는 특례 (조특법 §71의2①)" noDark>
      <p className="text-micro text-muted-foreground" data-testid="house-row-pop-decline-intro">
        이 주택은 인구감소지역에 있고 2024.1.4.~2026.12.31.에 취득했습니다. 요건을 갖추면 <b>적용 여부를 고르지 않아도</b> 이 주택을 소유주택으로 보지 않고
        비과세를 판정합니다(보유 주택 목록의 소재지·취득일로 도출). 아래는 목록에 없는 <b>취득 당시의 사실</b>입니다 — 모르면 「모름」을 고르세요.
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">이 주택의 취득 당시 공시가격(기준시가)</label>
        <CurrencyInput
          label="취득 당시 공시가격"
          hideLabel
          value={house.acquisitionOfficialPrice ?? ""}
          onChange={(v) => onUpdate({ acquisitionOfficialPrice: v })}
          hint="취득일 현재 주택과 딸린 토지의 기준시가 합계 — 수도권 밖 인구감소지역 9억, 수도권 접경·관심지역 4억 이하(2025.8.14. 전 취득은 4억). 비우면 한도를 판단할 수 없어 적용하지 않습니다."
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">취득 당시 세대가 주택·조합원입주권·분양권 중 이 주택 외 1채(1개)만 보유했습니까</label>
        <RadioCardGroup
          name={`popDeclSole-${house.id}`}
          data-testid="house-row-pop-decline-sole"
          tone="rose"
          layout="inline"
          options={YNU.map((o) => ({ value: o.v, label: o.yes, testId: `house-row-pop-decline-sole-${o.v}` }))}
          value={house.popDeclSoleAtAcquisition ?? ""}
          onChange={(v) => onUpdate({ popDeclSoleAtAcquisition: v as HouseEntry["popDeclSoleAtAcquisition"] })}
        />
        <p className="text-xs text-muted-foreground">
          이 주택을 취득하기 전에 양도 주택 한 채(또는 입주권·분양권 한 개)만 있어야 합니다. 이미 목록에 둘 이상 있으면 묻지 않고 적용하지 않습니다.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">이 주택을 증여로 받았습니까</label>
        <RadioCardGroup
          name={`popDeclGift-${house.id}`}
          data-testid="house-row-pop-decline-gift"
          tone="rose"
          layout="inline"
          options={[
            { value: "no", label: "아니오(매매 등)", testId: "house-row-pop-decline-gift-no" },
            { value: "yes", label: "예", testId: "house-row-pop-decline-gift-yes" },
            { value: "unknown", label: "모름", testId: "house-row-pop-decline-gift-unknown" },
          ]}
          value={house.popDeclAcquiredByGift ?? ""}
          onChange={(v) =>
            onUpdate({
              popDeclAcquiredByGift: v as HouseEntry["popDeclAcquiredByGift"],
              // 증여가 아니면(상속 행이 아닐 때) 낡은 세대 답을 함께 지운다
              ...(v !== "yes" && !house.isInherited ? { popDeclDonorHousehold: undefined } : {}),
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          상속·증여로 받은 인구감소지역주택은 피상속인·증여자가 <b>별도세대</b>일 때만 이 특례를 적용합니다(국세청 해석). 증여 여부를 모르면 적용하지 않고 확인 필요로 알립니다.
        </p>
      </div>

      {popDeclineAcquiredFromOther(house) && (
        <div className="space-y-1.5" data-testid="house-row-pop-decline-donor-block">
          <label className="text-sm font-medium">
            이 주택을 취득할 당시 {house.isInherited ? "피상속인" : "증여자"}는 별도세대였습니까
          </label>
          <RadioCardGroup
            name={`popDeclDonor-${house.id}`}
            data-testid="house-row-pop-decline-donor"
            tone="rose"
            layout="inline"
            options={[
              { value: "separate", label: "별도세대", testId: "house-row-pop-decline-donor-separate" },
              { value: "same", label: "같은 세대", testId: "house-row-pop-decline-donor-same" },
              { value: "unknown", label: "모름", testId: "house-row-pop-decline-donor-unknown" },
            ]}
            value={house.popDeclDonorHousehold ?? ""}
            onChange={(v) => onUpdate({ popDeclDonorHousehold: v as HouseEntry["popDeclDonorHousehold"] })}
          />
          <p className="text-xs text-muted-foreground">
            별도세대로부터 상속·증여받은 경우에 적용한다는 국세청 해석(서면-2025-법규재산-1621·2010)이 있습니다. 같은 세대로부터 받았거나 모르면 적용하지 않고 확인 필요로 알립니다.
            상속 정보의 「동일세대」 칸(소령 §155②)과는 별개의 질문입니다.
          </p>
        </div>
      )}

      {showPriorRight && (
        <div className="space-y-1.5" data-testid="house-row-pop-decline-prior-right-block">
          <label className="text-sm font-medium">양도하는 주택을 분양권·조합원입주권으로 받았습니까</label>
          <RadioCardGroup
            name={`popDeclPriorRight-${house.id}`}
            data-testid="house-row-pop-decline-prior-right"
            tone="rose"
            layout="inline"
            options={[
              { value: "no", label: "아니오", testId: "house-row-pop-decline-prior-right-no" },
              { value: "yes", label: "예", testId: "house-row-pop-decline-prior-right-yes" },
              { value: "unknown", label: "모름", testId: "house-row-pop-decline-prior-right-unknown" },
            ]}
            value={house.popDeclPriorRight ?? ""}
            onChange={(v) =>
              onUpdate({
                popDeclPriorRight: v as HouseEntry["popDeclPriorRight"],
                ...(v !== "yes" ? { popDeclPriorRightDate: undefined } : {}),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            양도 주택의 취득일이 이 주택보다 늦게 기록돼 있습니다. 양도 주택을 권리로 받았다면 선후를 완공일이 아니라 권리를 가진 날로 봅니다.
          </p>
          {house.popDeclPriorRight === "yes" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">양도 주택의 권리를 가진 날</label>
              <DateInput
                data-testid="house-row-pop-decline-prior-right-date"
                value={house.popDeclPriorRightDate ?? ""}
                onChange={(v) => onUpdate({ popDeclPriorRightDate: v })}
              />
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground" data-testid="house-row-pop-decline-filing-notice">
        <b>신고 안내</b> — 이 특례를 적용받으려면 양도소득과세표준신고와 함께 과세특례신고서를 제출해야 하며(조특령 §68의2②), 취득 전에 입주권·분양권을
        보유했다면 보유를 증명하는 서류를 함께 냅니다(③). 신고서 제출은 이 계산의 요건이 아니라 신고 때의 절차입니다.
      </p>
    </ToneCard>
  );
}
