import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { useEffect, useState } from "react";

import { useAtom, useAtomValue, useSetAtom } from "../app-jotai";
import { currentUserAtom, loginDialogOpenAtom } from "../auth/auth-atoms";
import { getCollaborationLink, getCollaborationLinkData } from "../data";
import {
  deleteUserScene,
  loadUserScenes,
  saveUserScene,
  updateUserSceneName,
} from "../data/pocketbase";

import { sceneManagerOpenAtom } from "./scene-atoms";

import "./SceneManagerDialog.scss";

import type { CollabAPI } from "../collab/Collab";
import type { UserScene } from "../data/pocketbase";

// Setting location.hash fires hashchange natively — no manual dispatchEvent needed.
const navigateToRoom = (roomId: string, roomKey: string) => {
  window.location.hash = `room=${roomId},${roomKey}`;
};

interface SceneItemProps {
  scene: UserScene;
  onOpen: (scene: UserScene) => void;
  onRename: (scene: UserScene, newName: string) => void;
  onDelete: (scene: UserScene) => void;
}

const SceneItem = ({ scene, onOpen, onRename, onDelete }: SceneItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(scene.name);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== scene.name) {
      onRename(scene, trimmed);
    } else {
      setDraftName(scene.name);
    }
    setEditing(false);
  };

  const date = scene.last_visited_at
    ? new Date(scene.last_visited_at).toLocaleDateString("es-ES")
    : "";

  return (
    <div className="SceneItem">
      <div className="SceneItem__info">
        {editing ? (
          <input
            className="SceneItem__nameInput"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitRename();
              }
              if (e.key === "Escape") {
                setDraftName(scene.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            className="SceneItem__name"
            onDoubleClick={() => setEditing(true)}
            title="Doble click para renombrar"
          >
            {scene.name}
          </span>
        )}
        {date && <span className="SceneItem__date">{date}</span>}
      </div>
      <div className="SceneItem__actions">
        <FilledButton
          size="medium"
          label="Abrir"
          onClick={() => onOpen(scene)}
        />
        <button
          className="SceneItem__menuBtn"
          title="Renombrar"
          onClick={() => setEditing(true)}
        >
          ✏️
        </button>
        <button
          className="SceneItem__menuBtn SceneItem__menuBtn--danger"
          title={scene.type === "own" ? "Eliminar" : "Salir"}
          onClick={() => onDelete(scene)}
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

interface SceneManagerDialogProps {
  collabAPI: CollabAPI | null;
}

export const SceneManagerDialog = ({ collabAPI }: SceneManagerDialogProps) => {
  const [open, setOpen] = useAtom(sceneManagerOpenAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const setLoginOpen = useSetAtom(loginDialogOpenAtom);

  const [scenes, setScenes] = useState<UserScene[]>([]);
  const [loading, setLoading] = useState(false);
  const [joinMode, setJoinMode] = useState(false);
  const [joinLink, setJoinLink] = useState("");
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    if (open && currentUser) {
      setLoading(true);
      loadUserScenes()
        .then(setScenes)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [open, currentUser]);

  if (!open) {
    return null;
  }

  const close = () => {
    setOpen(false);
    setJoinMode(false);
    setJoinLink("");
    setJoinError("");
  };

  const handleCreateRoom = async () => {
    if (!collabAPI) {
      return;
    }
    close();
    await collabAPI.createRoom();
  };

  const handleOpen = (scene: UserScene) => {
    close();
    navigateToRoom(scene.room_id, scene.room_key);
  };

  const handleRename = async (scene: UserScene, newName: string) => {
    await updateUserSceneName(scene.id, newName);
    setScenes((prev) =>
      prev.map((s) => (s.id === scene.id ? { ...s, name: newName } : s)),
    );
  };

  const handleDelete = async (scene: UserScene) => {
    await deleteUserScene(scene.id);
    setScenes((prev) => prev.filter((s) => s.id !== scene.id));
  };

  const handleJoin = async () => {
    setJoinError("");
    const data = getCollaborationLinkData(joinLink.trim());
    if (!data) {
      setJoinError("Link inválido. Asegúrate de pegar el link completo.");
      return;
    }
    const { roomId, roomKey } = data;
    await saveUserScene({
      room_id: roomId,
      room_key: roomKey,
      name: `Escena compartida ${new Date().toLocaleDateString("es-ES")}`,
      type: "joined",
      last_visited_at: new Date().toISOString(),
    }).catch(console.error);
    if (collabAPI?.isCollaborating()) {
      collabAPI.stopCollaboration(false);
    }
    close();
    navigateToRoom(roomId, roomKey);
  };

  const ownScenes = scenes.filter((s) => s.type === "own");
  const joinedScenes = scenes.filter((s) => s.type === "joined");

  if (!currentUser) {
    return (
      <Dialog onCloseRequest={close} title="Mis escenas" size="small">
        <div className="SceneManager SceneManager--unauthenticated">
          <p>
            Inicia sesión para ver y gestionar tus escenas desde cualquier
            dispositivo.
          </p>
          <FilledButton
            size="large"
            label="Iniciar sesión"
            onClick={() => {
              close();
              setLoginOpen(true);
            }}
          />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog onCloseRequest={close} title="Mis escenas" size="regular">
      <div className="SceneManager">
        <div className="SceneManager__toolbar">
          <FilledButton
            size="medium"
            label="+ Nueva escena"
            onClick={handleCreateRoom}
          />
          <FilledButton
            size="medium"
            variant="outlined"
            label="Unirme a una escena"
            onClick={() => setJoinMode((v) => !v)}
          />
        </div>

        {joinMode && (
          <div className="SceneManager__join">
            <TextField
              label="Link de la escena"
              placeholder="https://dexcalidraw.deras.dev/#room=..."
              value={joinLink}
              onChange={setJoinLink}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            {joinError && (
              <p className="SceneManager__joinError">{joinError}</p>
            )}
            <FilledButton size="medium" label="Unirme" onClick={handleJoin} />
          </div>
        )}

        {loading ? (
          <p className="SceneManager__loading">Cargando escenas…</p>
        ) : (
          <div className="SceneManager__sections">
            <section className="SceneManager__section">
              <h3 className="SceneManager__sectionTitle">
                Mis escenas ({ownScenes.length})
              </h3>
              {ownScenes.length === 0 ? (
                <p className="SceneManager__empty">
                  Aún no has creado ninguna escena.
                </p>
              ) : (
                <div className="SceneManager__list">
                  {ownScenes.map((scene) => (
                    <SceneItem
                      key={scene.id}
                      scene={scene}
                      onOpen={handleOpen}
                      onRename={handleRename}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </section>

            {joinedScenes.length > 0 && (
              <section className="SceneManager__section">
                <h3 className="SceneManager__sectionTitle">
                  Escenas unidas ({joinedScenes.length})
                </h3>
                <div className="SceneManager__list">
                  {joinedScenes.map((scene) => (
                    <SceneItem
                      key={scene.id}
                      scene={scene}
                      onOpen={handleOpen}
                      onRename={handleRename}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};
