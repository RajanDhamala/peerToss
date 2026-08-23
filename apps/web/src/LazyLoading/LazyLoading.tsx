
import { lazy } from "react";

export const LazyLandingPage = lazy(() => import("../Pages/LandingPage.tsx"));
export const LazyRtcPage = lazy(() => import("../Pages/RtcPage.tsx"));
export const LazyTestPage = lazy(() => import("../Pages/Testpage.tsx"));

