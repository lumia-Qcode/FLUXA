import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api.js";
import { useAuth } from "./auth/AuthContext";

const PresentationsContext = createContext(null);

export function PresentationsProvider({ children }) {
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api.listPresentations();
      setPresentations(data.presentations);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Decks belong to the signed-in organisation: load them only once someone is signed in,
  // so public pages (landing, shared links) never call the private API.
  const { account } = useAuth();
  const accountKey = account ? `${account.user.id}:${account.org.id}` : "";
  useEffect(() => {
    if (!accountKey) {
      setPresentations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
  }, [refresh, accountKey]);

  return (
    <PresentationsContext.Provider value={{ presentations, loading, error, refresh }}>
      {children}
    </PresentationsContext.Provider>
  );
}

export const usePresentations = () => useContext(PresentationsContext);
