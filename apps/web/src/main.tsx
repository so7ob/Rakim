import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import { App } from "./App";
import "./styles.css";
import { AuthProvider } from "./auth/AuthContext";
import { SiteConfigProvider } from "./site/SiteConfigContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SiteConfigProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </SiteConfigProvider>
    </BrowserRouter>
  </StrictMode>,
);
