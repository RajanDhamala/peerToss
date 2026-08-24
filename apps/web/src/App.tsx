import { Suspense } from "react";
import "./index.css";
import { LazyLandingPage, LazyRtcPage, LazyTestPage, } from "./LazyLoading/LazyLoading";
import { BrowserRouter as Router, Routes, Route, } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import queryClient from "./Utils/QueryConfig.tsx";
import Loader from "./LazyLoading/Loader.tsx";
import { Toaster } from "react-hot-toast";

function App() {


  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" reverseOrder={false} />
      <Router>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<LazyLandingPage />} />
            <Route path="/rtc" element={<LazyRtcPage />} />
            <Route path="/test" element={<LazyTestPage />} />


            <Route path="*" element={<div className="p-10 text-center text-red-500 font-bold">404 | Page Not Found</div>} />
          </Routes>
        </Suspense>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
