import { Stack, useLocalSearchParams } from "expo-router";
import { OPEN_SCREEN_PARAM } from "@/features/navigation/app-routes";
import { TAB_META, isTabScreen } from "@/features/navigation/tab-navigation";
import CalendarScreen from "@/screens/calendar-screen";
import DaysScreen from "@/screens/days-screen";
import EventsScreen from "@/screens/events-screen";
import FocusScreen from "@/screens/focus-screen";
import GoalsScreen from "@/screens/goals-screen";
import RecoveryScreen from "@/screens/recovery-screen";
import ReviewScreen from "@/screens/review-screen";
import TodayScreen from "@/screens/today-screen";
import { EmptyState, Screen } from "@/ui/components";

const SCREENS = {
  today: TodayScreen,
  days: DaysScreen,
  calendar: CalendarScreen,
  events: EventsScreen,
  goals: GoalsScreen,
  review: ReviewScreen,
  recovery: RecoveryScreen,
  focus: FocusScreen,
} as const;

/**
 * A top-level screen that is not in the tab bar, opened on the stack with a back button. The segment is
 * `[feature]`, not `[screen]`: `screen` is a reserved navigation param and would be dropped (see app-routes).
 */
export default function OpenScreen() {
  const params = useLocalSearchParams<{ [OPEN_SCREEN_PARAM]: string }>();
  const feature = params[OPEN_SCREEN_PARAM];
  if (!isTabScreen(feature)) {
    return (
      <Screen>
        <EmptyState>화면을 찾을 수 없어요.</EmptyState>
      </Screen>
    );
  }
  const Component = SCREENS[feature];
  return (
    <>
      <Stack.Screen options={{ title: TAB_META[feature].title }} />
      <Component />
    </>
  );
}
