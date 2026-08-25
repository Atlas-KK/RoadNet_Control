export interface NewEventNoticeState {
  knownIds: readonly string[];
  deferredIds: readonly string[];
}

/** 向下浏览时暂缓插入新事件；位于顶部时直接展示。 */
export function reconcileNewEventNotice(
  state: NewEventNoticeState,
  nextEventIds: readonly string[],
  scrollOffset: number,
): NewEventNoticeState {
  const known = new Set(state.knownIds);
  const incoming = nextEventIds.filter((eventId) => !known.has(eventId));
  if (scrollOffset <= 8) return { knownIds: [...nextEventIds], deferredIds: [] };
  return {
    knownIds: [...nextEventIds],
    deferredIds: [...new Set([...state.deferredIds, ...incoming])],
  };
}
