import { generateCampaign, analyzeLevel } from '../src/game/generate';
import { CAMPAIGN_THEMES } from '../src/game/sites';

let failures = 0;
function check(name: string, cond: boolean, detail: string): void {
  if (!cond) { failures++; console.log('FAIL', name, detail); }
  else console.log('ok  ', name, detail);
}

for (const seed of [20200909, 1, 424242, 777]) {
  const camp = generateCampaign(seed);
  check(`s${seed} size`, camp.length === CAMPAIGN_THEMES.length, `${camp.length}`);
  check(`s${seed} unique themes`, new Set(camp.map((l) => l.theme)).size === camp.length, camp.map((l) => l.theme).join(','));
  for (let i = 0; i < camp.length; i++) {
    const st = analyzeLevel(camp[i]!);
    check(`s${seed} L${i + 1} enemies`, st.enemies >= 3 && st.enemies <= 8, `${st.enemies}`);
    check(`s${seed} L${i + 1} birds`, st.birds >= 3 && st.birds <= 5, `${st.birds}`);
    check(`s${seed} L${i + 1} cover`, st.covered === st.enemies, `${st.covered}/${st.enemies}`);
    check(`s${seed} L${i + 1} ratio`, st.ratio >= 0.65 && st.ratio <= 1.22, st.ratio.toFixed(2));
    check(`s${seed} L${i + 1} tnt`, st.tnt <= 1, `${st.tnt}`);
  }
  const last = camp[camp.length - 1]!;
  check(`s${seed} finale aeroflot`, last.theme === 'aeroflot', last.theme);
  check(`s${seed} finale boss`, last.enemies.some((e) => e.kind === 'boss'), last.enemies.map((e) => e.kind).join(','));
  const earlyBoss = camp.slice(0, -1).some((l) => l.enemies.some((e) => e.kind === 'boss'));
  check(`s${seed} boss only finale`, !earlyBoss, camp.slice(0, -1).map((l) => l.enemies.map((e) => e.kind).join('+')).join(' | '));
}

console.log(failures === 0 ? '\nALL GENERATE TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
