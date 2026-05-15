import { atom } from "../app-jotai";

import type { RecordModel } from "pocketbase";

export const currentUserAtom = atom<RecordModel | null>(null);
export const authLoadingAtom = atom(true);
export const loginDialogOpenAtom = atom(false);
