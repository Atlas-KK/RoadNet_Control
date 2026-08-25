import { SIMULATED_USERS } from '../monitoring/permissions';
import { useMonitoringStore } from '../monitoring/store';

export default function SimulatedUserSwitcher() {
  const currentUserId = useMonitoringStore((state) => state.currentUserId);
  const setCurrentUser = useMonitoringStore((state) => state.setCurrentUser);
  return (
    <label className="simulated-user-switcher flex items-center gap-1.5 text-[10px] text-[var(--color-ink-soft)]">
      <span className="whitespace-nowrap">模拟身份</span>
      <select
        aria-label="模拟身份"
        value={currentUserId}
        onChange={(event) => setCurrentUser(event.target.value)}
        className="h-6 rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1.5 text-[11px] text-[var(--color-ink)]"
      >
        {SIMULATED_USERS.map((user) => (
          <option key={user.userId} value={user.userId}>{user.displayName}</option>
        ))}
      </select>
    </label>
  );
}
