import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./ui.css?v=2"
import "./mobile.css";

if (import.meta?.env?.MODE === "production") {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  // console.warn still prints (unless you also silence it)
  // console.error still prints
}


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
