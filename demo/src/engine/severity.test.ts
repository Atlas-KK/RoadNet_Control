import { describe, expect, it } from 'vitest';
import { assessSeverity } from './severity';

describe('severity', () => {
  it('危化品叠加隧道判为特别重大', () => {
    expect(assessSeverity({ lanesTotal: 3, lanesClosed: 2, hazmat: true, inTunnel: true, congested: false }).level).toBe('特别重大');
  });

  it('全幅占道判为重大', () => {
    expect(assessSeverity({ lanesTotal: 3, lanesClosed: 3, inTunnel: false, congested: false }).level).toBe('重大');
  });

  it('占道三分之二判为较大', () => {
    expect(assessSeverity({ lanesTotal: 3, lanesClosed: 2, inTunnel: false, congested: false }).level).toBe('较大');
  });

  it('单车道占用且不拥堵判为一般', () => {
    expect(assessSeverity({ lanesTotal: 3, lanesClosed: 1, inTunnel: false, congested: false }).level).toBe('一般');
  });
});
