import { create } from 'zustand';
import {
  createPlan as apiCreatePlan,
  getPlanDetail as apiGetPlanDetail,
  getPlans as apiGetPlans,
  submitCheckin as apiSubmitCheckin,
  type RecoveryCheckin,
  type RecoveryPlan,
  type RecoveryPlanType,
  type RecoveryTodayTask,
} from '../api/recovery.js';

export type RecoveryStatus = 'idle' | 'loading' | 'success' | 'error';

interface RecoveryState {
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
  reset: () => void;
}

function pickActive(plans: RecoveryPlan[]): RecoveryPlan | null {
  return plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
}

export const useRecoveryStore = create<RecoveryState>((set, get) => ({
  plans: [],
  currentPlan: null,
  todayTask: null,
  checkins: [],
  status: 'idle',
  error: null,

  async fetchPlans() {
    set({ status: 'loading', error: null });
    try {
      const plans = await apiGetPlans();
      const active = pickActive(plans);
      set({
        plans,
        currentPlan: active,
        status: 'success',
        error: null,
      });
      if (active) {
        await get().fetchDetail(active.id);
      } else {
        set({ todayTask: null, checkins: [] });
      }
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '加载失败,请稍后再试',
      });
    }
  },

  async createPlan(planType) {
    set({ status: 'loading', error: null });
    try {
      const plan = await apiCreatePlan(planType);
      set((state) => ({
        plans: [plan, ...state.plans],
        currentPlan: plan,
        status: 'success',
        error: null,
      }));
      await get().fetchDetail(plan.id);
      return plan;
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '创建计划失败,请稍后再试',
      });
      return null;
    }
  },

  async fetchDetail(id) {
    try {
      const detail = await apiGetPlanDetail(id);
      set({
        currentPlan: detail.plan,
        todayTask: detail.todayTask,
        checkins: detail.checkins,
        status: 'success',
        error: null,
      });
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '加载计划详情失败',
      });
    }
  },

  async submitCheckin(id, payload) {
    try {
      const checkin = await apiSubmitCheckin(id, payload);
      set((state) => ({
        checkins: [checkin, ...state.checkins],
        status: 'success',
        error: null,
      }));
      // 拉取最新进度（current_day 已经在后端推进一格）
      await get().fetchDetail(id);
      return checkin;
    } catch (err) {
      // 即使失败（包括 409 ALREADY_CHECKED_IN）也重新拉取详情，
      // 保证页面状态和服务端一致：服务端已经把 current_day / checkins 推进的话，
      // 前端应同步看到「今日已完成」。
      try {
        await get().fetchDetail(id);
      } catch {
        /* ignore secondary fetch failure */
      }
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '打卡失败,请稍后再试',
      });
      return null;
    }
  },

  reset() {
    set({
      plans: [],
      currentPlan: null,
      todayTask: null,
      checkins: [],
      status: 'idle',
      error: null,
    });
  },
}));
