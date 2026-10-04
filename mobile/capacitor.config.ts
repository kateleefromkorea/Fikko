import type { CapacitorConfig } from "@capacitor/cli";

// The native iOS and Android shells load the mobile build from dist/.
const config: CapacitorConfig = {
  appId: "io.fikko.app",
  appName: "Fikko",
  webDir: "dist",
  ios: { contentInset: "never" },
  android: { backgroundColor: "#F6F7F8" },
};

export default config;
