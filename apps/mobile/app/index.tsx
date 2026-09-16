import { Redirect } from "expo-router";
import { useAuthState } from "@/features/auth/use-auth";

export default function Index() {
  const auth = useAuthState();
  return <Redirect href={auth.status === "signedIn" ? "/today" : "/login"} />;
}
