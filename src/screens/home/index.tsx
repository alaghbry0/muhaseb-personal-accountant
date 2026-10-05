import type { Component } from "react";
import HomeScreen from "./home";
import GlobalSearchScreen from "./global-search";

/** شاشات وحدة الرئيسية */
export const screens: Record<string, Component> = {
  home: HomeScreen,
  "global-search": GlobalSearchScreen,
};
