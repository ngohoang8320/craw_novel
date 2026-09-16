import { Button } from "./Button";

interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <Button size="sm" onClick={onToggle} title="Toggle light/dark theme">
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </Button>
  );
}
