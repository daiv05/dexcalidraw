import PocketBase from "pocketbase";
import { reconcileElements } from "@excalidraw/excalidraw";
import { MIME_TYPES, toBrandedType } from "@excalidraw/common";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  decryptData,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { getSceneVersion } from "@excalidraw/element";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type {
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { getSyncableElements } from ".";

import type { SyncableExcalidrawElement } from ".";
import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

// ---------------------------------------------------------------------------
// PocketBase client (lazy singleton)
// ---------------------------------------------------------------------------

let pbClient: PocketBase | null = null;

export const getPb = (): PocketBase => {
  if (!pbClient) {
    pbClient = new PocketBase(import.meta.env.VITE_APP_POCKETBASE_URL);
  }
  return pbClient;
};

// ---------------------------------------------------------------------------
// Types & encoding
// ---------------------------------------------------------------------------

type PbScene = {
  id: string;
  room_id: string;
  scene_version: number;
  ciphertext: string; // base64-encoded ArrayBuffer
  iv: string; // base64-encoded Uint8Array
};

const toBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (b64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const json = JSON.stringify(elements);
  const encoded = new TextEncoder().encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);
  return { ciphertext: encryptedBuffer, iv };
};

const decryptElements = async (
  data: { ciphertext: string; iv: string },
  roomKey: string,
): Promise<readonly ExcalidrawElement[]> => {
  const ciphertext = fromBase64(data.ciphertext);
  const iv = fromBase64(data.iv);
  const decrypted = await decryptData(iv, ciphertext, roomKey);
  const decodedData = new TextDecoder("utf-8").decode(
    new Uint8Array(decrypted),
  );
  return JSON.parse(decodedData);
};

const createSceneDocument = async (
  elements: readonly SyncableExcalidrawElement[],
  roomKey: string,
): Promise<{ sceneVersion: number; ciphertext: string; iv: string }> => {
  const sceneVersion = getSceneVersion(elements);
  const { ciphertext, iv } = await encryptElements(roomKey, elements);
  return { sceneVersion, ciphertext: toBase64(ciphertext), iv: toBase64(iv) };
};

// ---------------------------------------------------------------------------
// Scene version cache (WeakMap keyed by socket)
// ---------------------------------------------------------------------------

class PbSceneVersionCache {
  private static cache = new WeakMap<Socket, number>();
  static get = (socket: Socket) => PbSceneVersionCache.cache.get(socket);
  static set = (
    socket: Socket,
    elements: readonly SyncableExcalidrawElement[],
  ) => {
    PbSceneVersionCache.cache.set(socket, getSceneVersion(elements));
  };
}

// ---------------------------------------------------------------------------
// Public API — same names as firebase.ts so Collab.tsx only changes import
// ---------------------------------------------------------------------------

export const isSavedToFirebase = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);
    return PbSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  return true;
};

export const saveFilesToFirebase = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array<ArrayBuffer> }[];
}) => {
  const pb = getPb();
  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        // Files are content-addressed — skip upload if already stored
        try {
          await pb
            .collection("collab_files")
            .getFirstListItem(pb.filter("file_id = {:id}", { id }));
          savedFiles.push(id);
          return;
        } catch {
          // not found — proceed to upload
        }

        const formData = new FormData();
        formData.append("room_id", prefix);
        formData.append("file_id", id);
        formData.append("data", new Blob([buffer]), id);
        await pb.collection("collab_files").create(formData);
        savedFiles.push(id);
      } catch (error) {
        erroredFiles.push(id);
        console.error("saveFilesToPocketBase error:", error);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

export const saveToFirebase = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;
  if (!roomId || !roomKey || !socket || isSavedToFirebase(portal, elements)) {
    return null;
  }

  const pb = getPb();

  // Read current stored scene for reconciliation
  let current: PbScene | null = null;
  try {
    current = await pb
      .collection("scenes")
      .getFirstListItem<PbScene>(pb.filter("room_id = {:id}", { id: roomId }));
  } catch {
    // not found — first save for this room
  }

  let reconciledElements: readonly SyncableExcalidrawElement[];

  if (!current) {
    reconciledElements = elements;
  } else {
    const prevElements = getSyncableElements(
      restoreElements(await decryptElements(current, roomKey), null),
    );
    reconciledElements = getSyncableElements(
      reconcileElements(
        elements,
        prevElements as OrderedExcalidrawElement[] as RemoteExcalidrawElement[],
        appState,
      ),
    );
  }

  const doc = await createSceneDocument(reconciledElements, roomKey);

  try {
    if (current) {
      await pb.collection("scenes").update(current.id, {
        scene_version: doc.sceneVersion,
        ciphertext: doc.ciphertext,
        iv: doc.iv,
      });
    } else {
      await pb.collection("scenes").create({
        room_id: roomId,
        scene_version: doc.sceneVersion,
        ciphertext: doc.ciphertext,
        iv: doc.iv,
      });
    }
  } catch (error) {
    console.error("saveToFirebase error:", error);
    return null;
  }

  PbSceneVersionCache.set(socket, reconciledElements);

  return toBrandedType<RemoteExcalidrawElement[]>(
    reconciledElements as SyncableExcalidrawElement[],
  );
};

export const loadFromFirebase = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const pb = getPb();

  let record: PbScene | null = null;
  try {
    record = await pb
      .collection("scenes")
      .getFirstListItem<PbScene>(pb.filter("room_id = {:id}", { id: roomId }));
  } catch {
    return null;
  }

  const elements = getSyncableElements(
    restoreElements(await decryptElements(record, roomKey), null, {
      deleteInvisibleElements: true,
    }),
  );

  if (socket) {
    PbSceneVersionCache.set(socket, elements);
  }

  return elements;
};

// ---------------------------------------------------------------------------
// User scene registry (user_scenes collection)
// ---------------------------------------------------------------------------

export interface UserScene {
  id: string;
  room_id: string;
  room_key: string;
  name: string;
  type: "own" | "joined";
  last_visited_at: string;
}

export const saveUserScene = async (
  scene: Omit<UserScene, "id">,
): Promise<void> => {
  const pb = getPb();
  if (!pb.authStore.isValid) {
    return;
  }

  let existing: UserScene | null = null;
  try {
    existing = await pb
      .collection("user_scenes")
      .getFirstListItem<UserScene>(
        pb.filter("room_id = {:roomId}", { roomId: scene.room_id }),
      );
  } catch {
    // not found — will create
  }

  if (existing) {
    await pb.collection("user_scenes").update(existing.id, {
      last_visited_at: scene.last_visited_at,
      name: scene.name,
    });
  } else {
    await pb.collection("user_scenes").create({
      ...scene,
      user_id: pb.authStore.model?.id ?? "",
    });
  }
};

export const loadUserScenes = async (): Promise<UserScene[]> => {
  const pb = getPb();
  if (!pb.authStore.isValid) {
    return [];
  }
  const userId = pb.authStore.model?.id ?? "";
  const records = await pb
    .collection("user_scenes")
    .getFullList<UserScene>({
      sort: "-last_visited_at",
      filter: pb.filter("user_id = {:userId}", { userId }),
    });
  return records;
};

export const updateUserSceneName = async (
  recordId: string,
  name: string,
): Promise<void> => {
  const pb = getPb();
  await pb.collection("user_scenes").update(recordId, { name });
};

export const deleteUserScene = async (recordId: string): Promise<void> => {
  const pb = getPb();
  await pb.collection("user_scenes").delete(recordId);
};

export const loadFilesFromFirebase = async (
  _prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const pb = getPb();
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const record = await pb
          .collection("collab_files")
          .getFirstListItem(pb.filter("file_id = {:id}", { id }));

        const fileUrl = pb.files.getURL(record, record.data as string);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const { data: decompressed, metadata } =
          await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            {
              decryptionKey,
            },
          );

        const dataURL = new TextDecoder().decode(decompressed) as DataURL;

        loadedFiles.push({
          mimeType: metadata.mimeType || MIME_TYPES.binary,
          id,
          dataURL,
          created: metadata?.created || Date.now(),
          lastRetrieved: metadata?.created || Date.now(),
        });
      } catch (error) {
        erroredFiles.set(id, true);
        console.error("loadFilesFromPocketBase error:", error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};
