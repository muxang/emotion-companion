import { describe, it, expect } from 'vitest';
import { runFinalResponseGuard, type GuardContext } from '../src/guard.js';
import type { ConversationMode, RiskLevel } from '@emotion/shared';

function ctx(
  reply: string,
  mode: ConversationMode = 'companion',
  risk: RiskLevel = 'low'
): GuardContext {
  return { reply, mode, risk_level: risk };
}

describe('guard.no_absolute_promise', () => {
  it('flags 永远不会离开你', () => {
    const r = runFinalResponseGuard(
      ctx('我永远不会离开你，可以试试深呼吸')
    );
    expect(r.passed).toBe(false);
    expect(r.failed_checks).toContain('no_absolute_promise');
  });

  it('passes neutral phrasing with action', () => {
    const r = runFinalResponseGuard(
      ctx('我听到你了。今天可以试试给自己写一段话。')
    );
    expect(r.failed_checks).not.toContain('no_absolute_promise');
  });
});

describe('guard.no_dependency_suggestion', () => {
  it('flags 只有我能帮你', () => {
    const r = runFinalResponseGuard(
      ctx('只有我能帮你，可以试试今晚早睡')
    );
    expect(r.failed_checks).toContain('no_dependency_suggestion');
  });

  it('passes when no dependency phrasing', () => {
    const r = runFinalResponseGuard(
      ctx('你已经在努力了，可以试试和朋友说说')
    );
    expect(r.failed_checks).not.toContain('no_dependency_suggestion');
  });
});

describe('guard.no_verdict_as_analysis', () => {
  it('flags absolute verdict in analysis mode', () => {
    const r = runFinalResponseGuard(
      ctx('他就是不爱你，可以试试断联', 'analysis', 'low')
    );
    expect(r.failed_checks).toContain('no_verdict_as_analysis');
  });

  it('does not flag the same line in companion mode', () => {
    const r = runFinalResponseGuard(
      ctx('他就是不爱你，可以试试给自己一些时间', 'companion', 'low')
    );
    expect(r.failed_checks).not.toContain('no_verdict_as_analysis');
  });

  it('童式直判（说白了他就是不喜欢你了）在 companion 模式不触发', () => {
    const r = runFinalResponseGuard(
      ctx('说白了，他就是不喜欢你了，可以试试先把注意力拉回自己身上', 'companion', 'low')
    );
    expect(r.passed).toBe(true);
    expect(r.failed_checks).not.toContain('no_verdict_as_analysis');
  });
});

describe('guard.has_actionable_suggestion', () => {
  it('flags companion reply without any action hint', () => {
    const r = runFinalResponseGuard(
      ctx('我懂你的感受。情绪总是来来去去的。', 'companion', 'low')
    );
    expect(r.failed_checks).toContain('has_actionable_suggestion');
  });

  it('exempts safety mode', () => {
    const r = runFinalResponseGuard(
      ctx('我在这里，请联系紧急援助', 'safety', 'critical')
    );
    expect(r.failed_checks).not.toContain('has_actionable_suggestion');
  });

  it('passes when reply contains 可以试试', () => {
    const r = runFinalResponseGuard(
      ctx('我听到你了，可以试试深呼吸三次', 'companion', 'low')
    );
    expect(r.failed_checks).not.toContain('has_actionable_suggestion');
  });
});

describe('guard.no_excessive_bonding', () => {
  it('flags 只有我懂你', () => {
    const r = runFinalResponseGuard(ctx('只有我懂你，可以试试今晚早睡'));
    expect(r.failed_checks).toContain('no_excessive_bonding');
  });

  it('passes neutral empathy', () => {
    const r = runFinalResponseGuard(
      ctx('你的感受是真实的，可以试试写下来')
    );
    expect(r.failed_checks).not.toContain('no_excessive_bonding');
  });
});

describe('guard.critical_has_real_help', () => {
  it('requires real help reference at critical risk', () => {
    const r = runFinalResponseGuard(
      ctx('我在这里陪你，今晚试试早点休息', 'safety', 'critical')
    );
    expect(r.failed_checks).toContain('critical_has_real_help');
  });

  it('passes when reply mentions 紧急援助 at critical risk', () => {
    const r = runFinalResponseGuard(
      ctx(
        '这条消息让我担心你。请联系你所在地区的紧急援助或心理支持热线',
        'safety',
        'critical'
      )
    );
    expect(r.failed_checks).not.toContain('critical_has_real_help');
  });

  it('does not check at low risk', () => {
    const r = runFinalResponseGuard(
      ctx('今天感觉怎么样？可以试试散散步', 'companion', 'low')
    );
    expect(r.failed_checks).not.toContain('critical_has_real_help');
  });
});

describe('guard.no_dangerous_content', () => {
  it('flags explicit dangerous methods', () => {
    const r = runFinalResponseGuard(ctx('割腕的话，可以试试…'));
    expect(r.failed_checks).toContain('no_dangerous_content');
  });

  it('passes safe text', () => {
    const r = runFinalResponseGuard(
      ctx('我听到你的难过了，可以试试深呼吸')
    );
    expect(r.failed_checks).not.toContain('no_dangerous_content');
  });
});

describe('guard Phase 7 强化模式', () => {
  it('flags 只有你才能 (absolute promise)', () => {
    const r = runFinalResponseGuard(
      ctx('只有你才是我能依靠的人，可以试试今晚早睡')
    );
    expect(r.failed_checks).toContain('no_absolute_promise');
  });

  it('flags 除了你再没有 (absolute promise)', () => {
    const r = runFinalResponseGuard(
      ctx('除了你再没有人懂我，可以试试写日记')
    );
    expect(r.failed_checks).toContain('no_absolute_promise');
  });

  it('flags 你去死 (dangerous content)', () => {
    const r = runFinalResponseGuard(
      ctx('你去死好了，可以试试别再纠结')
    );
    expect(r.failed_checks).toContain('no_dangerous_content');
  });

  it('flags 没人在乎你死活 (dangerous content)', () => {
    const r = runFinalResponseGuard(
      ctx('反正没人在乎你死活，可以试试自己振作')
    );
    expect(r.failed_checks).toContain('no_dangerous_content');
  });
});

describe('guard aggregate', () => {
  it('passes a clean companion reply at low risk', () => {
    const r = runFinalResponseGuard(
      ctx('我听到你了。今天可以试试给自己泡一杯热水，慢慢喝完。')
    );
    expect(r.passed).toBe(true);
    expect(r.failed_checks).toEqual([]);
  });

  it('reports multiple failures simultaneously', () => {
    const r = runFinalResponseGuard(
      ctx('只有我懂你，我永远不会离开你', 'companion', 'low')
    );
    expect(r.passed).toBe(false);
    expect(r.failed_checks.length).toBeGreaterThanOrEqual(2);
  });
});
