/**
 * 隐性关系模式发现器 - Phase 7+
 *
 * 三层架构：
 *  1. 规则识别（纯关键词，不调 AI，快速稳定）
 *  2. AI 动态生成（基于用户真实原话，每人独一无二）
 *  3. 兜底文案（AI 失败时使用固定文案，保证不空）
 */
import type { Pool } from 'pg';
import type { AIClient } from '@emotion/core-ai';

// ============================================================
// 数据结构
// ============================================================

export interface RelationshipPattern {
  pattern_type: string;
  sub_type: string | null;
  confidence: number;
  evidence_count: number;
  hit_examples: string[];
  title: string;
  subtitle: string;
  description: string;
  real_cost: string;
  suggestion: string;
  next_step: string;
}

// ============================================================
// 规则定义
// ============================================================

interface PatternRule {
  type: string;
  title: string;
  subtitle: string;
  keywords: RegExp[];
  threshold: number;
  detectSubType: (msgs: string[], hits: string[]) => string | null;
  /** excessive_giving 需要特殊判断逻辑 */
  customDetect?: (msgs: string[]) => { count: number; hits: string[] } | null;
}

const OVER_INTERPRETATION_KW = [
  /他是不是/, /他肯定/, /他一定/, /说明他/,
  /这代表/, /这意味着/, /他应该是/, /他大概是/,
  /感觉他/, /我猜他/, /他这样做是/, /他这么说是/,
  /这说明/, /他其实是/, /他内心是/, /他潜意识/,
];

const APPROVAL_SEEKING_KW = [
  /他是不是还喜欢/, /他还在意吗/, /他有没有想我/,
  /他怎么看我/, /他觉得我/, /他对我是不是/,
  /他还爱我吗/, /我在他心里/, /他有没有提到我/,
  /你觉得他是不是/, /你觉得他还有感情吗/,
  /你觉得是真的吗/, /你觉得我们还有希望吗/,
  /他这么做是不是还在意我/, /证明他还喜欢我/,
];

const SELF_BLAME_KW = [
  /是不是我/, /我哪里/, /我做错了/, /都是我/,
  /我不够/, /我太/, /我的问题/, /是我的错/,
  /我不好/, /我配不上/, /我有问题/,
  /我没做好/, /我应该/, /我早该/,
  /如果我当时/, /都怪我/, /是我先/,
  /我让他失望了/, /我辜负了/, /是我的原因/,
];

const AMBIGUITY_KW = [
  /算了/, /也还好/, /可能是我想多了/,
  /不确定/, /说不清楚/, /也许吧/, /随便/,
  /无所谓/, /算了吧/, /不知道/,
  /就这样吧/, /顺其自然/, /看看再说/,
  /走一步算一步/, /不想那么多了/,
  /随缘/, /管他呢/, /说不定以后/,
];

const BOUNDARY_KW = [
  /又忍不住/, /控制不住/, /我知道不该但/,
  /我告诉自己不要但/, /还是发了/, /还是去看了/,
  /又刷了/, /说好不联系但/, /忍了很久但/,
  /最后还是/, /我说好不/, /我发誓不再/,
  /我提醒自己/, /我已经很努力在克制/,
  /但还是没忍住/, /结果还是/, /明明知道但/,
  /告诉自己算了但/,
];

const SELF_ACTION_KW = [
  /我又/, /我一直/, /我总是/, /我每次都/,
  /我主动/, /我先/, /我去找他/, /我发消息/,
  /我等他/, /我准备了/, /我为他/, /我帮他/,
  /我一个人/, /我付出了/, /我做了那么多/,
  /我把他放在第一位/, /我牺牲了/,
];

const OTHER_ACTION_KW = [
  /他主动/, /他来找/, /他联系/, /他说了/,
];

function countKeywordHits(
  msgs: string[],
  keywords: RegExp[]
): { count: number; hits: string[] } {
  let count = 0;
  const hits: string[] = [];
  for (const msg of msgs) {
    let msgHit = false;
    for (const kw of keywords) {
      if (kw.test(msg)) {
        count++; // 同一条消息的每个不同关键词都计数
        msgHit = true;
      }
    }
    if (msgHit && hits.length < 5) {
      hits.push(msg.slice(0, 50).replace(/\n/g, ' '));
    }
  }
  return { count, hits };
}

const RULES: PatternRule[] = [
  {
    type: 'over_interpretation',
    title: '过度解读',
    subtitle: '你替他想了太多，累的是你自己',
    keywords: OVER_INTERPRETATION_KW,
    threshold: 3,
    detectSubType: (msgs) => {
      const joined = msgs.join('');
      if (/不回消息|已读不回/.test(joined)) return 'silent_interpretation';
      if (/他说.{0,10}但我感觉/.test(joined)) return 'word_interpretation';
      return 'behavior_interpretation';
    },
  },
  {
    type: 'excessive_giving',
    title: '付出失衡',
    subtitle: '你一个人在维持一段两个人的关系',
    keywords: SELF_ACTION_KW,
    threshold: 3,
    customDetect: (msgs) => {
      const self = countKeywordHits(msgs, SELF_ACTION_KW);
      const other = countKeywordHits(msgs, OTHER_ACTION_KW);
      if (self.count >= 3 && self.count > other.count * 2) {
        return self;
      }
      return null;
    },
    detectSubType: (msgs) => {
      const joined = msgs.join('');
      if (/他不珍惜|他不感激|他理所当然/.test(joined)) return 'unrecognized_giving';
      if (/我怕他不高兴|我怕他离开/.test(joined)) return 'fear_driven_giving';
      return 'habit_giving';
    },
  },
  {
    type: 'approval_seeking',
    title: '反复求证',
    subtitle: '你在找的答案，不在他那里',
    keywords: APPROVAL_SEEKING_KW,
    threshold: 2,
    detectSubType: (msgs) => {
      const joined = msgs.join('');
      if ((joined.match(/你觉得|你认为/g) || []).length >= 2) return 'ai_approval';
      if (/我问他|我要他说清楚/.test(joined)) return 'direct_approval';
      return 'indirect_approval';
    },
  },
  {
    type: 'self_blame',
    title: '习惯自责',
    subtitle: '你比任何人都对自己苛刻',
    keywords: SELF_BLAME_KW,
    threshold: 2,
    detectSubType: (msgs) => {
      const joined = msgs.join('');
      if (/我不够好|我比不上|我没资格/.test(joined)) return 'worth_doubt';
      if (/如果我当时|我早该/.test(joined)) return 'retrospective_blame';
      return 'reflex_blame';
    },
  },
  {
    type: 'ambiguity_tolerance',
    title: '困在模糊里',
    subtitle: '你在用"顺其自然"拖延一个你怕面对的答案',
    keywords: AMBIGUITY_KW,
    threshold: 3,
    customDetect: (msgs) => {
      const ambig = countKeywordHits(msgs, AMBIGUITY_KW);
      const joined = msgs.join('');
      const heCount = (joined.match(/他|她/g) || []).length;
      if (ambig.count >= 3 && heCount >= 5) return ambig;
      return null;
    },
    detectSubType: (msgs) => {
      const joined = msgs.join('');
      if (/算了/.test(joined) && /我主动|我发消息|我去找/.test(joined))
        return 'say_give_up_keep_trying';
      if (/我在等他|等他想清楚/.test(joined)) return 'waiting_clarity';
      return 'passive_tolerance';
    },
  },
  {
    type: 'boundary_weakness',
    title: '边界失守',
    subtitle: '你知道该怎么做，但每次都做不到',
    keywords: BOUNDARY_KW,
    threshold: 2,
    detectSubType: (msgs) => {
      const joined = msgs.join('');
      if (/刷他朋友圈|看他动态|翻聊天记录/.test(joined)) return 'digital_stalking';
      if (/主动联系|发消息|打电话/.test(joined)) return 'contact_impulse';
      return 'general_boundary';
    },
  },
];

// ============================================================
// 规则识别（纯同步，不调 AI）
// ============================================================

interface RawDetection {
  type: string;
  title: string;
  subtitle: string;
  sub_type: string | null;
  confidence: number;
  evidence_count: number;
  hit_examples: string[];
}

export interface PatternDebugLog {
  type: string;
  count: number;
  threshold: number;
  triggered: boolean;
  sampleHits: string[];
}

export function detectPatterns(
  messages: string[],
  debugLogs?: PatternDebugLog[]
): RawDetection[] {
  if (messages.length < 5) return [];

  const results: RawDetection[] = [];

  for (const rule of RULES) {
    let result: { count: number; hits: string[] } | null = null;

    if (rule.customDetect) {
      result = rule.customDetect(messages);
      // customDetect 返回 null 时也记日志
      if (!result) {
        const fallback = countKeywordHits(messages, rule.keywords);
        debugLogs?.push({
          type: rule.type,
          count: fallback.count,
          threshold: rule.threshold,
          triggered: false,
          sampleHits: fallback.hits.slice(0, 2),
        });
      }
    } else {
      const r = countKeywordHits(messages, rule.keywords);
      if (r.count >= rule.threshold) {
        result = r;
      } else {
        debugLogs?.push({
          type: rule.type,
          count: r.count,
          threshold: rule.threshold,
          triggered: false,
          sampleHits: r.hits.slice(0, 2),
        });
      }
    }

    if (!result) continue;

    debugLogs?.push({
      type: rule.type,
      count: result.count,
      threshold: rule.threshold,
      triggered: true,
      sampleHits: result.hits.slice(0, 2),
    });

    // 命中恰好 threshold → 0.6；每多 1 条 +0.1；上限 1.0
    const confidence = Math.min(1, 0.6 + (result.count - rule.threshold) * 0.1);

    results.push({
      type: rule.type,
      title: rule.title,
      subtitle: rule.subtitle,
      sub_type: rule.detectSubType(messages, result.hits),
      confidence: Math.round(confidence * 100) / 100,
      evidence_count: result.count,
      hit_examples: result.hits.slice(0, 5),
    });
  }

  return results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

// ============================================================
// AI 生成层
// ============================================================

const PATTERN_SYSTEM_PROMPT = `你是一个直白、温暖、不说废话的情感分析师。
你正在帮助用户理解自己的关系底层模式。

你的风格：
- 直白但不刻薄，像一个真正了解你的朋友在说真心话
- 基于用户说过的真实原话，有具体细节
- 结论前置，先说结论再解释原因
- 不用心理学术语，用普通人的语言
- 不说教，不许诺结果，不给空洞鼓励
- 禁止用感叹号
- 禁止出现：非常、很棒、了不起、加油、你真的、太好了
- 禁止出现任何 emoji 符号

重要原则：
你看到了用户说过的真实原话。
在 description 里要呼应这些原话的内容，
让用户感到"这说的就是我说过的那件事"。
但不要大段引用，只是自然地呼应核心意思。

输出格式：严格紧凑 JSON，不换行不缩进，不要任何前缀或解释。`;

const TYPE_USER_PROMPTS: Record<string, (subType: string | null, hits: string[], recent: string[]) => string> = {
  over_interpretation: (subType, hits, recent) => `这个用户有过度解读的关系模式。他们倾向于从对方行为或沉默中得出确定结论，把猜测当成事实，然后对那个"事实"做反应。

子类型：${subType}（silent_interpretation=主要解读对方的沉默和不回消息，word_interpretation=主要解读对方说的话，behavior_interpretation=主要解读对方的行为）

他们说过这些话（触发此模式的原句）：
${hits.map((e, i) => `${i + 1}. "${e}"`).join('\n')}

他们最近还说过：
${recent.slice(0, 8).join('\n')}

请生成以下 JSON：
{"description":"三段，每段之间用\\n\\n隔开。第一段：描述他们具体怎么解读（要呼应他们说过的话）。第二段：说清楚这个习惯的代价。第三段：给出一个新的角度。总字数150-250字。","real_cost":"这个模式让他们付出的代价，一句话，20-40字","suggestion":"一个具体的行动建议，40-80字","next_step":"今天可以做的最小一步，具体到动作，60-100字"}`,

  excessive_giving: (subType, hits, recent) => `这个用户有付出失衡的关系模式。做事的主语几乎总是他们自己，对方在描述里是被动的存在。

子类型：${subType}（unrecognized_giving=付出没有被看见，fear_driven_giving=因为害怕失去所以不停付出，habit_giving=已经是习惯了）

他们说过这些话：
${hits.map((e, i) => `${i + 1}. "${e}"`).join('\n')}

他们最近说过：
${recent.slice(0, 8).join('\n')}

请生成 JSON：
{"description":"三段，每段\\n\\n隔开。第一段：描述他们具体怎么在付出（从原话提炼）。第二段：说清楚这个失衡对关系动力学的影响。第三段：提出他们可能没想到的角度。总字数150-250字。","real_cost":"持续这样付出，他们失去的是什么，一句话，20-40字","suggestion":"帮他们让付出变得更有价值而不是更多的建议，40-80字","next_step":"最近可以做的一件小事，帮他们体验少主动一点的感觉，60-100字"}`,

  approval_seeking: (subType, hits, recent) => `这个用户有反复求证的关系模式。他们反复确认对方是否喜欢自己、是否还在意，每次得到答案安心一段时间然后又开始怀疑。

子类型：${subType}（ai_approval=经常向AI求证，direct_approval=直接逼问对方，indirect_approval=从对方行为间接推断）

他们说过这些话：
${hits.map((e, i) => `${i + 1}. "${e}"`).join('\n')}

他们最近说过：
${recent.slice(0, 8).join('\n')}

请生成 JSON：
{"description":"三段，每段\\n\\n隔开。第一段：描述他们具体怎么求证（呼应原话）。第二段：解释为什么这种求证是解决不了问题的循环。第三段：指出真正需要面对的不是对方的答案而是什么。总字数150-250字。","real_cost":"反复求证消耗了他们什么，一句话，20-40字","suggestion":"帮他们从找答案转向面对不确定的具体建议，40-80字","next_step":"下次想去求证时，可以先做的一件事，60-100字"}`,

  self_blame: (subType, hits, recent) => `这个用户有习惯自责的关系模式。不管发生什么，他们倾向于先在自己身上找原因。

子类型：${subType}（worth_doubt=觉得自己不够好，retrospective_blame=事后反复检讨，reflex_blame=条件反射式把错揽到自己身上）

他们说过这些话：
${hits.map((e, i) => `${i + 1}. "${e}"`).join('\n')}

他们最近说过：
${recent.slice(0, 8).join('\n')}

请生成 JSON：
{"description":"三段，每段\\n\\n隔开。第一段：描述他们自责的具体方式（从原话来）。第二段：分析这种模式背后的心理逻辑，用普通语言。第三段：帮他们看见对自己有多不公平。总字数150-250字。","real_cost":"这个习惯让他们付出的代价，一句话，20-40字","suggestion":"帮他们更公平地分配责任的具体建议，40-80字","next_step":"下次觉得是自己的错时，可以先做的一个动作，60-100字"}`,

  ambiguity_tolerance: (subType, hits, recent) => `这个用户有困在模糊里的关系模式。嘴上说算了，但行动上和情绪上都没有真的放下。

子类型：${subType}（say_give_up_keep_trying=嘴上说算了行动上没有，waiting_clarity=在等对方想清楚，passive_tolerance=被动接受模糊不去推动改变）

他们说过这些话：
${hits.map((e, i) => `${i + 1}. "${e}"`).join('\n')}

他们最近说过：
${recent.slice(0, 8).join('\n')}

请生成 JSON：
{"description":"三段，每段\\n\\n隔开。第一段：描述他们'算了但没算了'的具体表现（从原话找证据）。第二段：解释为什么模糊的关系特别消耗人。第三段：提出他们真正需要先想清楚的问题。总字数150-250字。","real_cost":"在模糊里耗着，他们失去了什么，一句话，20-40字","suggestion":"帮他们从模糊往清晰走一步的建议，40-80字","next_step":"今天可以做的一个小动作，帮他们往前走一点点，60-100字"}`,

  boundary_weakness: (subType, hits, recent) => `这个用户有边界失守的关系模式。他们清楚地知道不该做某些事，但每次到了那个时刻还是做了。

子类型：${subType}（digital_stalking=反复刷对方社交媒体或聊天记录，contact_impulse=忍不住主动联系，general_boundary=其他类型的边界失守）

他们说过这些话：
${hits.map((e, i) => `${i + 1}. "${e}"`).join('\n')}

他们最近说过：
${recent.slice(0, 8).join('\n')}

请生成 JSON：
{"description":"三段，每段\\n\\n隔开。第一段：描述他们失守的具体方式（从原话提炼）。第二段：解释为什么靠意志力忍是忍不住的，说心理机制不批评。第三段：指出真正需要处理的是冲动背后的需求。总字数150-250字。","real_cost":"每次失守之后，他们失去了什么，一句话，20-40字","suggestion":"一个比硬忍更可行的具体方法，40-80字","next_step":"下次冲动来时，可以立刻做的一件事，60-100字"}`,
};

// ============================================================
// 兜底文案
// ============================================================

const FALLBACK_CONTENT: Record<string, { description: string; real_cost: string; suggestion: string; next_step: string }> = {
  over_interpretation: {
    description: '你有一个习惯：从对方的行为或沉默里得出确定的结论，然后对那个结论做反应。\n\n问题不在于你想多了，而在于你把猜测当成了事实，然后开始对一个也许根本没发生的事情愤怒或委屈。\n\n他没回消息可能有很多原因。在你去确认之前，你不知道是哪一个。',
    real_cost: '你一半的痛苦，来自还没发生的事',
    suggestion: '下次出现"他肯定是"这个念头时，在后面加上"但我不确定"，然后决定要不要去直接问他。',
    next_step: '把最近让你开始解读的那件事写下来，只写发生了什么，不写你的解读，看看只剩下事实之后，你的感受有没有变化。',
  },
  excessive_giving: {
    description: '你说话时，做事的主语几乎都是你。你主动、你等、你准备、你想办法。\n\n一段关系里如果只有一个人在跑，跑的那个人会越来越累，而那个不动的人，也不会因此觉得你更值钱。\n\n更值得想的是：你为什么愿意一直是付出更多的那个人？是真的觉得对方值得，还是你怕如果停下来他就走了？',
    real_cost: '你在用消耗自己的方式维持一段关系',
    suggestion: '停止主动一周，不是为了测试他，是为了看清楚：没有你在推，这段关系还剩什么。',
    next_step: '今天不要主动联系。如果冲动来了，把想说的话写在备忘录里，不发出去，看看这一天结束时你感觉怎样。',
  },
  approval_seeking: {
    description: '你花了很多时间在确认同一件事：他到底喜不喜欢我。每次得到答案，安心几天，然后又开始怀疑。\n\n这个循环会一直转，不是因为你问的次数不够多，而是你要找的那个确定感，外部给不了你。\n\n如果一段关系需要你不停确认它是否存在，这段关系本身就已经给了你答案了。',
    real_cost: '你把大量时间和情绪，花在找一个给不了你的答案上',
    suggestion: '下次想去求证的时候，先问自己：就算他说"是"，我能安心多久？',
    next_step: '写下你最想从他那里得到的一句话，然后问自己：如果他永远不说这句话，我能接受吗？',
  },
  self_blame: {
    description: '不管发生了什么，你都会先想"是不是我的问题"。对方冷淡了——是不是我哪里不好？他没回消息——是不是我说错了什么？\n\n一段关系里发生的事，通常是两个人共同造成的。但你的叙述里，错的几乎总是你。这不公平，对你自己不公平。\n\n有时候，把错揽到自己身上是一种控制感——"如果是我的问题，我就能改"。但这个安全感，代价是你一直在亏待自己。',
    real_cost: '你习惯做那个道歉的人，哪怕不是你的错',
    suggestion: '下次想说"是我的问题"之前，先把他做了什么客观地写出来，然后再决定有没有你的责任。',
    next_step: '回想最近一次你向他道歉的场景，写下：他做了什么，你做了什么，责任的分配是不是真的像你以为的那样。',
  },
  ambiguity_tolerance: {
    description: '你说了很多次"算了"，但每次都回来了。说明那些算了都不是真的算了，只是把情绪暂时压下去了。\n\n模糊的关系让人难受，是因为它一直给你一个"也许"。"也许他只是最近忙"，"也许等一等就好了"。这个也许让你没办法彻底死心，也没办法真的轻松。\n\n真正的问题不是"他到底怎么想"，而是"我在等什么，等到什么时候"。',
    real_cost: '你在用等待，避免做一个让你害怕的决定',
    suggestion: '给自己设一个期限，不是为了逼他，是为了给自己一个框，期限到了你自己做决定。',
    next_step: '写下你在等的具体是什么，他做什么或说什么，你会觉得这段关系有了答案，这个问题的答案比继续等更有用。',
  },
  boundary_weakness: {
    description: '你说过不再主动，然后还是主动了。告诉自己不刷他朋友圈，但每天都在刷。你很清楚那些行为对你没好处，但每次到了那个时刻，还是做了。\n\n这不是意志力不够。靠忍是忍不住的，因为你在和一个更深的东西对抗——那个冲动背后有个需求还没被满足：确认他还在，或者只是想感觉自己还有一点控制权。\n\n不要靠忍，找到那个冲动在要什么，比每次硬忍更有用。',
    real_cost: '每次失守之后，你对自己的信任就少一点',
    suggestion: '不要设"我永远不再做XX"的目标，改成"这一次，我先等10分钟再说"。',
    next_step: '下次冲动来的时候，在做之前先写下：我现在感觉是什么，我想通过这个行为得到什么，写完再决定要不要做。',
  },
};

interface PatternContent {
  description: string;
  real_cost: string;
  suggestion: string;
  next_step: string;
}

function parsePatternJson(raw: string): PatternContent | null {
  try {
    let text = raw.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (
      typeof parsed.description === 'string' &&
      typeof parsed.real_cost === 'string' &&
      typeof parsed.suggestion === 'string' &&
      typeof parsed.next_step === 'string' &&
      parsed.description.length >= 10
    ) {
      return parsed as unknown as PatternContent;
    }
    return null;
  } catch {
    return null;
  }
}

export async function generatePatternContent(
  patternType: string,
  subType: string | null,
  hitExamples: string[],
  allRecentMessages: string[],
  aiClient: AIClient
): Promise<PatternContent> {
  const fallback = FALLBACK_CONTENT[patternType] ?? FALLBACK_CONTENT.over_interpretation!;
  const buildPrompt = TYPE_USER_PROMPTS[patternType];
  if (!buildPrompt) return fallback;

  try {
    const raw = await aiClient.complete({
      system: PATTERN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(subType, hitExamples, allRecentMessages) }],
      maxTokens: 1024,
      timeoutMs: 8000,
      jsonMode: true,
    });
    const parsed = parsePatternJson(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

// ============================================================
// 主入口
// ============================================================

export async function analyzeUserPatterns(
  pool: Pool,
  userId: string,
  aiClient: AIClient
): Promise<RelationshipPattern[]> {
  // 取最近 30 条 user 消息
  const client = await pool.connect();
  let messages: string[];
  try {
    const res = await client.query<{ content: string }>(
      `SELECT m.content FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1 AND m.role = 'user'
       ORDER BY m.created_at DESC LIMIT 30`,
      [userId]
    );
    messages = res.rows.map((r) => r.content);
  } finally {
    client.release();
  }

  if (messages.length < 5) return [];

  // 规则识别（附带 debug 日志供路由层输出）
  const debugLogs: PatternDebugLog[] = [];
  const detections = detectPatterns(messages, debugLogs);

  // 把 debug 信息挂到全局供路由层取（轻量 hack，避免改接口签名）
  (analyzeUserPatterns as { _lastDebug?: PatternDebugLog[] })._lastDebug = debugLogs;
  if (detections.length === 0) return [];

  // AI 并行生成（每个模式独立，一个失败不影响其它）
  const results = await Promise.all(
    detections.map(async (d): Promise<RelationshipPattern> => {
      const content = await generatePatternContent(
        d.type,
        d.sub_type,
        d.hit_examples,
        messages,
        aiClient
      );
      return {
        pattern_type: d.type,
        sub_type: d.sub_type,
        confidence: d.confidence,
        evidence_count: d.evidence_count,
        hit_examples: d.hit_examples,
        title: d.title,
        subtitle: d.subtitle,
        ...content,
      };
    })
  );

  return results;
}
