import { resolveDecision } from './claudeCoach';

const facingBet = {
  legal: { canCheck: false, canRaise: true, minRaiseTo: 200, maxBetTo: 1000 },
};
const checkedTo = {
  legal: { canCheck: true, canRaise: true, minRaiseTo: 20, maxBetTo: 1000 },
};
const gs = { pot: 300, currentBet: 100, phase: 'flop', config: { bb: 20 } };

test('picks actions according to the mixed-strategy frequencies', () => {
  const strategy = { fold: 0, check: 0, call: 0.4, bet: 0, raise: 0.6, allin: 0 };
  expect(resolveDecision(strategy, 300, '', facingBet, gs, () => 0.1).action).toBe('raise');
  expect(resolveDecision(strategy, 300, '', facingBet, gs, () => 0.7).action).toBe('call');
  expect(resolveDecision(strategy, 300, '', facingBet, gs, () => 0.1).strategy).toEqual({ Raise: 60, Call: 40 });
});

test('maps illegal actions onto legal ones', () => {
  expect(resolveDecision({ fold: 1 }, 0, '', checkedTo, gs).action).toBe('check');
  expect(resolveDecision({ check: 1 }, 0, '', facingBet, gs).action).toBe('fold');
  expect(resolveDecision({ call: 1 }, 0, '', checkedTo, gs).action).toBe('check');
  expect(resolveDecision({ bet: 1 }, 400, '', facingBet, gs).action).toBe('raise');
});

test('clamps bet sizes and converts oversize bets to all-in', () => {
  expect(resolveDecision({ raise: 1 }, 50, '', facingBet, gs).amount).toBe(200);
  expect(resolveDecision({ raise: 1 }, 5000, '', facingBet, gs).action).toBe('allin');
  const noRaise = { legal: { ...facingBet.legal, canRaise: false } };
  expect(resolveDecision({ raise: 1 }, 400, '', noRaise, gs).action).toBe('allin');
});

test('falls back to the sizing label when no amount is given', () => {
  // 100 already bet + 2/3 of a 300 pot
  expect(resolveDecision({ bet: 1 }, 0, '2/3 pot', checkedTo, gs).amount).toBe(300);
  expect(resolveDecision({ bet: 1 }, 0, '3x BB', checkedTo, { ...gs, phase: 'preflop' }).amount).toBe(60);
});

test('empty strategy defaults to check or fold', () => {
  expect(resolveDecision({}, 0, '', checkedTo, gs).action).toBe('check');
  expect(resolveDecision(null, 0, '', facingBet, gs).action).toBe('fold');
});
