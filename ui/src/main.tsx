import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, createHashRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { ProviderAvviso } from "./componenti/Avviso";
import "./index.css";

// Build della demo (npm run build:demo): il servizio e' finto, dentro il browser (src/demo), e il router usa
// l'indirizzo con # perche' la pagina sta su GitHub Pages, senza un server che riscriva i percorsi.
const demo = import.meta.env.VITE_DEMO === "1";
if (demo) {
  const { installaDemo } = await import("./demo/installa");
  installaDemo();
  document.title = "Contabilità · demo";
}

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
const router = (demo ? createHashRouter : createBrowserRouter)([
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
