import { Tabs, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { Text, type ColorValue } from "react-native";
import { TAB_META, fallbackRouteForTabs, hiddenTabScreens, visibleTabRoutes } from "@/features/navigation/tab-navigation";
import { useSettings } from "@/features/settings/settings-provider";
import { usePalette } from "@/ui/theme";

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 20, lineHeight: 24 }}>{glyph}</Text>;
}

/**
 * Bottom tabs: four user-chosen screens + Settings (always last). Every screen stays registered; the
 * settings only hide tab buttons, and links to hidden screens open a stacked copy (see screenLink).
 */
export default function TabsLayout() {
  const { settings } = useSettings();
  const palette = usePalette();
  const pathname = usePathname();
  const router = useRouter();
  const visible = visibleTabRoutes(settings.bottomTabs);

  useEffect(() => {
    const fallback = fallbackRouteForTabs(pathname, settings.bottomTabs);
    if (fallback) router.replace(fallback);
  }, [pathname, router, settings.bottomTabs]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textSecondary,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        headerStyle: { backgroundColor: palette.background },
        headerShadowVisible: false,
        headerTintColor: palette.text,
        sceneStyle: { backgroundColor: palette.background },
      }}
    >
      {visible.map((route) => (
        <Tabs.Screen
          key={route}
          name={route}
          options={{ title: TAB_META[route].title, tabBarIcon: ({ color }) => <TabIcon glyph={TAB_META[route].glyph} color={color} /> }}
        />
      ))}
      {hiddenTabScreens(settings.bottomTabs).map((route) => (
        <Tabs.Screen key={route} name={route} options={{ title: TAB_META[route].title, href: null }} />
      ))}
    </Tabs>
  );
}