import { describe, expect, it } from 'vitest';
import { explainBlockedMove, revealReadySet, runUntilInteresting, suggestMove } from './coaching';
import { applyAction, classifyOperation, replay } from '../engine/replay';
import { getLevel } from '../levels/levels';
import { expectApplied, expectState, placeIds } from '../test/factories';

describe('coaching', () => {
  it('stops when two legal operations share minimum earliestStart', () => {
    const state = expectState(
      replay(getLevel('fill-the-pipe'), placeIds('F:0:0', 'F:0:1', 'F:0:2', 'F:1:0')),
    );

    expect(runUntilInteresting(state)).toEqual({
      state,
      applied: [],
      stop: {
        kind: 'choice',
        operationIds: ['B:1:0', 'F:1:1'],
        earliestStart: 2,
      },
    });
  });

  it('stops before a dependency-forced gap', () => {
    const state = expectState(replay(getLevel('dependency-chain'), placeIds('F:0:0')));

    expect(runUntilInteresting(state).stop).toMatchObject({
      kind: 'dependency-gap',
      operationId: 'F:1:0',
      start: 1,
      rankFrontier: 0,
    });
  });

  it('stops when a dependency-ready operation is memory-blocked', () => {
    const state = expectState(replay(getLevel('memory-wall'), placeIds('F:0:0', 'F:0:1', 'F:0:2')));

    expect(runUntilInteresting(state).stop).toMatchObject({
      kind: 'memory-boundary',
      operationIds: ['F:0:3'],
    });
  });

  it('never suggests a blocked move', () => {
    const state = expectState(
      replay(getLevel('fill-the-pipe'), placeIds('F:0:0', 'F:0:1', 'F:1:0')),
    );

    const suggestion = suggestMove(state);
    expect(suggestion).not.toBeNull();
    if (suggestion === null) {
      return;
    }

    expect(classifyOperation(state, suggestion.operationId).status).toBe('legal');
  });

  it('reveals the legal ready set sorted by earliestStart then operation ID', () => {
    const state = expectState(
      replay(getLevel('fill-the-pipe'), placeIds('F:0:0', 'F:0:1', 'F:0:2', 'F:1:0')),
    );

    expect(revealReadySet(state)).toEqual([
      { operationId: 'B:1:0', earliestStart: 2, projectedMemory: 0 },
      { operationId: 'F:1:1', earliestStart: 2, projectedMemory: 2 },
      { operationId: 'F:1:2', earliestStart: 3, projectedMemory: 2 },
    ]);
  });

  it('explains completed, legal, and every blocked reason without mutating state', () => {
    const initial = expectState(replay(getLevel('dependency-chain'), []));
    const afterForward = expectState(replay(getLevel('dependency-chain'), placeIds('F:0:0')));
    const snapshot = JSON.parse(JSON.stringify(initial));

    expect(explainBlockedMove(afterForward, 'F:0:0')).toEqual({
      status: 'completed',
      operationId: 'F:0:0',
      placement: afterForward.placementById['F:0:0'],
    });

    expect(explainBlockedMove(afterForward, 'F:1:0')).toEqual({
      status: 'legal',
      operationId: 'F:1:0',
      earliestStart: 1,
      projectedMemory: 1,
    });

    expect(explainBlockedMove(initial, 'B:0:0')).toEqual({
      status: 'blocked',
      operationId: 'B:0:0',
      explanations: [
        {
          kind: 'dependency-not-finished',
          reason: { kind: 'dependency-not-finished', operationId: 'F:0:0' },
          message: 'Needs F:0:0 to finish first.',
        },
        {
          kind: 'dependency-not-finished',
          reason: { kind: 'dependency-not-finished', operationId: 'B:1:0' },
          message: 'Needs B:1:0 to finish first.',
        },
      ],
    });

    expect(JSON.parse(JSON.stringify(initial))).toEqual(snapshot);
  });

  it('includes memory-cap blocker explanations for every blocked reason', () => {
    const state = expectState(replay(getLevel('memory-wall'), placeIds('F:0:0', 'F:0:1', 'F:0:2')));

    expect(explainBlockedMove(state, 'F:0:3')).toEqual({
      status: 'blocked',
      operationId: 'F:0:3',
      explanations: [
        {
          kind: 'memory-cap',
          reason: { kind: 'memory-cap', rank: 0, resident: 3, requested: 1, cap: 3 },
          message: 'Rank 0 is at memory cap 3/3 and cannot place another forward activation.',
        },
      ],
    });
  });

  it('is deterministic about the first stable legal suggestion and returns null when nothing is ready', () => {
    const state = expectState(
      replay(getLevel('fill-the-pipe'), placeIds('F:0:0', 'F:0:1', 'F:0:2', 'F:1:0')),
    );
    const complete = expectState(
      replay(getLevel('dependency-chain'), placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0')),
    );

    expect(suggestMove(state)).toEqual({
      operationId: 'B:1:0',
      earliestStart: 2,
      projectedMemory: 0,
      reason: {
        kind: 'rank-frontier',
        rank: 1,
        rankFrontier: 2,
        message: 'This move can start immediately at rank 1 frontier 2.',
      },
    });
    expect(suggestMove(state)).toEqual(suggestMove(state));
    expect(suggestMove(complete)).toBeNull();
  });

  it('prefers the memory boundary over later choice analysis', () => {
    const state = expectState(
      replay(
        getLevel('memory-wall'),
        placeIds('F:0:0', 'F:0:1', 'F:0:2', 'F:1:0', 'F:1:1', 'F:2:0'),
      ),
    );

    expect(runUntilInteresting(state).stop).toEqual({
      kind: 'memory-boundary',
      operationIds: ['F:0:3'],
    });
  });

  it('automates only unambiguous place actions and the returned state replays from the applied log', () => {
    const start = expectState(replay(getLevel('dependency-chain'), []));
    const automated = runUntilInteresting(start);
    const replayed = expectState(replay(getLevel('dependency-chain'), automated.applied));

    expect(automated.applied).toEqual([{ type: 'place', operationId: 'F:0:0' }]);
    expect(automated.stop).toEqual({
      kind: 'dependency-gap',
      operationId: 'F:1:0',
      start: 1,
      rankFrontier: 0,
    });
    expect(automated.applied.every((action) => action.type === 'place')).toBe(true);
    expect(replayed).toEqual(automated.state);
  });

  it('stops with would-complete before placing the final remaining operation', () => {
    const state = expectState(
      replay(getLevel('dependency-chain'), placeIds('F:0:0', 'F:1:0', 'B:1:0')),
    );

    expect(runUntilInteresting(state)).toEqual({
      state,
      applied: [],
      stop: {
        kind: 'would-complete',
        operationId: 'B:0:0',
      },
    });
  });

  it('returns frozen coaching structures', () => {
    const state = expectState(
      replay(getLevel('fill-the-pipe'), placeIds('F:0:0', 'F:0:1', 'F:0:2', 'F:1:0')),
    );

    const ready = revealReadySet(state);
    const suggestion = suggestMove(state);
    const explanation = explainBlockedMove(state, 'F:1:2');
    const automated = runUntilInteresting(expectState(replay(getLevel('dependency-chain'), [])));

    expect(Object.isFrozen(ready)).toBe(true);
    expect(Object.isFrozen(ready[0]!)).toBe(true);
    expect(Object.isFrozen(suggestion)).toBe(true);
    expect(suggestion !== null && Object.isFrozen(suggestion.reason)).toBe(true);
    expect(Object.isFrozen(explanation)).toBe(true);
    expect(explanation.status !== 'blocked' || Object.isFrozen(explanation.explanations)).toBe(
      true,
    );
    expect(Object.isFrozen(automated)).toBe(true);
    expect(Object.isFrozen(automated.applied)).toBe(true);
    expect(Object.isFrozen(automated.stop)).toBe(true);
  });

  it('does not mutate input state while computing coaching surfaces', () => {
    const state = expectState(replay(getLevel('fill-the-pipe'), placeIds('F:0:0', 'F:0:1')));
    const snapshot = JSON.parse(JSON.stringify(state));

    revealReadySet(state);
    suggestMove(state);
    explainBlockedMove(state, 'B:0:0');
    runUntilInteresting(state);

    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('expectApplied throws the engine reason kind when an action is rejected', () => {
    const state = expectState(replay(getLevel('dependency-chain'), []));

    expect(() =>
      expectApplied(applyAction(state, { type: 'place', operationId: 'B:0:0' })),
    ).toThrow('dependency-not-finished');
  });
});
