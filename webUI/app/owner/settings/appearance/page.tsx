"use client";

import { ThemeFamilyPicker, ThemeModePicker } from "@/components/settings/appearance-controls";
import { SettingsSection } from "../_components/settings-section";

export default function AppearanceSettingsPage() {
  return (
    <div className="grid gap-5">
      <SettingsSection
        title="Theme"
        description="Choose how Priddyspaces looks for you. This is a personal setting — it follows your account across devices and doesn't change what your members or team see."
      >
        <ThemeFamilyPicker />
      </SettingsSection>

      <SettingsSection
        title="Appearance mode"
        description="Use a light or dark appearance, or follow your device setting automatically."
      >
        <ThemeModePicker />
      </SettingsSection>
    </div>
  );
}
