/**
 * loss-offset-core.ts — §102② 양도차손 통산 **단일 소스** (무의존 leaf)
 *
 * 법령:
 *   법 §102② — 「제1항 **각 호별로** 해당 자산 외의 다른 자산에서 발생한 양도소득금액에서
 *     그 양도차손을 공제한다. 이 경우 공제방법은 … 대통령령으로 정한다.」
 *   영 §167의2① — 「양도차손은 다음 각호의 자산의 양도소득금액에서 **순차로** 공제한다.
 *     1. 양도차손이 발생한 자산과 **같은 세율을 적용받는 자산**의 양도소득금액
 *     2. … **다른 세율**을 적용받는 자산의 양도소득금액. 이 경우 … 각 세율별 양도소득금액의
 *        합계액에서 당해 양도소득금액이 차지하는 비율로 **안분하여** 공제한다.」
 *
 * ## 왜 코어로 뽑았나
 *
 * 부동산 다자산(`transfer-tax-aggregate-helpers.ts`)에만 있던 구현을 **주식 다종목**도 써야 한다
 * (계획서 §6.1 설계 A). 복제하면 한쪽만 고쳐지는 드리프트가 난다 — 이 저장소의 반복 실패 패턴이다.
 *
 * ## 세목 중립 계약
 *
 * 이 파일은 **부동산도 주식도 모른다**. 세 가지 사실만 받는다:
 *   - `income`   통산 전 양도소득금액 (음수 = 양도차손)
 *   - `rateKey`  「같은 세율을 적용받는」 판정 축 — **호출자가 자기 세목 규약으로 만든다**
 *   - `exempt`   비과세 자산 여부
 *
 * ⚠️ **`rateKey`의 축은 세목마다 다르다** — 코어가 정하지 않는다.
 *   · 부동산: `RateGroup`(§104⑤ 버킷과 결합된 load-bearing 분류. `classifyRateGroup` 참조)
 *   · 주식:   **적용 세율 값** {10% · 20∼25% · 20% · 30%}
 *     (별지 제84호서식 작성요령 4번 「주식등 종류코드란의 **세율이 같은 자산**을 합산」).
 *   주식에 「호」 축을 쓰면 §104①11호 하나에 10%·20%·20∼25%·30%가 다 들어 있어 서식과 어긋난다.
 *
 * ## 비과세 자산은 통산에서 제외한다
 *
 * 국세청 **상속증여세과-209(2013.06.10.)** — 「1세대1주택 등 **비과세대상 자산에서 발생한
 * 양도차익 또는 차손은 과세대상의 양도소득금액과 통산할 수 없는 것임**」
 * (선행 부동산거래관리과-0735 · 재산세과-1640). 차손만이 아니라 **이익도** 빠진다.
 *
 * ## 잔여 차손은 소멸한다
 *
 * 양도소득에는 결손금 이월이 없다. 통산하지 못한 차손은 `unusedLoss`로 보고만 하고 버린다.
 *
 * ## 배분 규약 — floor + 마지막 잔액 흡수
 *
 * 비례 배분은 `Math.floor`라 그대로 더하면 총합이 pool에 못 미친다. **마지막 항목이 잔액을
 * 흡수**해 `Σ배분 = pool`을 강제한다(면적 안분 `residualArea`와 같은 사고). 순서 의존이므로
 * **입력 순서와 그룹 최초 등장 순서가 결과를 바꾼다** — 호출자는 순서를 안정적으로 유지할 것.
 *
 * 거동 고정: `__tests__/tax-engine/transfer-tax-loss-offset-characterization.test.ts` (38건).
 * mutation M1·M2·M3에서 각각 6·5·11건이 빨개짐을 확인했다.
 */

/** 통산 코어 입력 — 세목 중립. 호출자가 자기 도메인에서 이 세 값만 뽑아 넘긴다. */
export interface LossOffsetCoreRecord {
  /** 통산 전 양도소득금액. 음수면 양도차손. */
  income: number;
  /** 「같은 세율을 적용받는 자산」 판정 축 (§167의2①1호). 세목별 규약은 위 주석 참조. */
  rateKey: string;
  /** 비과세 자산이면 true — 이익·차손 **양쪽 다** 통산에서 제외된다. */
  exempt?: boolean;
}

/** 차손 이전 1건 — 자산을 **인덱스**로 가리킨다(도메인 식별자는 호출자가 붙인다). */
export interface LossOffsetCoreRow {
  /** 차손이 발생한 자산의 인덱스 */
  from: number;
  /** 차손을 흡수한(=소득이 줄어든) 자산의 인덱스 */
  to: number;
  amount: number;
  scope: "same_group" | "other_group";
}

export interface LossOffsetCoreOutput {
  rows: LossOffsetCoreRow[];
  /** 자산별로 **같은 세율군**에서 받은 차손 (§167의2①1호) */
  fromSame: number[];
  /** 자산별로 **다른 세율군**에서 안분받은 차손 (§167의2①2호) */
  fromOther: number[];
  /** 통산 후 양도소득금액. 차손·비과세 자산은 0. */
  incomeAfterOffset: number[];
  /** 통산되지 못하고 소멸한 차손 (이월 불인정) */
  unusedLoss: number;
}

export function offsetLossesCore(records: LossOffsetCoreRecord[]): LossOffsetCoreOutput {
  const n = records.length;
  const fromSame: number[] = new Array(n).fill(0);
  const fromOther: number[] = new Array(n).fill(0);
  const rows: LossOffsetCoreRow[] = [];

  // 그룹 순회 순서 = **최초 등장 순서**(Map 삽입 순서). 잔액 흡수가 순서 의존이라 계약의 일부다.
  const byGroup = new Map<string, number[]>();
  records.forEach((r, i) => {
    if (r.exempt) return;
    const list = byGroup.get(r.rateKey) ?? [];
    list.push(i);
    byGroup.set(r.rateKey, list);
  });

  const remainingLossByGroup = new Map<string, number>();
  const remainingGainByAsset: number[] = records.map((r) => (r.exempt ? 0 : Math.max(0, r.income)));

  // ── §167의2①1호: 같은 세율군 안에서 먼저 ──
  for (const [group, idxList] of byGroup) {
    const gainIdx = idxList.filter((i) => records[i].income > 0);
    const lossIdx = idxList.filter((i) => records[i].income < 0);
    const totalGain = gainIdx.reduce((s, i) => s + records[i].income, 0);
    const totalLossAbs = lossIdx.reduce((s, i) => s + Math.abs(records[i].income), 0);
    const offsetPool = Math.min(totalGain, totalLossAbs);

    if (offsetPool > 0 && totalGain > 0) {
      let distributed = 0;
      gainIdx.forEach((gi, pos) => {
        const isLast = pos === gainIdx.length - 1;
        const share = isLast
          ? offsetPool - distributed
          : Math.floor((records[gi].income * offsetPool) / totalGain);
        if (share > 0) {
          fromSame[gi] += share;
          remainingGainByAsset[gi] -= share;
          let lossShareRemaining = share;
          lossIdx.forEach((li, lpos) => {
            const isLastLoss = lpos === lossIdx.length - 1;
            const fromThis = isLastLoss
              ? lossShareRemaining
              : Math.min(
                  lossShareRemaining,
                  Math.floor((Math.abs(records[li].income) * share) / totalLossAbs),
                );
            if (fromThis > 0) {
              rows.push({ from: li, to: gi, amount: fromThis, scope: "same_group" });
              lossShareRemaining -= fromThis;
            }
          });
        }
        distributed += share;
      });
    }

    remainingLossByGroup.set(group, totalLossAbs - offsetPool);
  }

  // ── §167의2①2호: 남은 차손을 다른 세율군 소득에 pro-rata 안분 ──
  const totalRemainingLoss = [...remainingLossByGroup.values()].reduce((s, v) => s + v, 0);
  const totalRemainingGain = remainingGainByAsset.reduce((s, v) => s + v, 0);
  const offsetPool2 = Math.min(totalRemainingLoss, totalRemainingGain);

  if (offsetPool2 > 0 && totalRemainingGain > 0) {
    const lossGroups = [...remainingLossByGroup.entries()].filter(([, v]) => v > 0);
    const gainIndices = remainingGainByAsset
      .map((g, i) => ({ i, g }))
      .filter((x) => x.g > 0);

    let consumedGain = 0;
    gainIndices.forEach((gx, pos) => {
      const isLast = pos === gainIndices.length - 1;
      const share = isLast
        ? offsetPool2 - consumedGain
        : Math.floor((gx.g * offsetPool2) / totalRemainingGain);
      if (share > 0) {
        fromOther[gx.i] += share;
        let remainingShare = share;
        lossGroups.forEach(([lossGroup, lossGroupRemain], lgPos) => {
          if (lossGroupRemain <= 0) return;
          const isLastGroup = lgPos === lossGroups.length - 1;
          const fromThisGroup = isLastGroup
            ? remainingShare
            : Math.min(
                remainingShare,
                Math.floor((lossGroupRemain * share) / totalRemainingLoss),
              );
          if (fromThisGroup > 0) {
            // 🐛 **의도적으로 `exempt`를 거르지 않는다** — 부동산 정본의 현행 거동을 그대로
            //    옮긴 것이다(`transfer-tax-aggregate-helpers.ts` 종전 구현). 비과세 차손이
            //    분모 `groupLossTotal`에 섞여 `rows`의 **귀속 표시**가 비과세 자산으로 새어나간다.
            //    세액에 쓰이는 `fromSame`·`fromOther`·`incomeAfterOffset`·`unusedLoss`는
            //    `remainingLossByGroup`(비과세 제외) 기준이라 **영향이 없다** — 표시 결함이다.
            //    거동 고정: characterization **C-13**. 여기서 고치면 「추출 전후 동일」이 깨지므로
            //    별건으로 남긴다.
            const lossIdxInGroup = records
              .map((r, i) => ({ i, r }))
              .filter((x) => x.r.rateKey === lossGroup && x.r.income < 0);
            const groupLossTotal = lossIdxInGroup.reduce((s, x) => s + Math.abs(x.r.income), 0);
            let distributed = 0;
            lossIdxInGroup.forEach((lx, lpos) => {
              const isLastAsset = lpos === lossIdxInGroup.length - 1;
              const fromThisAsset = isLastAsset
                ? fromThisGroup - distributed
                : Math.floor((Math.abs(lx.r.income) * fromThisGroup) / groupLossTotal);
              if (fromThisAsset > 0) {
                rows.push({ from: lx.i, to: gx.i, amount: fromThisAsset, scope: "other_group" });
                distributed += fromThisAsset;
              }
            });
            remainingShare -= fromThisGroup;
          }
        });
      }
      consumedGain += share;
    });
  }

  const unusedLoss = totalRemainingLoss - offsetPool2;

  const incomeAfterOffset = records.map((r, i) => {
    if (r.exempt) return 0;
    if (r.income < 0) return 0;
    return Math.max(0, r.income - fromSame[i] - fromOther[i]);
  });

  return { rows, fromSame, fromOther, incomeAfterOffset, unusedLoss };
}
