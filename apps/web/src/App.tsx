import { Suspense } from "react";
import "./index.css";
import { LazyLandingPage, LazyRtcPage, LazyTestPage, LazyCallPage, LazyJoinSessionPage } from "./LazyLoading/LazyLoading";
import { BrowserRouter as Router, Routes, Route, } from "react-router";
import Loader from "./LazyLoading/Loader.tsx";
import { Toaster } from "react-hot-toast";
import { RtcSessionHost } from "./global/rtc/RtcSessionHost.tsx";

function App() {


  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />
      <Router>
        <RtcSessionHost />
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<LazyLandingPage />} />
            <Route path="/rtc" element={<LazyRtcPage />} />
            <Route path="/join" element={<LazyJoinSessionPage />} />
            <Route path="/join/:token" element={<LazyJoinSessionPage />} />
            <Route path="/test" element={<LazyTestPage />} />
            <Route path="/call" element={<LazyCallPage />} />

            <Route path="*" element={<div className="p-10 text-center text-red-500 font-bold">404 | Page Not Found</div>} />
          </Routes>
        </Suspense>
      </Router>
    </>
  );
}

export default App;
