import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HotelApp } from "./HotelApp";
import "./base.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <HotelApp />
  </StrictMode>,
);
