import { Platform } from "react-native";
import { androidBlockingAdapter } from "./android-blocking-adapter";
import type { FocusBlockingAdapter } from "./blocking-adapter";
import { iosBlockingAdapter } from "./ios-blocking-adapter";

/** The blocking adapter of this device. */
export function getFocusBlockingAdapter(): FocusBlockingAdapter {
  return Platform.OS === "android" ? androidBlockingAdapter : iosBlockingAdapter;
}
