import type { Timestamp } from "firebase/firestore";

export interface MeetingRoom {
  id: string;
  code: string;
  name: string;
  hostUid: string;
  hostName: string;
  createdAt: Timestamp;
}

export interface ChatMessage {
  id: string;
  text: string;
  uid: string;
  displayName: string;
  createdAt: Timestamp;
}
