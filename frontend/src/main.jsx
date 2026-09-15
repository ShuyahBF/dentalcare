// main.jsx
// ----------
// Point d'entrée : monte l'application React dans #racine.

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { FournisseurAuth } from "./utils/authContexte.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("racine")).render(
  <React.StrictMode>
    <BrowserRouter>
      <FournisseurAuth>
        <App />
      </FournisseurAuth>
    </BrowserRouter>
  </React.StrictMode>
);
