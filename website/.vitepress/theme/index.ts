import DefaultTheme from "vitepress/theme";
import C4xShell from "./components/C4xShell.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: C4xShell,
};
