import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { ProviderAvviso } from "./componenti/Avviso";
import "./index.css";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      // il servizio e' sulla rete locale: se non risponde una volta, insistere
      // in automatico ha poco senso, meglio il tasto "Riprova" a vista
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Router "dei dati" (createBrowserRouter + RouterProvider): offre useBlocker,
// utile per avvisare delle modifiche non salvate su ogni uscita dal modulo.
// Un'unica rotta "*" contiene tutta l'app: le rotte vere sono in App.tsx.
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <ProviderAvviso>
        <App />
      </ProviderAvviso>
    ),
  },
]);

const contenitore = document.getElementById("root");
if (!contenitore) throw new Error("Manca #root in index.html");

createRoot(contenitore).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
