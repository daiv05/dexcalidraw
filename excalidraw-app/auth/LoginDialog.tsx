import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";

import { useAtom } from "../app-jotai";

import { loginDialogOpenAtom } from "./auth-atoms";
import { useAuth } from "./useAuth";

import "./LoginDialog.scss";

export const LoginDialog = () => {
  const [open, setOpen] = useAtom(loginDialogOpenAtom);
  const { loginWithGoogle } = useAuth();

  if (!open) {
    return null;
  }

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
      setOpen(false);
    } catch (err) {
      console.error("Google login failed:", err);
    }
  };

  return (
    <Dialog
      onCloseRequest={() => setOpen(false)}
      title="Iniciar sesión"
      size="small"
    >
      <div className="LoginDialog">
        <p className="LoginDialog__desc">
          Inicia sesión para guardar y gestionar tus escenas desde cualquier
          dispositivo.
        </p>
        <FilledButton
          size="large"
          label="Continuar con Google"
          onClick={handleGoogleLogin}
        />
      </div>
    </Dialog>
  );
};
