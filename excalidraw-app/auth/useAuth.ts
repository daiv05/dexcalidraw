import { useEffect } from "react";

import { useAtom } from "../app-jotai";
import { getPb } from "../data/pocketbase";

import { authLoadingAtom, currentUserAtom } from "./auth-atoms";

import type { RecordModel } from "pocketbase";

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useAtom(currentUserAtom);
  const [, setAuthLoading] = useAtom(authLoadingAtom);

  useEffect(() => {
    const pb = getPb();
    if (pb.authStore.isValid) {
      setCurrentUser(pb.authStore.model as RecordModel);
    }
    setAuthLoading(false);

    const unsubscribe = pb.authStore.onChange((_token, model) => {
      setCurrentUser(model as RecordModel | null);
    });

    return () => unsubscribe();
  }, [setCurrentUser, setAuthLoading]);

  const loginWithGoogle = async () => {
    const pb = getPb();
    const auth = await pb
      .collection("users")
      .authWithOAuth2({ provider: "google" });
    setCurrentUser(auth.record);
    return auth.record;
  };

  const logout = () => {
    const pb = getPb();
    pb.authStore.clear();
    setCurrentUser(null);
  };

  return { currentUser, loginWithGoogle, logout };
};
