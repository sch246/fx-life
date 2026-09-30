// 第一片的数值走查：用一个照顾好身体的「玩家」按正常速度过一遍，
// 检查门在合理的时间内染上颜色，以及事情发生的顺序；再逐条检查烧水、泡面、喝水、睡觉的规则。
import { describe, expect, it } from 'vitest';
import { perform, stepWorld } from '../src/core/world';
import { isVisible } from '../src/core/reveal';
import { barPreview, blockedReason, objectAvailable, objectMenu, poseOf, running, stopTask, whyNot } from '../src/core/rules';
import { learned } from '../src/core/skills';
import { dispenserWater, hasHot, k, w } from '../src/data/water';
import { NOODLES, heat, soak, stage } from '../src/data/noodles';
import { SKILLS } from '../src/data/skills';
import { CONTENT, DEMO_END_FLAG, newGame } from '../src/data';
import { at } from '../src/core/time';
import { OBJECTS } from '../src/data/objects';
import { CARRIED, carrying } from '../src/data/items';
import { act, carefulPlayer, lyingDown, run, tryDo } from './helpers';

const skill = (id: string) => SKILLS.find((x) => x.id === id)!;

describe('第一片走查', () => {
  it('照顾好身体时，一天之内心情升到 lv1，门染上颜色，玩家出门', () => {
    const s = newGame(1);
    const log: string[] = [];
    let lastFeed = 0;
    while (!s.flags[DEMO_END_FLAG] && s.t < at(3, 0)) {
      carefulPlayer(s);
      stepWorld(s, CONTENT);
      if (s.t % 60 === 0) log.push(`${s.t} · 体力${s.bars.stamina.toFixed(0)} 精力${s.bars.energy.toFixed(0)} 水分${s.bars.water.toFixed(0)} 心情lv${s.levels.mood}/${s.bars.mood.toFixed(0)} 体能lv${s.levels.fitness}/${s.bars.fitness.toFixed(0)}`);
      while (lastFeed < s.feed.length) log.push(`${s.feed[lastFeed].t} ${s.feed[lastFeed++].text}`);
    }
    const hours = (s.t - at(1, 18)) / 60;
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.WALK) console.log(log.map((l) => { const [t, ...r] = l.split(' '); const n = +t; return `D${Math.floor(n / 1440) + 1} ${String(Math.floor((n % 1440) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')} ${r.join(' ')}`; }).join('\n'), `\n用时 ${hours.toFixed(1)} 游戏小时`);
    expect(s.flags[DEMO_END_FLAG]).toBe(true);
    // 交接稿：整段体验不超过现实 25 分钟 = 25 游戏小时；也不应短得没经历一夜。
    expect(hours).toBeLessThanOrEqual(25);
    expect(hours).toBeGreaterThanOrEqual(12);
    expect(s.flags['replied:arrived']).toBe(true);
    // 认真烧水两次就会了；泡面要泡好三次，第一天还在学。
    expect(learned(s, skill('boil'))).toBe(true);
    expect(s.accum['skill:soak']).toBeGreaterThanOrEqual(1);
    expect(s.feed.some((l) => l.text.includes('生水'))).toBe(false);
  });

  it('心情一开始就显示；心情 lv0 时门是灰的，睡眠跳过没有浮现', () => {
    const s = newGame(1);
    expect(isVisible(s, 'bar:mood')).toBe(true);
    expect(objectAvailable(s, CONTENT.actions, 'door')).toBe(false);
    expect(isVisible(s, 'act:sleep-skip')).toBe(false);
  });

  it('什么都不做会饿坏，心情往下掉，透支让体能降级', () => {
    const s = newGame(1);
    run(s, 24 * 60);
    expect(s.levels.mood ?? 0).toBe(0);
    expect(s.bars.stamina).toBeLessThan(15);
    expect(s.levels.fitness).toBeLessThan(2);
  });

  it('菜单只列现在能做的事', () => {
    const s = newGame(1);
    const ids = (obj: string) => objectMenu(s, CONTENT.actions, obj, () => true).map((e) => e.action.id);
    expect(ids('dispenser')).toEqual([]);
    expect(ids('kettle')).toContain('fill-kettle');
    expect(ids('kettle')).not.toContain('kettle-off');
    expect(ids('kettle')).not.toContain('auto-boil');
  });

  it('不在床上时床上只有躺下；躺下后才能睡', () => {
    const s = newGame(1);
    const bed = () => objectMenu(s, CONTENT.actions, 'bed', () => true).map((e) => `${e.kind}:${e.action.id}`);
    expect(bed()).toEqual(['start:lie']);
    tryDo(s, act('lie'));
    expect(bed()).toEqual(['stop:lie', 'start:sleep']);
  });

  it('躺下一会儿才睡着：睡着之前能看手机回消息，不用起身；睡着后只有床能用', () => {
    const s = newGame(1);
    s.t = at(1, 19, 29);
    run(s, 2);
    expect(blockedReason(s, act('sleep'))).toBe('requires');
    tryDo(s, act('lie'));
    expect(blockedReason(s, act('sleep'))).toBeNull();
    perform(s, CONTENT, act('sleep'));
    expect(poseOf(s, CONTENT.actions)).toBe('lie');
    expect(objectAvailable(s, CONTENT.actions, 'phone', true)).toBe(true);
    expect(tryDo(s, act('reply-arrived'))).toBe(true);
    expect(s.ongoing?.actionId).toBe('sleep');
    run(s, 15);
    expect(poseOf(s, CONTENT.actions)).toBe('sleep');
    expect(objectAvailable(s, CONTENT.actions, 'bed')).toBe(true);
    expect(objectAvailable(s, CONTENT.actions, 'window')).toBe(false);
    expect(objectAvailable(s, CONTENT.actions, 'bag', true)).toBe(false);
    expect(objectAvailable(s, CONTENT.actions, 'phone', true)).toBe(false);
  });

  it('手机带在身上，不是房间里的物件：站在哪都能拿出来回消息，睡着时拿不出来', () => {
    const s = newGame(1);
    expect(OBJECTS.some((o) => o.id === 'phone')).toBe(false);
    expect(CARRIED.map((c) => c.id)).toContain('phone');
    expect(carrying(s, 'phone')).toBe(true);
    s.t = at(1, 19, 29);
    run(s, 2);
    perform(s, CONTENT, act('look'));
    expect(tryDo(s, act('reply-arrived'))).toBe(true);
    expect(s.ongoing?.actionId).toBe('look');
    // 手机不在身上了（以后丢了、落在哪里），消息也就回不了。
    const lost = newGame(1);
    lost.items.phone = 0;
    lost.t = at(1, 19, 31);
    stepWorld(lost, CONTENT);
    expect(blockedReason(lost, act('reply-arrived'))).toBe('requires');
  });

  it('点灰掉的东西，小人说得出为什么：心情差不想出门、饮水机没水、桌上没面、睡着了', () => {
    const s = newGame(1);
    const why = (objectId: string) =>
      whyNot(s, CONTENT.actions, CONTENT.actions.filter((a) => a.object === objectId && !a.auto), CONTENT.moodWhy!);
    expect(objectAvailable(s, CONTENT.actions, 'door')).toBe(false);
    expect(why('door')).toBe('心情太差了，不想出门。');
    expect(objectAvailable(s, CONTENT.actions, 'dispenser')).toBe(false);
    expect(why('dispenser')).toBe('饮水机里没水。');
    expect(objectAvailable(s, CONTENT.actions, 'table')).toBe(false);
    expect(why('table')).toBe('桌上没有面。');
    // 能做的时候不编原因。
    expect(why('window')).toBeNull();
    s.t = at(1, 22);
    perform(s, CONTENT, act('lie'));
    perform(s, CONTENT, act('sleep'));
    run(s, 30);
    expect(s.ongoing?.occupies).toBe(true);
    expect(why('window')).toBe('Zzz……');
    expect(why('phone')).toBe('Zzz……');
  });

  it('水壶：5 分钟烧开，开着不关 30 分钟烧干，再干烧 5 分钟烧坏', () => {
    const s = newGame(1);
    perform(s, CONTENT, act('fill-kettle'));
    s.ongoing = null;
    perform(s, CONTENT, act('kettle-on'));
    run(s, 5);
    expect(k(s, 'temp')).toBe(100);
    expect(k(s, 'raw')).toBe(0);
    run(s, 30);
    expect(k(s, 'water')).toBeCloseTo(0);
    expect(k(s, 'broken')).toBe(0);
    run(s, 5);
    expect(k(s, 'broken')).toBe(1);
    expect(blockedReason(s, act('kettle-on'))).not.toBeNull();
  });

  it('关掉后 30 分钟水就不够烫了', () => {
    const s = newGame(1);
    perform(s, CONTENT, act('fill-kettle'));
    s.ongoing = null;
    perform(s, CONTENT, act('kettle-on'));
    run(s, 5);
    perform(s, CONTENT, act('kettle-off'));
    expect(s.accum['skill:boil']).toBe(1);
    run(s, 29);
    expect(hasHot(s, 'kettle', 0.5)).toBe(true);
    run(s, 2);
    expect(hasHot(s, 'kettle', 0.5)).toBe(false);
  });

  it('生水：没烧开就倒进饮水机，喝下去体能会掉，喝之前的预览就能看到', () => {
    const s = newGame(1);
    perform(s, CONTENT, act('fill-kettle'));
    s.ongoing = null;
    perform(s, CONTENT, act('pour-dispenser'));
    s.ongoing = null;
    expect(w(s, 'dispenser', 'raw')).toBe(1);
    expect(barPreview(s, act('drink'))).toEqual({ water: 1, fitness: -1 });
    const f0 = s.bars.fitness;
    perform(s, CONTENT, act('drink'));
    expect(s.bars.fitness - f0).toBeCloseTo(-5);
    // 烧开过的水没有这个代价。
    const t = newGame(1);
    perform(t, CONTENT, act('fill-kettle'));
    t.ongoing = null;
    perform(t, CONTENT, act('kettle-on'));
    run(t, 5);
    perform(t, CONTENT, act('kettle-off'));
    perform(t, CONTENT, act('pour-dispenser'));
    t.ongoing = null;
    expect(barPreview(t, act('drink'))).toEqual({ water: 1 });
  });

  describe('泡面', () => {
    /** 从箱子里拿一桶，照步骤泡上，等 wait 分钟揭开。 */
    const cook = (wait: number, packets = ['sauce', 'salt', 'veg']) => {
      const s = newGame(1);
      s.things['kettle.water'] = 1.5;
      s.things['kettle.temp'] = 100;
      for (const id of ['take-noodles', 'noodle-tear', 'noodle-unpack', ...packets.map((p) => `noodle-${p}`), 'noodle-pour', 'noodle-cover']) {
        expect(tryDo(s, act(id)), id).toBe(true);
      }
      expect(k(s, 'water')).toBeCloseTo(1);
      run(s, wait);
      perform(s, CONTENT, act('noodle-open'));
      return s;
    };

    it('没有热水冲不了；有热水时不认是哪个容器', () => {
      const s = newGame(1);
      for (const id of ['take-noodles', 'noodle-tear', 'noodle-unpack']) tryDo(s, act(id));
      expect(blockedReason(s, act('noodle-pour'))).toBe('requires');
      s.things['dispenser.water'] = 2;
      s.things['dispenser.temp'] = 90;
      expect(tryDo(s, act('noodle-pour'))).toBe(true);
      expect(dispenserWater(s)).toBeCloseTo(1.5);
    });

    it('三分钟前揭开还硬着，能盖回去接着泡；三到十分钟正好；超过十分钟坨了', () => {
      const early = cook(2);
      expect(early.feed.at(-1)!.text).toBe('面还硬着。');
      expect(tryDo(early, act('noodle-cover'))).toBe(true);
      run(early, 2);
      perform(early, CONTENT, act('noodle-open'));
      expect(early.feed.at(-1)!.text).toBe('泡好了。');
      expect(cook(5).feed.at(-1)!.text).toBe('泡好了。');
      expect(cook(12).feed.at(-1)!.text).toBe('面泡坨了。');
    });

    it('热值只在盖着时涨，水值冲上水就涨：不盖就泡不熟，冲水超过十分钟不管盖没盖都坨', () => {
      /** 冲上水先敞着 open 分钟，再盖上 covered 分钟，揭开。 */
      const soakIt = (open: number, covered: number) => {
        const s = newGame(1);
        s.things['kettle.water'] = 1.5;
        s.things['kettle.temp'] = 100;
        for (const id of ['take-noodles', 'noodle-tear', 'noodle-unpack', 'noodle-sauce', 'noodle-salt', 'noodle-veg', 'noodle-pour']) tryDo(s, act(id));
        run(s, open);
        if (covered) {
          tryDo(s, act('noodle-cover'));
          run(s, covered);
          perform(s, CONTENT, act('noodle-open'));
        }
        return s;
      };
      const bare = soakIt(8, 0);
      expect([heat(bare), soak(bare)]).toEqual([0, 8]);
      expect(tryDo(bare, act('noodle-cover'))).toBe(true);
      const late = soakIt(5, 3);
      expect([heat(late), soak(late)]).toEqual([3, 8]);
      expect(late.feed.at(-1)!.text).toBe('泡好了。');
      expect(soakIt(9, 3).feed.at(-1)!.text).toBe('面泡坨了。');
      // 开吃就不再泡了。
      perform(late, CONTENT, act('noodle-eat'));
      run(late, 5);
      expect(soak(late)).toBe(8);
    });

    it('按规矩泡好才长熟练度；料包没放全，淡，也不算', () => {
      const good = cook(5);
      perform(good, CONTENT, act('noodle-eat'));
      expect(good.accum['skill:soak']).toBe(1);
      // 吃到一半走开，回来接着吃：不重复算，也不能再盖回去。
      run(good, 4);
      good.ongoing = null;
      expect(blockedReason(good, act('noodle-cover'))).toBe('requires');
      expect(tryDo(good, act('noodle-eat'))).toBe(true);
      expect(good.accum['skill:soak']).toBe(1);
      run(good, NOODLES.eatMin);
      expect(stage(good)).toBe(0);
      expect(good.feed.at(-1)!.text).toBe('一桶面吃完了。');

      const bland = cook(5, ['sauce']);
      perform(bland, CONTENT, act('noodle-eat'));
      expect(bland.accum['skill:soak'] ?? 0).toBe(0);
      run(bland, NOODLES.eatMin);
      expect(bland.feed.at(-1)!.text).toBe('一桶面吃完了。料没放全，有点淡。');
    });

    it('第一次撕开时技能栏出现泡面；泡好三次才学会，之后能自动泡', () => {
      const fresh = newGame(1);
      tryDo(fresh, act('take-noodles'));
      stepWorld(fresh, CONTENT);
      expect(isVisible(fresh, 'act:auto-noodles')).toBe(false);
      tryDo(fresh, act('noodle-tear'));
      stepWorld(fresh, CONTENT);
      expect(isVisible(fresh, 'act:auto-noodles')).toBe(true);
      const s = cook(5);
      expect(blockedReason(s, act('auto-noodles'))).toBe('requires');
      s.accum['skill:soak'] = 3;
      s.things['noodle.stage'] = 0;
      stepWorld(s, CONTENT);
      expect(learned(s, skill('soak'))).toBe(true);
      expect(s.feed.some((l) => l.text === '泡面这件事，算是会了。')).toBe(true);
      expect(tryDo(s, act('auto-noodles'))).toBe(true);
    });
  });

  it('烧水：第一次打开开关时技能栏出现；烧开后亲手关掉两次学会，自动烧水一点就做完', () => {
    const s = newGame(1);
    const boil = () => {
      perform(s, CONTENT, act('fill-kettle'));
      s.ongoing = null;
      perform(s, CONTENT, act('kettle-on'));
      run(s, 5);
      perform(s, CONTENT, act('kettle-off'));
    };
    boil();
    expect(isVisible(s, 'act:auto-boil')).toBe(true);
    expect(learned(s, skill('boil'))).toBe(false);
    run(s, 40);
    boil();
    expect(learned(s, skill('boil'))).toBe(true);
    run(s, 40);
    expect(tryDo(s, act('auto-boil'))).toBe(true);
    run(s, 6);
    expect(s.ongoing).toBeNull();
    expect(k(s, 'on')).toBe(0);
    expect(k(s, 'raw')).toBe(0);
    expect(k(s, 'temp')).toBeGreaterThanOrEqual(95);
  });

  describe('自动烧水在后台', () => {
    const learnedBoil = () => {
      const s = newGame(1);
      s.accum['skill:boil'] = 2;
      expect(learned(s, skill('boil'))).toBe(true);
      return s;
    };

    it('开了头就去做别的；别的事打断不了它，水开了顺手关掉开关', () => {
      const s = learnedBoil();
      expect(tryDo(s, act('auto-boil'))).toBe(true);
      expect(s.ongoing).toBeNull();
      expect(running(s, 'auto-boil')).toBe(true);
      expect(blockedReason(s, act('auto-boil'))).not.toBeNull();
      // 烧着的时候去看窗外、再躺下：自动烧水还在。
      expect(tryDo(s, act('look'))).toBe(true);
      run(s, 2);
      perform(s, CONTENT, act('lie'));
      expect(running(s, 'auto-boil')).toBe(true);
      run(s, 5);
      expect(running(s, 'auto-boil')).toBe(false);
      expect(k(s, 'on')).toBe(0);
      expect(k(s, 'raw')).toBe(0);
      expect(lyingDown(s)).toBe(true);
      expect(s.feed.some((l) => l.text === '顺手把水壶关了。')).toBe(true);
    });

    it('提前收尾就是现在关掉；亲手关掉了它也就结束了', () => {
      const s = learnedBoil();
      perform(s, CONTENT, act('auto-boil'));
      run(s, 2);
      stopTask(s, CONTENT.actions, 'auto-boil');
      expect(running(s, 'auto-boil')).toBe(false);
      expect(k(s, 'on')).toBe(0);
      expect(k(s, 'temp')).toBeLessThan(100);

      perform(s, CONTENT, act('auto-boil'));
      perform(s, CONTENT, act('kettle-off'));
      run(s, 1);
      expect(running(s, 'auto-boil')).toBe(false);
    });

    it('睡着了收不了尾：水一直烧着，醒来才关', () => {
      const s = learnedBoil();
      perform(s, CONTENT, act('auto-boil'));
      perform(s, CONTENT, act('lie'));
      perform(s, CONTENT, act('sleep'));
      s.ongoing!.start -= 30; // 已经躺了半小时，这就睡着
      run(s, 15);
      expect(s.ongoing?.occupies).toBe(true);
      expect(k(s, 'on')).toBe(1);
      expect(running(s, 'auto-boil')).toBe(true);
      s.ongoing = null; // 醒了
      run(s, 1);
      expect(k(s, 'on')).toBe(0);
      expect(running(s, 'auto-boil')).toBe(false);
    });
  });

  it('开局挑的样子和称呼不进规则：同样的一天过得一模一样', () => {
    const a = newGame(7);
    const b = newGame(7);
    b.person = { pronoun: 'she', hair: 'long', outfit: 'dress' };
    for (let i = 0; i < 24 * 60; i++) {
      carefulPlayer(a);
      carefulPlayer(b);
      stepWorld(a, CONTENT);
      stepWorld(b, CONTENT);
    }
    expect(b.bars).toEqual(a.bars);
    expect(b.feed).toEqual(a.feed);
  });

  it('手动做事略微加心情，同一个物件一小时内只算一次', () => {
    const s = newGame(1);
    const m0 = s.bars.mood;
    perform(s, CONTENT, act('kettle-on'));
    perform(s, CONTENT, act('kettle-off'));
    perform(s, CONTENT, act('kettle-on'));
    expect(s.bars.mood - m0).toBeCloseTo(1);
    perform(s, CONTENT, act('look'));
    expect(s.bars.mood - m0).toBeCloseTo(2);
  });
});
