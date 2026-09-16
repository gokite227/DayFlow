import { Text, View } from "react-native";
import { TAB_META } from "@/features/navigation/tab-navigation";
import { MAIN_TAB_COUNT, TAB_SCREENS, moveBottomTab, setBottomTab } from "@/features/settings/settings-model";
import { useSettings } from "@/features/settings/settings-provider";
import { Button, Card, Chip, Screen, SectionHeader, layout, useTextStyles } from "@/ui/components";

/** Settings > 하단 탭 설정: four slots (screen + order); Settings stays the fixed fifth tab. */
export default function BottomTabSettingsScreen() {
  const text = useTextStyles();
  const { settings, update, reset } = useSettings();
  const tabs = settings.bottomTabs;

  return (
    <Screen>
      <Text style={text.muted}>
        아래 탭 {MAIN_TAB_COUNT}칸에 둘 화면과 순서를 고를 수 있어요. 이미 다른 칸에 있는 화면을 고르면 두 칸이 서로 바뀌어요. Settings는 항상 마지막에 있어요.
      </Text>
      {tabs.map((current, index) => (
        <Card key={`${index}:${current}`}>
          <SectionHeader
            title={`${index + 1}. ${TAB_META[current].title}`}
            action={
              <View style={layout.row}>
                <Button label="↑" small variant="secondary" accessibilityLabel={`${index + 1}번째 탭 위로`} disabled={index === 0} onPress={() => update({ bottomTabs: moveBottomTab(tabs, index, -1) })} />
                <Button
                  label="↓"
                  small
                  variant="secondary"
                  accessibilityLabel={`${index + 1}번째 탭 아래로`}
                  disabled={index === tabs.length - 1}
                  onPress={() => update({ bottomTabs: moveBottomTab(tabs, index, 1) })}
                />
              </View>
            }
          />
          <View style={layout.rowWrap}>
            {TAB_SCREENS.map((screen) => (
              <Chip key={screen} label={TAB_META[screen].title} selected={screen === current} onPress={() => update({ bottomTabs: setBottomTab(tabs, index, screen) })} />
            ))}
          </View>
        </Card>
      ))}
      <Card>
        <Text style={text.body}>5. Settings (고정)</Text>
      </Card>
      <Button label="기본값으로 초기화" variant="secondary" onPress={() => reset(["bottomTabs"])} />
    </Screen>
  );
}