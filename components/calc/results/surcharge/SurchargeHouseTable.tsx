"use client";

/**
 * D1 교재식 표 — 보유 주택마다 ①판정기준 ②기준시가 ③주택 수 산입 ④조정대상지역 ⑤「이 주택을 양도한다면」
 * (계획서 `multi-house-surcharge-judgment-menu.plan.md` §5.5 · P7).
 *
 * 행: 양도 예정 주택(맨 위·강조) → 명부 순서 → 분양권·입주권 → 양도일 현재 미보유. 판정은 하지 않는다 — 응답의 행 판정과
 * 입력 사실(기준시가·명부 순번)만 옮긴다(T5). ⑤의 다른 행은 같은 양도일에 그 주택을 판다고 본 **간이 판정**이다(D6 · F-6).
 */
import { REGION_REASON_TEXT } from "@/lib/tax-engine/multi-house-surcharge-narrative-steps";
import { EXCLUDED_REASON_LABEL } from "@/components/calc/MultiHouseSurchargeDetailCard";
import { countExclusionHouseRef } from "@/components/calc/results/transfer/count-exclusion-house-ref";
import type {
  SurchargeHouseRow,
  SurchargeRightRow,
} from "@/app/api/calc/multi-house-surcharge-judgment/surcharge-judgment-payload";
import type { HouseEntry, PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { priceCell, RIGHT_COUNT_REASON_LABEL, RIGHT_TYPE_LABEL, rowConclusionLabel } from "./surcharge-labels";

const SELLING = "selling";

type Props = {
  houses: SurchargeHouseRow[];
  rights: SurchargeRightRow[];
  /** 입력 사실 — 명부 순번·기준시가 표시용 */
  formHouses: readonly HouseEntry[];
  formRights: readonly PresaleRightEntry[];
  sellingStdPrice: string | undefined;
  /** 응답의 중과 판정 주택 수(정밀 판정 echo) — 화면이 행을 세어 다시 만들지 않는다(F-8) */
  effectiveHouseCount: number;
  /** D6 「이 주택을 양도 예정 주택으로 바꿔 판정」 — 확인 대화상자와 맞바꾸기는 폼을 가진 오케스트레이터가 한다 */
  onSwapSelling?: (houseId: string) => void;
};

function Yes({ label }: { label: string }) {
  return (
    <span aria-label={label} className="text-emerald-700 dark:text-emerald-400">
      ○
    </span>
  );
}
function No({ label }: { label: string }) {
  return (
    <span aria-label={label} className="text-rose-700 dark:text-rose-400">
      ×
    </span>
  );
}

/** ① 판정기준 — 코드가 있으면 응답의 분류·이유, 없으면 입력한 수동 지역 구분 */
function criteriaCell(row: SurchargeHouseRow, entry: HouseEntry | undefined): string {
  if (row.regionCriteria) {
    const base = row.regionCriteria.criteria === "REGION" ? "지역기준" : "가액기준";
    return row.regionCriteria.reason === "no_code" ? base : `${base} (${REGION_REASON_TEXT[row.regionCriteria.reason].replace(/이?라$/, "")})`;
  }
  // 양도 주택은 코드가 없으면 ④가 지역기준으로 싣는다(`deriveHouseRegionFromCode`)
  const capital = row.houseId === SELLING ? true : entry?.region === "capital";
  return `${capital ? "지역기준" : "가액기준"} · 주소 미입력`;
}

export function SurchargeHouseTable({
  houses,
  rights,
  formHouses,
  formRights,
  sellingStdPrice,
  effectiveHouseCount,
  onSwapSelling,
}: Props) {
  const judged = new Set(houses.map((h) => h.houseId));
  const notOwned = formHouses.filter((h) => !judged.has(h.id));

  const nameOf = (id: string) => (id === SELLING ? "양도 예정 주택" : (countExclusionHouseRef(formHouses, id) ?? "보유 주택"));

  return (
    <div data-testid="surcharge-table" className="space-y-2">
      <p className="text-sm leading-relaxed text-muted-foreground">
        ⑤는 <b>같은 양도일에 그 주택을 양도한다고 볼 때</b>의 결론입니다. 양도 예정 주택은 정밀 판정, 나머지는 간이 판정입니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">주택</th>
              <th className="px-2 py-2 font-medium">① 판정기준</th>
              <th className="px-2 py-2 text-right font-medium">② 기준시가</th>
              <th className="px-2 py-2 font-medium">③ 주택 수 산입</th>
              <th className="px-2 py-2 font-medium">④ 조정대상지역</th>
              <th className="px-2 py-2 font-medium">⑤ 양도한다면</th>
            </tr>
          </thead>
          <tbody>
            {/* 응답 행은 이미 「양도 예정 주택 → 명부 순서」다(④ 본문 순서 그대로 · RV-1이 고정) */}
            {houses.map((row) => {
              const entry = formHouses.find((h) => h.id === row.houseId);
              const id = row.houseId;
              return (
                <tr
                  key={id}
                  data-testid={`surcharge-row-${id}`}
                  className={`border-b align-top ${id === SELLING ? "bg-violet-50 font-medium dark:bg-violet-950/30" : ""}`}
                >
                  <td className="px-2 py-2">{nameOf(id)}</td>
                  <td className="px-2 py-2" data-testid={`surcharge-cell-criteria-${id}`}>
                    {criteriaCell(row, entry)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums" data-testid={`surcharge-cell-price-${id}`}>
                    {priceCell(id === SELLING ? sellingStdPrice : entry?.officialPrice)}
                  </td>
                  <td className="px-2 py-2" data-testid={`surcharge-cell-counted-${id}`}>
                    {row.countExclusion ? (
                      <>
                        <No label="불산입" /> {EXCLUDED_REASON_LABEL[row.countExclusion.reason] ?? row.countExclusion.reason}
                      </>
                    ) : (
                      <Yes label="산입" />
                    )}
                  </td>
                  <td className="px-2 py-2" data-testid={`surcharge-cell-regulated-${id}`}>
                    {row.regulated ? (
                      row.regulated.isRegulated ? <Yes label="조정대상지역" /> : <No label="조정대상지역 아님" />
                    ) : (
                      <span className="text-rose-700 dark:text-rose-400">주소 미입력 · 확인 필요</span>
                    )}
                  </td>
                  <td className="px-2 py-2" data-testid={`surcharge-cell-ifSold-${id}`}>
                    {rowConclusionLabel(row.result)}
                    {row.basis === "simplified" && <span className="text-muted-foreground"> (간이)</span>}
                    {row.sensitivity.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-rose-700 dark:text-rose-400">
                        {row.sensitivity.map((s) => (
                          <li key={s.id}>확인 필요 — {s.message}</li>
                        ))}
                      </ul>
                    )}
                    {onSwapSelling && id !== SELLING && entry && (
                      <button
                        type="button"
                        data-testid={`surcharge-swap-${id}`}
                        className="mt-1 block text-left text-xs font-medium text-primary hover:underline print:hidden"
                        onClick={() => onSwapSelling(id)}
                      >
                        이 주택을 양도 예정 주택으로 바꿔 판정
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rights.map((r) => {
              const i = formRights.findIndex((x) => x.id === r.rightId);
              return (
                <tr key={r.rightId} data-testid={`surcharge-row-${r.rightId}`} className="border-b align-top">
                  <td className="px-2 py-2">
                    {RIGHT_TYPE_LABEL[r.type]} {i >= 0 ? i + 1 : ""}
                  </td>
                  <td className="px-2 py-2">—</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums">
                    {priceCell(i >= 0 ? formRights[i].rightValue : undefined)}
                  </td>
                  <td className="px-2 py-2" data-testid={`surcharge-cell-counted-${r.rightId}`}>
                    {r.countReason === "counted" && !r.spouseSubtracted ? (
                      <Yes label="산입" />
                    ) : (
                      <>
                        <No label="불산입" />{" "}
                        {r.spouseSubtracted ? "혼인 배우자 보유 차감(§167의4⑤)" : RIGHT_COUNT_REASON_LABEL[r.countReason]}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2">—</td>
                  <td className="px-2 py-2">중과 없음 (주택이 아님)</td>
                </tr>
              );
            })}
            {notOwned.map((h) => (
              <tr key={h.id} data-testid={`surcharge-row-${h.id}`} className="border-b align-top text-muted-foreground">
                <td className="px-2 py-2">{nameOf(h.id)}</td>
                <td className="px-2 py-2" colSpan={5}>
                  양도일 현재 보유하지 않음 — 주택 수에 넣지 않습니다
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p data-testid="surcharge-count-summary" className="text-sm text-muted-foreground">
        중과 판정 주택 수(조합원입주권·분양권 포함) <b className="text-foreground">{effectiveHouseCount}</b>
      </p>
    </div>
  );
}
