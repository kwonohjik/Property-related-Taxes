"use client";

/**
 * HouseholdHousingCountSection — ① 세대·주택 현황의 「세대 보유 주택 수」 입력 + §104①4호 단서 확인.
 *
 * 800줄 정책 분리(2026-10-06, 별건 5 작업 중 — Step4.tsx가 837줄로 재초과했다). 명부-정본 종류
 * (housing·redevelopment_apt·right_to_move_in)는 읽기 전용 표시 + 「0행 확정」 토글, 그 외
 * 분양권(`presale_right`)은 「0/1/2/3+」 버튼 + 정확값 입력을 그대로 둔다(계획서 §4-4, Q-11).
 *
 * §104①4호(조정대상지역 주택분양권 50%) 단서(영 §167의6 1·2호) 확인 2종은 분양권 분기 바로
 * 아래에 둔다 — 「세대 보유 주택 수 0채」를 먼저 확정해야 의미가 생기므로(UI 순서 = 판정 순서,
 * `presaleRightNoHouseExceptionVisible`가 단일 게이트) 같은 컴포넌트에 둬야 응집도가 높다.
 */
import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { usesHouseCountRoster, houseCountSelfOffset } from "@/lib/calc/housing-like-asset";
import { presaleRightNoHouseExceptionVisible } from "@/lib/calc/presale-right-no-house-exception-scope";

export function HouseholdHousingCountSection({
  form,
  onChange,
  primaryKind,
  derivedHouseholdHousingCount,
  houseCountLocked,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  primaryKind: string;
  derivedHouseholdHousingCount: number;
  houseCountLocked: boolean;
}) {
  return (
    <>
      {/*
        주택 수 — Q-6·Q-7(명부 필수화 PR-1) + PR-B(2026-10-05, redevelopment_apt) +
        PR-C(2026-10-05, right_to_move_in): `usesHouseCountRoster`(housing·
        redevelopment_apt·right_to_move_in)는 명부에서 도출한 읽기 전용 표시로 바꾼다.
        분양권(나머지 housing-like 1종)만 ①의 의미 축 자체가 없어 「1/2/3+」 버튼을
        그대로 둔다(계획서 §4-4, Q-11 — 범위 밖).

        입주권은 **오프셋이 다르다**(`houseCountSelfOffset`) — 양도하는 입주권 자신은
        §89①4호 가목이 말하는 「주택」이 아니라서 명부 0행이 그대로 0채다(+1 없음).
        housing·redevelopment_apt는 자신이 주택이라 명부 0행 확정 시 1채다.
      */}
      {usesHouseCountRoster(primaryKind) ? (
        <div className="space-y-1.5" data-field="householdNoOtherHousesConfirmed">
          <label className="block text-sm font-medium">세대 보유 주택 수</label>
          <p className="text-sm" data-testid="household-house-count-derived">
            {derivedHouseholdHousingCount}채
            <span className="ml-1.5 text-xs text-muted-foreground">
              (아래 「세대 보유 주택 목록」에서 자동 산정됩니다)
            </span>
          </p>
          {/*
            명부 0행 — 「없음」을 확정해야 ⑧이 통과한다(행이 생기면 onChange에서 해제, #1919 패턴).
            확정 시 스칼라를 **오프셋 값**으로 맞춘다 — housing·redevelopment_apt는 "1"
            (자신이 주택), right_to_move_in은 "0"(자신은 주택이 아님, §89①4호 가목).
            D-4(0행이면 스칼라 그대로)가 남아 있어, 행을 추가했다가 전부 지운 뒤 확정하면
            스칼라가 그 전 선언값(예: "3")에 멈춰 있을 수 있다.
          */}
          {(form.houses?.length ?? 0) === 0 && (
            <ToggleCard
              checked={form.householdNoOtherHousesConfirmed === true}
              onCheckedChange={(v) =>
                onChange({
                  householdNoOtherHousesConfirmed: v,
                  ...(v ? { householdHousingCount: String(houseCountSelfOffset(primaryKind)) } : {}),
                })
              }
              title="다른 보유 주택이 없습니다"
              description={
                primaryKind === "right_to_move_in"
                  ? "양도하는 이 입주권 외에 세대가 보유한 주택이 없으면 켜세요. 다른 주택이 있으면 아래 「세대 보유 주택 목록」에 추가하세요."
                  : "양도하는 이 주택 외에 세대가 보유한 주택이 없으면 켜세요. 다른 주택이 있으면 아래 「세대 보유 주택 목록」에 추가하세요."
              }
              tone="sky"
            />
          )}
        </div>
      ) : (
        <div className="space-y-1.5" data-field="householdHousingCount">
          <label className="block text-sm font-medium">
            세대 보유 주택 수 <span className="text-destructive">*</span>
          </label>
          {/* 문구("목록의 3채로 합니다" 등)에도 「N채」가 나와 텍스트 셀렉터가 충돌한다 —
              anchor 가 버튼군을 유일하게 집도록 testid 를 둔다. */}
          {/*
            "0"은 이 분기(= presale_right 전용, usesHouseCountRoster가 거짓인 유일한 종류)에만
            추가한다 — §104①4호 단서(영 §167의6)의 「무주택」 사실을 입력할 경로가 없었다
            (별건 5, 계획서 §4-4). 엔진은 이미 `householdHousingCount === 0`을 무주택으로
            읽으므로(`transfer-tax-rate-calc.ts`) 버튼만 열면 단일 소스로 닿는다.
          */}
          <div className="flex gap-2" data-testid="household-house-count-buttons">
            {["0", "1", "2", "3+"].map((v) => (
              <button
                key={v}
                type="button"
                disabled={houseCountLocked}
                onClick={() => onChange({ householdHousingCount: v === "3+" ? "3" : v })}
                className={cn(
                  "flex-1 rounded-md border py-2 text-sm font-medium transition-colors",
                  (v === "3+" ? parseInt(form.householdHousingCount) >= 3 : form.householdHousingCount === v)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                  houseCountLocked && "cursor-not-allowed opacity-60 hover:bg-transparent",
                )}
              >
                {v === "3+" ? "3채 이상" : `${v}채`}
              </button>
            ))}
          </div>
          {houseCountLocked && (
            <p className="pt-0.5 text-xs text-muted-foreground">
              아래 「세대 보유 주택 목록」에 입력한 주택으로 자동 산정됩니다. 바꾸려면 목록을 수정하세요.
            </p>
          )}
          {/* 3채 이상: 정확한 세대 보유 주택 수 — 비과세·장특(§89①3호가목 1주택 요건) 판정에 실제 주택 수 사용.
              토글 캡("3")이 4채+를 3으로 저장하면 감면·특례 배제 겹칠 때 1주택 특례를 오부여하므로 정확값을 입력받는다. */}
          {parseInt(form.householdHousingCount) >= 3 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="shrink-0 text-xs text-muted-foreground">정확한 세대 보유 주택 수</span>
              <div className="w-20">
                <IntegerInput
                  id="household-house-count-exact"
                  value={parseInt(form.householdHousingCount) || 3}
                  onChange={(n) => onChange({ householdHousingCount: String(Math.max(3, n)) })}
                  ariaLabel="정확한 세대 보유 주택 수"
                  disabled={houseCountLocked}
                />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">채</span>
            </div>
          )}
        </div>
      )}

      {/*
        §104①4호 단서(영 §167의6 1·2호) 확인 — 분양권 + 2018.1.1~2021.5.31 양도 +
        조정대상지역 + 「세대 보유 주택 수 0채」(위) 조합에서만 보인다(별건 5, 계획서 §4-4).
        하나라도 미확인이면 50% 단일세율이 그대로 적용된다(모름 = 혜택 불성립).
      */}
      {presaleRightNoHouseExceptionVisible(form, primaryKind) && (
        <div
          className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900/50 dark:bg-sky-950/20"
          data-field="presaleRightClause4Proviso"
        >
          <p className="text-xs font-medium text-sky-900 dark:text-sky-200">
            §104①4호(조정대상지역 주택분양권 50%) 단서 확인 — 2018.1.1~2021.5.31 양도분
          </p>
          <p className="text-caption leading-relaxed text-sky-800 dark:text-sky-300">
            「소득세법 시행령」 제167조의6의 요건을 모두 확인해야 50% 단일세율이 배제되고
            보유기간별 특례세율(§104①1~3호)만 적용됩니다.
          </p>
          <ToggleCard
            checked={form.presaleRightNoOtherRight === true}
            onCheckedChange={(v) => onChange({ presaleRightNoOtherRight: v })}
            title="다른 분양권을 보유하고 있지 않습니다"
            description="양도 당시 세대가 이 분양권 외에 다른 분양권(주택의 입주자로 선정된 지위)을 보유하지 않으면 켜세요 (영 §167의6 1호)."
            tone="sky"
          />
          <ToggleCard
            checked={form.presaleRightAgeOrSpouseMet === true}
            onCheckedChange={(v) => onChange({ presaleRightAgeOrSpouseMet: v })}
            title="양도자가 30세 이상이거나 배우자가 있습니다"
            description="미성년자는 제외하며, 배우자가 사망·이혼한 경우를 포함합니다 (영 §167의6 2호)."
            tone="sky"
          />
        </div>
      )}
    </>
  );
}
