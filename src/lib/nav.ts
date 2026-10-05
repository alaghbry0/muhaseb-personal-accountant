/**
 * مخزن التنقل — zustand
 * SPA بشاشات مكدسة لكل تبويب: push/pop/popToRoot/setTab + تتبع اتجاه الحركة للأنيميشن.
 * الشاشة الجذرية لكل تبويب (SRS §6.4): home | sales-pos | inventory-products | reports-gallery | more
 */
import { create } from "zustand"

export type TabId = "home" | "sales" | "inventory" | "reports" | "more"

export interface ScreenRef {
  screen: string
  params?: Record<string, unknown>
}

export type NavAction = "push" | "pop" | "tab" | "root"

export const TAB_ROOTS: Record<TabId, string> = {
  home: "home",
  sales: "sales-pos",
  inventory: "inventory-products",
  reports: "reports-gallery",
  more: "more",
}

const TAB_IDS: TabId[] = ["home", "sales", "inventory", "reports", "more"]

function initialStacks(): Record<TabId, ScreenRef[]> {
  const stacks = {} as Record<TabId, ScreenRef[]>
  for (const t of TAB_IDS) stacks[t] = [{ screen: TAB_ROOTS[t] }]
  return stacks
}

interface NavState {
  activeTab: TabId
  stacks: Record<TabId, ScreenRef[]>
  /** اتجاه آخر حركة — يحدد اتجاه الانزلاق في AnimatePresence */
  direction: NavAction
  /** عدّاد يزيد مع كل انتقال — مفتاح الأنيميشن */
  seq: number
  push: (screen: string, params?: Record<string, unknown>) => void
  replace: (screen: string, params?: Record<string, unknown>) => void
  pop: () => void
  popToRoot: (tab?: TabId) => void
  setTab: (tab: TabId) => void
  current: () => ScreenRef
  canPop: () => boolean
}

export const useNav = create<NavState>((set, get) => ({
  activeTab: "home",
  stacks: initialStacks(),
  direction: "root",
  seq: 0,

  push: (screen, params) => {
    const { activeTab, stacks } = get()
    if (stacks[activeTab].at(-1)?.screen === screen && !params) return
    set((s) => ({
      stacks: { ...s.stacks, [activeTab]: [...s.stacks[activeTab], { screen, params }] },
      direction: "push",
      seq: s.seq + 1,
    }))
  },

  replace: (screen, params) => {
    const { activeTab } = get()
    set((s) => {
      const stack = [...s.stacks[activeTab]]
      stack[stack.length - 1] = { screen, params }
      return { stacks: { ...s.stacks, [activeTab]: stack }, direction: "push", seq: s.seq + 1 }
    })
  },

  pop: () => {
    const { activeTab, stacks } = get()
    if (stacks[activeTab].length <= 1) return
    set((s) => {
      const stack = s.stacks[activeTab].slice(0, -1)
      return { stacks: { ...s.stacks, [activeTab]: stack }, direction: "pop", seq: s.seq + 1 }
    })
  },

  popToRoot: (tab) => {
    const target = tab ?? get().activeTab
    set((s) => ({
      stacks: { ...s.stacks, [target]: [{ screen: TAB_ROOTS[target] }] },
      direction: "pop",
      seq: s.seq + 1,
    }))
  },

  setTab: (tab) => {
    if (get().activeTab === tab) {
      // ضغط التبويب الحالي = العودة للجذر
      get().popToRoot(tab)
      set({ activeTab: tab })
      return
    }
    set((s) => ({ activeTab: tab, direction: "tab", seq: s.seq + 1 }))
  },

  current: () => {
    const { activeTab, stacks } = get()
    return stacks[activeTab].at(-1) ?? { screen: TAB_ROOTS[activeTab] }
  },

  canPop: () => get().stacks[get().activeTab].length > 1,
}))

/** إجراءات مساعدة خارج المكونات */
export const nav = {
  push: (screen: string, params?: Record<string, unknown>) => useNav.getState().push(screen, params),
  pop: () => useNav.getState().pop(),
  setTab: (tab: TabId) => useNav.getState().setTab(tab),
  popToRoot: (tab: TabId) => useNav.getState().popToRoot(tab),
}
