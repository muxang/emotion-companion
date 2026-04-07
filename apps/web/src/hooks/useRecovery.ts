import { useRecoveryStore } from '../stores/recoveryStore.js';
import type { RecoveryStatus } from '../stores/recoveryStore.js';
import type {
  RecoveryCheckin,
  RecoveryPlan,
  RecoveryPlanType,
  RecoveryTodayTask,
} from '../api/recovery.js';

/**
 * 恢复计划 Hook：封装 recoveryStore，组件通过细粒度订阅减少重渲染。
 */
export function useRecovery(): {
  plans: RecoveryPlan[];
  currentPlan: RecoveryPlan | null;
  todayTask: RecoveryTodayTask | null;
  checkins: RecoveryCheckin[];
  status: RecoveryStatus;
  error: string | null;
  fetchPlans: () => Promise<void>;
  createPlan: (planType: RecoveryPlanType) => Promise<RecoveryPlan | null>;
  fetchDetail: (id: string) => Promise<void>;
  submitCheckin: (
    id: string,
    payload: { mood_score: number; reflection?: string }
  ) => Promise<RecoveryCheckin | null>;
} {
  const plans = useRecoveryStore((s) => s.plans);
  const currentPlan = useRecoveryStore((s) => s.currentPlan);
  const todayTask = useRecoveryStore((s) => s.todayTask);
  const checkins = useRecoveryStore((s) => s.checkins);
  const status = useRecoveryStore((s) => s.status);
  const error = useRecoveryStore((s) => s.error);
  const fetchPlans = useRecoveryStore((s) => s.fetchPlans);
  const createPlan = useRecoveryStore((s) => s.createPlan);
  const fetchDetail = useRecoveryStore((s) => s.fetchDetail);
  const submitCheckin = useRecoveryStore((s) => s.submitCheckin);

  return {
    plans,
    currentPlan,
    todayTask,
    checkins,
    status,
    error,
    fetchPlans,
    createPlan,
    fetchDetail,
    submitCheckin,
  };
}
