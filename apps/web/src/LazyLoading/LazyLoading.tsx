import { lazy } from "react";

export const LazyLandingPage = lazy(() => import("../Pages/LandingPage.tsx"));
export const LazyRtcPage = lazy(() => import("../Pages/RtcPage.tsx"));
export const LazyTestPage = lazy(() => import("../Pages/Testpage.tsx"));
export const LazyCallPage = lazy(() => import("../Pages/CallPage.tsx"));
export const LazyJoinSessionPage = lazy(() => import("../Pages/JoinSessionPage.tsx"));
